// @ts-check
import { BRANCH_KEYS, EVENT_TYPE_ALLOWLIST, PAYLOAD_ACTIONS, apiBody } from './grammar.js';
import { ruleLink } from './context.js';
import { bucketOverlaps } from './predicates.js';
import { definesName, expressionKeysOf, forEachSourceBody, readsOuterSelf, refsIn } from './walk.js';
import { isPlainObject } from '../../../util.js';

/**
 * The paths of each `fireEvent` no enclosing `if` guards by testing a detector name that a `define`
 * in that `if`'s branch binds. With `doneEnds`, a `fireEvent` in a sequence holding `{"done": true}`,
 * or beside `"done": true`, is guarded too, as the detector is done once that run ends.
 *
 * @param {unknown} actions
 * @param {string} path - the path of `actions`
 * @param {boolean} doneEnds
 * @returns {string[]}
 */
function unguardedEvents(actions, path, doneEnds) {
    /** @type {string[]} */
    const found = [];
    /** @param {unknown} node */
    const isDone = (node) => isPlainObject(node) && node.done === true;
    /**
     * @param {unknown} node
     * @param {string} nodePath
     * @param {Array<{ names: string[], branch: unknown }>} guards - each enclosing `if` branch, with the detector names its condition reads
     * @param {boolean} ended - inside a sequence that makes the detector done
     */
    const visit = (node, nodePath, guards, ended) => {
        if (Array.isArray(node)) {
            const ends = ended || (doneEnds && node.some(isDone));
            node.forEach((entry, index) => visit(entry, `${nodePath}[${index}]`, guards, ends));
            return;
        }
        if (!isPlainObject(node)) return;
        const guarded =
            ended || (doneEnds && isDone(node)) || guards.some(({ names, branch }) => names.some((name) => definesName(branch, name)));
        if ('fireEvent' in node && !guarded) found.push(`${nodePath}.fireEvent`);
        if ('if' in node) {
            const names = [
                ...refsIn(node.if),
            ].filter((name) => name.startsWith('this.'));
            for (const branch of BRANCH_KEYS) {
                if (branch in node)
                    visit(
                        node[branch],
                        `${nodePath}.${branch}`,
                        [
                            ...guards,
                            { names, branch: node[branch] },
                        ],
                        ended,
                    );
            }
            return;
        }
        for (const [
            key,
            value,
        ] of Object.entries(node)) {
            if (key !== 'fireEvent') visit(value, `${nodePath}.${key}`, guards, ended);
        }
    };
    visit(actions, path, [], false);
    return found;
}

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
    return unguardedEvents(detector.actions, `${path}.actions`, false).map(
        (eventPath) =>
            `${eventPath}: sends its event on every run, since the detector has no \`match\` and no enclosing \`if\` tests a detector name its branch binds${ruleLink('events')}`,
    );
}

/**
 * Errors on a `fireEvent` that sends its event every time the page hides: in a detector with no
 * `match` that observes `visibilitychange` or `pagehide`, one that neither an enclosing `if` on a
 * detector name its branch binds nor a sequence with `{"done": true}` guards.
 *
 * @param {Record<string, any>} detector
 * @param {string} path
 * @returns {string[]}
 */
export function pageHidingEventErrors(detector, path) {
    if (!isPlainObject(detector) || 'match' in detector) return [];
    const on = isPlainObject(detector.triggers) && isPlainObject(detector.triggers.observe) ? detector.triggers.observe.on : undefined;
    const hiding = Array.isArray(on)
        ? on
              .filter((body) => isPlainObject(body) && typeof body.event === 'string' && EVENT_TYPE_ALLOWLIST[body.event]?.pageHiding)
              .map((body) => body.event)
        : [];
    if (!hiding.length) return [];
    return unguardedEvents(detector.actions, `${path}.actions`, true).map(
        (eventPath) =>
            `${eventPath}: the detector runs each time the page hides (${hiding.join(', ')}), and a navigation away runs it on both, so the event goes inside an \`if\` on a detector name its branch binds, or in a sequence with \`{"done": true}\``,
    );
}

/**
 * Warnings on payload buckets that overlap in a way that is not an error: the earlier bucket names
 * the values both hold for.
 *
 * @param {Record<string, any>} detector
 * @param {string} path
 * @returns {string[]}
 */
export function bucketWarnings(detector, path) {
    if (!isPlainObject(detector)) return [];
    /** @type {string[]} */
    const warnings = [];
    /**
     * @param {unknown} node
     * @param {string} nodePath
     */
    const visit = (node, nodePath) => {
        if (Array.isArray(node)) {
            node.forEach((entry, index) => visit(entry, `${nodePath}[${index}]`));
            return;
        }
        if (!isPlainObject(node)) return;
        for (const [
            key,
            value,
        ] of Object.entries(node)) {
            const childPath = `${nodePath}.${key}`;
            if (PAYLOAD_ACTIONS.includes(key) && isPlainObject(value) && isPlainObject(value.data)) {
                for (const [
                    field,
                    spec,
                ] of Object.entries(value.data)) {
                    if (!isPlainObject(spec)) continue;
                    for (const warning of bucketOverlaps(spec.buckets).warnings)
                        warnings.push(`${childPath}.data.${field}.buckets: ${warning}${ruleLink('bucketOverlap')}`);
                }
            } else {
                visit(value, childPath);
            }
        }
    };
    visit(detector.actions, `${path}.actions`);
    return warnings;
}

/**
 * Warnings on a walk from each item of a `where` or `field` that no `if` inside it guards: a `text`
 * source rooted at the item. Matched elements nest, so each walk covers nodes an enclosing item's
 * walk covers again. An `element` source runs one native query from each item, and gets no warning.
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
            `${nodePath}: walks the page from each item of the enclosing \`where\` or \`field\`, and nested items walk the same nodes again; test something cheaper in an \`if\` first${ruleLink('itemSources')}`,
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
            if (key === 'element' || key === 'text') {
                forEachSourceBody(value, childPath, (body, bodyPath) => {
                    if (key === 'text' && exposed && 'root' in body && readsOuterSelf(body.root)) warn(`${bodyPath}.root`);
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
