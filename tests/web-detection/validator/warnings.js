import { BRANCH_KEYS, apiBody } from './grammar.js';
import { definesName, expressionKeysOf, forEachTextLeaf, isPlainObject, readsOuterSelf, refsIn } from './walk.js';

/**
 * Warnings on a `fireEvent` that sends its event on every run: in a detector with no `match`, one no
 * enclosing `if` guards by testing a detector name that a `define` in that `if`'s branch binds.
 *
 * @param {Record<string, any>} detector
 * @param {string} path
 * @returns {string[]}
 */
export function repeatedEventWarnings(detector, path) {
    if (!isPlainObject(detector) || 'match' in detector) return [];
    /** @type {string[]} */
    const warnings = [];
    /**
     * @param {unknown} node
     * @param {string} nodePath
     * @param {Array<{ names: string[], branch: unknown }>} guards - each enclosing `if` branch, with the detector names its condition reads
     */
    const visit = (node, nodePath, guards) => {
        if (Array.isArray(node)) {
            node.forEach((entry, index) => visit(entry, `${nodePath}[${index}]`, guards));
            return;
        }
        if (!isPlainObject(node)) return;
        if ('fireEvent' in node && !guards.some(({ names, branch }) => names.some((name) => definesName(branch, name))))
            warnings.push(
                `${nodePath}.fireEvent: sends its event on every run, since the detector has no \`match\` and no enclosing \`if\` tests a detector name its branch binds`,
            );
        if ('if' in node) {
            const names = [
                ...refsIn(node.if),
            ].filter((name) => name.startsWith('this.'));
            for (const branch of BRANCH_KEYS) {
                if (branch in node)
                    visit(node[branch], `${nodePath}.${branch}`, [
                        ...guards,
                        { names, branch: node[branch] },
                    ]);
            }
            return;
        }
        for (const [
            key,
            value,
        ] of Object.entries(node)) {
            if (key !== 'fireEvent') visit(value, `${nodePath}.${key}`, guards);
        }
    };
    visit(detector.actions, `${path}.actions`, []);
    return warnings;
}

/** Methods on an element that walk its subtree, or for `closest` its ancestors. */
const ITEM_WALK_METHODS = [
    'querySelector',
    'querySelectorAll',
    'closest',
];

/**
 * Warnings on a walk from each item of a `where` or `field` that no `if` inside it guards: an
 * `element` or `text` source rooted at the item, or a call of ITEM_WALK_METHODS on it. Matched
 * elements nest, so each walk covers nodes an enclosing item's walk covers again.
 *
 * @param {Record<string, any>} detector
 * @param {string} path
 * @returns {string[]}
 */
export function itemWalkWarnings(detector, path) {
    if (!isPlainObject(detector)) return [];
    /** @type {string[]} */
    const warnings = [];
    /** @param {string} nodePath */
    const warn = (nodePath) =>
        warnings.push(
            `${nodePath}: walks the page from each item of the enclosing \`where\` or \`field\`, and nested items walk the same nodes again; test something cheaper in an \`if\` first`,
        );
    /**
     * A `field`, `using` or the body of `self`: a path, `{"path", "args"}` or an expression.
     *
     * @param {unknown} read
     * @param {string} readPath
     * @param {boolean} exposed
     */
    const visitRead = (read, readPath, exposed) => {
        if (isPlainObject(read) && expressionKeysOf(read).length) {
            visit(read, readPath, true);
            return;
        }
        const body = typeof read === 'string' ? { path: read } : read;
        if (!isPlainObject(body)) return;
        if (exposed && typeof body.path === 'string' && ITEM_WALK_METHODS.includes(body.path.split('.')[0])) warn(readPath);
        visit(body.args, `${readPath}.args`, exposed);
        visit(body.where, `${readPath}.where`, true);
        if ('field' in body) visitRead(body.field, `${readPath}.field`, true);
    };
    /**
     * @param {unknown} node
     * @param {string} nodePath
     * @param {boolean} exposed - inside a `where` or `field`, with no `if` inside it above
     */
    const visit = (node, nodePath, exposed) => {
        if (Array.isArray(node)) {
            node.forEach((entry, index) => visit(entry, `${nodePath}[${index}]`, exposed));
            return;
        }
        if (!isPlainObject(node)) return;
        for (const [
            key,
            value,
        ] of Object.entries(node)) {
            const childPath = `${nodePath}.${key}`;
            if ((key === 'where' || key === 'field') && 'iter' in node) {
                // The stages beside `iter` run once per item
                if (key === 'where') visit(value, childPath, true);
                else visitRead(value, childPath, true);
            } else if (key === 'element' || key === 'text') {
                forEachTextLeaf(value, childPath, (body, bodyPath) => {
                    if (exposed && 'root' in body && readsOuterSelf(body.root)) warn(`${bodyPath}.root`);
                    visit(body.root, `${bodyPath}.root`, exposed);
                    visit(body.where, `${bodyPath}.where`, true);
                    if ('field' in body) visitRead(body.field, `${bodyPath}.field`, true);
                });
            } else if (key === 'api') {
                const body = apiBody(value);
                if (!isPlainObject(body)) continue;
                visit(body.args, `${childPath}.args`, exposed);
                visit(body.where, `${childPath}.where`, true);
                if ('field' in body) visitRead(body.field, `${childPath}.field`, true);
            } else if (key === 'self' || key === 'field' || key === 'using') {
                visitRead(value, childPath, exposed);
            } else {
                visit(value, childPath, exposed && !BRANCH_KEYS.includes(key));
            }
        }
    };
    visit(detector.match, `${path}.match`, false);
    visit(detector.actions, `${path}.actions`, false);
    return warnings;
}
