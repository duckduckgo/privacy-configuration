// @ts-check
import { isDeepStrictEqual } from 'node:util';
import { child, expectPosition, fail } from './context.js';
import {
    ACTION_KEYS,
    BRANCH_KEYS,
    COMPARISON_OPERATORS,
    DEFINE_NAME_PATTERN,
    LIST_CONDITION,
    OPERATOR_KEYS,
    SOURCE_KEYS,
    apiBody,
} from './grammar.js';
import { checkPayloadSpec, checkPredicate, isLiteral } from './predicates.js';
import { checkApi, checkFieldRead } from './reads.js';
import {
    UNKNOWN,
    allows,
    describeType,
    isList,
    itemOf,
    mergeTypes,
    selectorInterfaces,
    selectorNamesCustomElement,
    typeOf,
} from './types.js';
import { asArray, expressionKeysOf, forEachSourceBody, readsOuterSelf, refsIn } from './walk.js';
import { isPlainObject } from '../../../util.js';
import { checkTextExpressions, selectsFromDocument } from './xpath.js';

/**
 * @typedef {import('./context.js').Context} Context
 * @typedef {import('./types.js').Position} Position
 * @typedef {import('./context.js').Scope} Scope
 * @typedef {import('./types.js').StaticType} StaticType
 */

/**
 * Whether a `root` entry is `{"self": {}}`, the item a `where` or `field` binds, which is never absent.
 *
 * @param {unknown} entry
 * @returns {boolean}
 */
function isBoundItem(entry) {
    return (
        isPlainObject(entry) && Object.keys(entry).join() === 'self' && isPlainObject(entry.self) && Object.keys(entry.self).length === 0
    );
}

/**
 * An expression's value, without its `is` test.
 *
 * @param {Record<string, any>} node
 * @returns {Record<string, any>}
 */
function valueNode(node) {
    return Object.fromEntries(
        Object.entries(node).filter(
            ([
                key,
            ]) => key !== 'is',
        ),
    );
}

/**
 * The scope inside a `where` or `field`, where `self` reads each item or value of the given type.
 *
 * @param {Scope} scope
 * @param {StaticType} type
 * @returns {Scope}
 */
export function bindItem(scope, type) {
    return { ...child(scope), bound: type, inItem: true };
}

/**
 * Whether an operand of `any`, `all`, `none`, `sum` or `mul` is in spread position,
 * contributing each item of a list: a source, a ref to a name bound to a list, or an `expr` over one.
 * Under `any`, `all` and `none`, `element` without `field` and `text`, and a name bound to one, are
 * presence leaves, booleans.
 *
 * @param {unknown} node
 * @param {'number' | 'boolean'} single - the position of an operand that is not spread
 * @param {Context} ctx
 * @returns {boolean}
 */
function providesValues(node, single, ctx) {
    if (!isPlainObject(node) || 'is' in node) return false;
    // `using` reads one value from the expression beside it
    if ('using' in node) return false;
    const keys = expressionKeysOf(node);
    if (keys.length !== 1) return false;
    const body = node[keys[0]];
    switch (keys[0]) {
        case 'api':
            return true;
        case 'text':
            return single === 'number';
        case 'element': {
            let hasField = false;
            forEachSourceBody(body, '', (leaf) => {
                hasField ||= 'field' in leaf;
            });
            return hasField || single === 'number';
        }
        case 'expr':
            // Over an array, a list
            return Array.isArray(body) || providesValues(body, single, ctx);
        case 'ref': {
            const type = typeof body === 'string' ? nameType(body, ctx) : undefined;
            return type?.list !== undefined && !(type.leaf && single === 'boolean');
        }
        case 'if':
            // The branch taken is read as the operand would be
            return branchResults(node).some((branch) => providesValues(branch, single, ctx));
        default:
            return false;
    }
}

/**
 * The expression each branch of an `if` gives: the branch, or a sequence's last element.
 *
 * @param {Record<string, unknown>} node - the object holding `if`
 * @returns {unknown[]}
 */
function branchResults(node) {
    return [
        'then',
        'else',
    ]
        .filter((key) => key in node)
        .map((key) => (Array.isArray(node[key]) ? node[key][node[key].length - 1] : node[key]));
}

/**
 * Whether a predicate compares the value: a literal, `eq`, `in`, `lt`, `lte`, `gt` or `gte` at its top
 * level or in its `any`, `all` or `none` entries. A selected list under such a predicate
 * gives its one item, and under any other the list, as an array. Mirrors `scalar` in C-S-S
 * predicates.js.
 *
 * @param {unknown} predicate
 * @returns {boolean}
 */
function isScalarPredicate(predicate) {
    if (isLiteral(predicate)) return true;
    if (!isPlainObject(predicate)) return false;
    return Object.keys(predicate).some(
        (key) =>
            key === 'eq' ||
            key === 'in' ||
            COMPARISON_OPERATORS.includes(key) ||
            (OPERATOR_KEYS.includes(key) && asArray(predicate[key]).some(isScalarPredicate)),
    );
}

/**
 * What a predicate under `is`, `when` or a bucket tests, for a value of the given type.
 *
 * @param {StaticType} type
 * @param {unknown} predicate
 * @param {Context} ctx
 * @param {string} path
 * @returns {StaticType}
 */
export function predicateSubject(type, predicate, ctx, path) {
    return type.list && isScalarPredicate(predicate) ? itemOf(type) : type;
}

/**
 * Check an expression fills a position, and return what config shows about its value.
 *
 * @param {unknown} node
 * @param {Position} position
 * @param {Scope} scope
 * @param {Context} ctx
 * @param {string} path
 * @returns {StaticType}
 */
export function checkExpr(node, position, scope, ctx, path) {
    if (typeof node === 'number') {
        expectPosition(ctx, path, 'A number', position, [
            'value',
            'number',
        ]);
        return typeOf('number');
    }
    if (typeof node === 'boolean') {
        expectPosition(ctx, path, 'A boolean', position, [
            'boolean',
            'value',
        ]);
        return typeOf('boolean');
    }
    if (typeof node === 'string' || node === null) {
        // In `root`, a string is a selector and `null` no node
        expectPosition(ctx, path, typeof node === 'string' ? 'A string' : '`null`', position, [
            'value',
            'root',
        ]);
        if (node === null) return typeOf('null');
        const type = typeOf('string');
        if (Number.isNaN(Number(node))) type.nonNumericStrings = true;
        return type;
    }
    if (Array.isArray(node)) {
        // The key holding an array decides what it means, and an array is never an expression
        fail(ctx, path, 'an array is not an expression: `{"expr": [...]}` gives a list, and `{"any": [...]}` an OR');
        return UNKNOWN;
    }
    if (!isPlainObject(node)) {
        fail(ctx, path, `${JSON.stringify(node)} is not an expression`);
        return UNKNOWN;
    }

    const keys = Object.keys(node);
    if (keys.some((key) => ACTION_KEYS.includes(key))) return checkActions(node, position, scope, ctx, path);
    for (const key of keys) {
        if (BRANCH_KEYS.includes(key) && !('if' in node)) fail(ctx, `${path}.${key}`, `\`${key}\` sits beside \`if\` only`);
    }
    const exprKeys = expressionKeysOf(node);
    const hasUsing = 'using' in node;
    if (exprKeys.length === 0) {
        fail(
            ctx,
            path,
            hasUsing
                ? '`using` reads from an expression, and this object has no expression key'
                : 'an object expression needs an expression key',
        );
        return UNKNOWN;
    }
    // Clients deliver an object's keys in no guaranteed order, so an object holds one expression
    if (exprKeys.length > 1) {
        fail(ctx, path, `an object takes one expression key, and this one has ${exprKeys.join(', ')}: \`{"all": [...]}\` ANDs several`);
        return UNKNOWN;
    }
    const key = exprKeys[0];
    if (scope.inItem && SOURCE_KEYS.includes(key) && !readsOuterSelf({ [key]: node[key] }) && refsIn(node[key]).size === 0) {
        fail(
            ctx,
            `${path}.${key}`,
            'reads neither `self` nor a `ref`, so it gives every item of the enclosing `where` or `field` the same value: `define` it before',
        );
    }
    const hasIs = 'is' in node;
    if (hasIs && position !== 'boolean' && position !== 'value')
        fail(ctx, path, `\`is\` gives a boolean, so it sits in boolean or value position, not ${position} position`);

    // With `is`, the expression computes a value for the predicate
    const valuePosition = hasIs ? 'value' : position;
    // With `using`, the expression keys give the value `using` reads from, in value position as C-S-S compiles it
    const keyPosition = hasUsing ? 'value' : valuePosition;
    let type = checkExprKey(key, node, keyPosition, scope, ctx, path);
    if (hasUsing) {
        type = checkUsing(node.using, type, valuePosition, { ...scope, bound: type }, ctx, path);
    }
    if (hasIs) {
        checkPredicate(node.is, 'value', predicateSubject(type, node.is, ctx, `${path}.is`), child(scope), ctx, `${path}.is`);
        return typeOf('boolean');
    }
    return type;
}

/**
 * The body of `actions`, `then` or `else`: an expression, or a sequence of them, whose last element
 * takes the position and the others value position.
 *
 * @param {unknown} node
 * @param {Position} position
 * @param {Scope} scope
 * @param {Context} ctx
 * @param {string} path
 * @returns {StaticType}
 */
export function checkBody(node, position, scope, ctx, path) {
    if (!Array.isArray(node)) return checkExpr(node, position, scope, ctx, path);
    if (node.length === 0) return UNKNOWN;
    /** @type {StaticType} */
    let type = UNKNOWN;
    node.forEach((element, index) => {
        type = checkExpr(element, index === node.length - 1 ? position : 'value', scope, ctx, `${path}[${index}]`);
    });
    return type;
}

/**
 * An object of action keys, run in config order. An action gives `undefined`, in value position only.
 *
 * @param {Record<string, any>} node
 * @param {Position} position
 * @param {Scope} scope
 * @param {Context} ctx
 * @param {string} path
 * @returns {StaticType}
 */
function checkActions(node, position, scope, ctx, path) {
    if (scope.inMatch) fail(ctx, path, '`match` reads the page only, and holds no action');
    if (position !== 'value') fail(ctx, path, `an action gives \`undefined\`, so it sits in value position only, not ${position} position`);
    for (const [
        key,
        body,
    ] of Object.entries(node)) {
        const actionPath = `${path}.${key}`;
        if (!ACTION_KEYS.includes(key)) {
            fail(ctx, actionPath, `an action sits beside no expression key or modifier, and "${key}" is not an action`);
            continue;
        }
        if (key === 'define') {
            checkDefine(body, scope, ctx, actionPath);
            continue;
        }
        if (scope.inItem) fail(ctx, actionPath, `\`${key}\` inside a \`where\` or \`field\` runs once per item: run it outside`);
        if (isPlainObject(body) && 'data' in body)
            checkPayloadSpec(body.data, /** @type {'fireEvent' | 'breakageReportData'} */ (key), ctx, `${actionPath}.data`, child(scope));
    }
    return typeOf('undefined');
}

/**
 * `define`: each value in value position, bound before the next is computed.
 *
 * @param {unknown} define
 * @param {Scope} scope
 * @param {Context} ctx
 * @param {string} path
 */
function checkDefine(define, scope, ctx, path) {
    if (!isPlainObject(define)) return;
    for (const [
        name,
        value,
    ] of Object.entries(define)) {
        const namePath = `${path}.${name}`;
        if (!DEFINE_NAME_PATTERN.test(name)) fail(ctx, namePath, `name does not match ${DEFINE_NAME_PATTERN}`);
        // The top-level `all` of a bound value guards its operands, as a condition's does
        const type = checkExpr(value, 'value', { ...scope, conditionRoot: true }, ctx, namePath);
        if (name.startsWith('this.')) {
            if (ctx.hasMatch)
                fail(ctx, namePath, `a detector with \`match\` runs \`actions\` once, so it binds no detector name: "${name}"`);
            const earlier = ctx.collected.get(name);
            ctx.collected.set(
                name,
                earlier
                    ? mergeTypes([
                          earlier,
                          type,
                      ])
                    : type,
            );
        } else {
            ctx.runNames.set(name, type);
        }
    }
}

/**
 * The type of a name at this point of the walk: a run name a `define` may have bound, or a detector
 * name a `define` in the detector binds. `undefined` when neither.
 *
 * @param {string} name
 * @param {Context} ctx
 * @returns {StaticType | undefined}
 */
function nameType(name, ctx) {
    return name.startsWith('this.') ? ctx.detectorNames.get(name) : ctx.runNames.get(name);
}

/**
 * Check a name's type in the position a `ref` reads it in: the condition leaf holds in boolean
 * position when it has an item, and a selected list gives its one item in number position.
 *
 * @param {string} name
 * @param {StaticType} type
 * @param {Position} position
 * @param {Context} ctx
 * @param {string} path
 * @returns {StaticType}
 */
function refType(name, type, position, ctx, path) {
    if (position === 'boolean') {
        // The condition leaf holds when it has an item. Any other selected list is refused, as the
        // `element` with `field` or `api` with `where` bound to the name is
        if (type.list === 'selected' && !type.leaf) fail(ctx, path, `"${name}" is bound to a selected list of values: ${LIST_CONDITION}`);
        if (type.list === 'selected') return typeOf('boolean');
        if ((type.list === undefined && !allows(type, 'boolean')) || type.list === 'array')
            fail(ctx, path, `boolean position takes a boolean, and config types the name as ${describeType(type)}`);
        return typeOf('boolean');
    }
    if (
        position === 'list' &&
        type.list === undefined &&
        type.types !== null &&
        !type.types.includes('array') &&
        !type.types.includes('object')
    )
        fail(ctx, path, `list position takes a list, and config types the name as ${describeType(type)}`);
    return sourceType(itemOf(type), type.list, position, ctx, path);
}

/**
 * The expressions a condition makes guards for what it holds: the condition, and the operands of its
 * top-level `all`.
 *
 * @param {unknown} condition
 * @returns {unknown[]}
 */
function guardsOf(condition) {
    if (isPlainObject(condition) && expressionKeysOf(condition).join() === 'all' && !('is' in condition) && !('using' in condition))
        return asArray(condition.all);
    return [
        condition,
    ];
}

/**
 * Check each entry of a scoped expression's `root` has a guard, so an absent region is not read as an
 * empty one. In `actions`, the entry is a `ref` to a bound name, and the guard a `ref` to it, with
 * `is` unless the name is bound to an `element` or `text` source. In `match`, the guard repeats the
 * entry, with `is` unless it is an `element` or `text` source.
 *
 * @param {unknown} root
 * @param {Scope} scope
 * @param {Context} ctx
 * @param {string} path - the path of the body holding `root`
 */
function checkRootGuard(root, scope, ctx, path) {
    asArray(root).forEach((entry, index) => {
        if (isBoundItem(entry)) return;
        const entryPath = Array.isArray(root) ? `${path}.root[${index}]` : `${path}.root`;
        if (scope.inMatch) {
            const guard = scope.guards.find((candidate) => isPlainObject(candidate) && isDeepStrictEqual(valueNode(candidate), entry));
            if (!guard) {
                fail(
                    ctx,
                    entryPath,
                    "`root` needs a guard: the root's expression as an operand of the top-level `all` of the condition reading it, or in the condition of an enclosing `if`",
                );
                return;
            }
            if (!isConditionLeaf(entry) && !('is' in /** @type {Record<string, any>} */ (guard)))
                fail(
                    ctx,
                    entryPath,
                    'the guard of this root is not an `element` or `text` source, so it carries `is`, such as "is": {"type": "object"}',
                );
            return;
        }
        const name = isPlainObject(entry) && Object.keys(entry).join() === 'ref' ? entry.ref : undefined;
        const guard =
            typeof name === 'string'
                ? scope.guards.find(
                      (candidate) =>
                          isPlainObject(candidate) &&
                          candidate.ref === name &&
                          Object.keys(candidate).every((key) => key === 'ref' || key === 'is'),
                  )
                : undefined;
        if (!guard) {
            fail(
                ctx,
                entryPath,
                '`root` needs a guard: the root a `ref` to a name bound with `define`, and a `ref` to it as an operand of the top-level `all` of the condition reading it, or in the condition of an enclosing `if`',
            );
            return;
        }
        if (!('is' in /** @type {Record<string, any>} */ (guard)) && !nameType(/** @type {string} */ (name), ctx)?.leaf)
            fail(
                ctx,
                entryPath,
                `the guard "${name}" is not bound to an \`element\` or \`text\` source, so it carries \`is\`, such as "is": {"type": "object"}`,
            );
    });
}

/**
 * Whether an expression is the condition leaf: `element` without `field`, or `text`.
 *
 * @param {unknown} node
 * @returns {boolean}
 */
function isConditionLeaf(node) {
    if (!isPlainObject(node) || 'using' in node || 'is' in node) return false;
    const keys = expressionKeysOf(node);
    if (keys.length !== 1 || (keys[0] !== 'element' && keys[0] !== 'text')) return false;
    let hasField = false;
    forEachSourceBody(node[keys[0]], '', (leaf) => {
        hasField ||= 'field' in leaf;
    });
    return !hasField;
}

/**
 * The type of an expression key's value, checked in its position.
 *
 * @param {string} key
 * @param {Record<string, any>} holder - the expression object holding the key
 * @param {Position} position
 * @param {Scope} scope
 * @param {Context} ctx
 * @param {string} holderPath - the path of the expression object
 * @returns {StaticType}
 */
function checkExprKey(key, holder, position, scope, ctx, holderPath) {
    const body = holder[key];
    const path = `${holderPath}.${key}`;
    switch (key) {
        case 'element':
        case 'text':
            return checkConditionSource(key, body, position, scope, ctx, path);
        case 'api':
            return checkApi(apiBody(body), position, scope, ctx, path, undefined, ctx.functionApis.has(holder));
        case 'self':
            return checkSelf(body, position, scope, ctx, path);
        case 'expr':
            return checkExprBody(body, position, scope, ctx, path);
        case 'only':
            return checkOnly(body, position, scope, ctx, path);
        case 'sum':
        case 'mul':
            return checkArith(key, body, position, scope, ctx, path);
        case 'div':
            return checkDiv(body, position, scope, ctx, path);
        case 'any':
        case 'all':
        case 'none':
            return checkLogic(key, body, position, scope, ctx, path);
        case 'if':
            return checkIf(holder, position, scope, ctx, holderPath);
        case 'ref':
            return checkRef(body, position, scope, ctx, path);
        default:
            return UNKNOWN;
    }
}

/**
 * `self`: the value `using`, `where` or `field` binds, or a read from it.
 *
 * @param {unknown} body
 * @param {Position} position
 * @param {Scope} scope
 * @param {Context} ctx
 * @param {string} path
 * @returns {StaticType}
 */
function checkSelf(body, position, scope, ctx, path) {
    if (!scope.bound) {
        fail(ctx, path, '`self` reads from `using`, `where` or `field`, and none encloses it');
        return UNKNOWN;
    }
    const selfBody = apiBody(body);
    if (isPlainObject(selfBody) && Object.keys(selfBody).length === 0) {
        // The bound value itself
        if (position !== 'boolean') return sourceType(itemOf(scope.bound), scope.bound.list, position, ctx, path);
        if (!allows(scope.bound, 'boolean'))
            fail(ctx, path, `boolean position takes a boolean, and config types the value as ${describeType(scope.bound)}`);
        return typeOf('boolean');
    }
    return checkApi(selfBody, position, scope, ctx, path, scope.bound, false, true);
}

/**
 * `expr`: over an array, an array of the entries' values; otherwise its operand's value.
 *
 * @param {unknown} body
 * @param {Position} position
 * @param {Scope} scope
 * @param {Context} ctx
 * @param {string} path
 * @returns {StaticType}
 */
function checkExprBody(body, position, scope, ctx, path) {
    if (Array.isArray(body)) {
        // An array of the entries' values, which `length`, `at` and `apply` read. It stays an
        // array: never one number, nor a boolean
        expectPosition(ctx, path, '`expr` over an array, a list,', position, [
            'value',
            'list',
            'spread',
            'root',
        ]);
        const entries = body.map((entry, index) => checkExpr(entry, 'value', child(scope), ctx, `${path}[${index}]`));
        const item = entries.length ? mergeTypes(entries.map(itemOf)) : UNKNOWN;
        return position === 'spread' ? item : { ...item, list: 'array' };
    }
    // Its operand's value in its own position. An operand with `is` gives a boolean
    if (isPlainObject(body) && 'is' in body) {
        expectPosition(ctx, path, '`expr` over `is`', position, [
            'boolean',
            'value',
        ]);
        return checkExpr(body, 'boolean', scope, ctx, path);
    }
    return checkExpr(body, position, scope, ctx, path);
}

/**
 * `only`: the one item of a list.
 *
 * @param {unknown} body
 * @param {Position} position
 * @param {Scope} scope
 * @param {Context} ctx
 * @param {string} path
 * @returns {StaticType}
 */
function checkOnly(body, position, scope, ctx, path) {
    expectPosition(ctx, path, '`only`', position, [
        'boolean',
        'value',
        'number',
        'list',
        'root',
    ]);
    const type = itemOf(checkExpr(body, 'list', child(scope), ctx, path));
    if (position === 'number' && !allows(type, 'number'))
        fail(ctx, path, `number position takes a number, and config types the value as ${describeType(type)}`);
    if (position === 'boolean' && !allows(type, 'boolean'))
        fail(ctx, path, `boolean position takes a boolean, and config types the value as ${describeType(type)}`);
    if (position === 'list' && type.types !== null && !type.types.includes('array') && !type.types.includes('object'))
        fail(ctx, path, `list position takes a list, and config types the value as ${describeType(type)}`);
    return type;
}

/**
 * `sum` and `mul`: a number from number operands, each item of a list operand counting as one.
 *
 * @param {'sum' | 'mul'} key
 * @param {unknown} body
 * @param {Position} position
 * @param {Scope} scope
 * @param {Context} ctx
 * @param {string} path
 * @returns {StaticType}
 */
function checkArith(key, body, position, scope, ctx, path) {
    expectPosition(ctx, path, `\`${key}\``, position, [
        'value',
        'number',
    ]);
    let nan = false;
    asArray(body).forEach((operand, index) => {
        const operandPath = Array.isArray(body) ? `${path}[${index}]` : path;
        const listed = providesValues(operand, 'number', ctx);
        const type = checkExpr(
            operand,
            listed ? 'spread' : 'number',
            { ...child(scope), spreadOf: listed ? 'number' : undefined },
            ctx,
            operandPath,
        );
        if (listed && !allows(type, 'number'))
            fail(ctx, operandPath, `\`${key}\` takes numbers, and config types the values as ${describeType(type)}`);
        nan ||= type.nan;
    });
    return {
        types: [
            'number',
        ],
        nan,
    };
}

/**
 * `div`: a number from two number operands.
 *
 * @param {unknown} body
 * @param {Position} position
 * @param {Scope} scope
 * @param {Context} ctx
 * @param {string} path
 * @returns {StaticType}
 */
function checkDiv(body, position, scope, ctx, path) {
    expectPosition(ctx, path, '`div`', position, [
        'value',
        'number',
    ]);
    if (!Array.isArray(body) || body.length !== 2) {
        return {
            types: [
                'number',
            ],
            nan: true,
        };
    }
    body.forEach((operand, index) => checkExpr(operand, 'number', child(scope), ctx, `${path}[${index}]`));
    return {
        types: [
            'number',
        ],
        nan: true,
    };
}

/**
 * `any`, `all` and `none`: a boolean from boolean operands, each item of a list operand counting
 * as one.
 *
 * @param {'any' | 'all' | 'none'} key
 * @param {unknown} body
 * @param {Position} position
 * @param {Scope} scope
 * @param {Context} ctx
 * @param {string} path
 * @returns {StaticType}
 */
function checkLogic(key, body, position, scope, ctx, path) {
    expectPosition(ctx, path, `\`${key}\``, position, [
        'boolean',
        'value',
    ]);
    const operands = asArray(body);
    // The operands of a condition's top-level `all` guard each other
    const guards =
        scope.conditionRoot && key === 'all'
            ? [
                  ...scope.guards,
                  ...operands,
              ]
            : scope.guards;
    operands.forEach((operand, index) => {
        const operandPath = Array.isArray(body) ? `${path}[${index}]` : path;
        /** @type {Scope} */
        const operandScope = {
            ...child(scope),
            underNone: scope.underNone || key === 'none',
            noneAbove: scope.noneAbove || key === 'none',
            guards,
            spreadOf: undefined,
        };
        if (providesValues(operand, 'boolean', ctx)) {
            const type = checkExpr(operand, 'spread', { ...operandScope, spreadOf: 'boolean' }, ctx, operandPath);
            if (!allows(type, 'boolean'))
                fail(ctx, operandPath, `\`${key}\` takes booleans, and config types the values as ${describeType(type)}`);
        } else {
            checkExpr(operand, 'boolean', operandScope, ctx, operandPath);
        }
    });
    return typeOf('boolean');
}

/**
 * `if`, with the `then` and `else` beside it.
 *
 * @param {Record<string, any>} holder - the expression object holding `if`
 * @param {Position} position
 * @param {Scope} scope
 * @param {Context} ctx
 * @param {string} holderPath - the path of the expression object
 * @returns {StaticType}
 */
function checkIf(holder, position, scope, ctx, holderPath) {
    const body = holder.if;
    const path = `${holderPath}.if`;
    expectPosition(ctx, path, '`if`', position, [
        'boolean',
        'value',
        'number',
        'list',
        'spread',
        'root',
    ]);
    if (!('then' in holder)) fail(ctx, path, '`if` needs `then`');
    if (!('else' in holder) && position !== 'value')
        fail(
            ctx,
            path,
            `\`if\` without \`else\` gives \`undefined\` when its condition does not hold, so it fills value position only, not ${position} position`,
        );
    checkExpr(body, 'boolean', { ...child(scope), conditionRoot: true }, ctx, path);
    /** @type {Scope} */
    const branchScope = {
        ...child(scope),
        guards: [
            ...scope.guards,
            ...guardsOf(body),
        ],
    };
    // A run name bound in one branch may be bound after the `if`, with the type each branch binds
    const before = new Map(ctx.runNames);
    // Under `sum`, `mul`, `any`, `all` and `none`, a branch giving no list is one operand
    const single = position === 'spread' ? scope.spreadOf : undefined;
    const branchPosition = (/** @type {unknown} */ branch) =>
        single && !providesValues(Array.isArray(branch) ? branch[branch.length - 1] : branch, single, ctx) ? single : position;
    const thenType =
        'then' in holder ? checkBody(holder.then, branchPosition(holder.then), branchScope, ctx, `${holderPath}.then`) : UNKNOWN;
    const afterThen = ctx.runNames;
    ctx.runNames = new Map(before);
    const elseType =
        'else' in holder
            ? checkBody(holder.else, branchPosition(holder.else), branchScope, ctx, `${holderPath}.else`)
            : typeOf('undefined');
    if (single) {
        for (const branch of /** @type {const} */ ([
            'then',
            'else',
        ])) {
            const type = branch === 'then' ? thenType : elseType;
            if (branch in holder && !allows(type, single))
                fail(ctx, `${holderPath}.${branch}`, `this operand takes ${single}s, and config types the branch as ${describeType(type)}`);
        }
    }
    for (const [
        name,
        type,
    ] of afterThen) {
        const other = ctx.runNames.get(name);
        ctx.runNames.set(
            name,
            other && other !== type
                ? mergeTypes([
                      type,
                      other,
                  ])
                : type,
        );
    }
    return mergeTypes([
        thenType,
        elseType,
    ]);
}

/**
 * `ref`: the value a `define` binds to the name.
 *
 * @param {unknown} body
 * @param {Position} position
 * @param {Scope} scope
 * @param {Context} ctx
 * @param {string} path
 * @returns {StaticType}
 */
function checkRef(body, position, scope, ctx, path) {
    if (typeof body !== 'string' || !DEFINE_NAME_PATTERN.test(body)) {
        fail(ctx, path, `\`ref\` ${JSON.stringify(body)} does not match ${DEFINE_NAME_PATTERN}`);
        return UNKNOWN;
    }
    if (scope.inMatch) {
        fail(ctx, path, '`match` reads the page only, and holds no `ref`');
        return UNKNOWN;
    }
    if (body.startsWith('this.') && ctx.hasMatch)
        fail(ctx, path, `a detector with \`match\` runs \`actions\` once, so it reads no detector name: "${body}"`);
    const type = nameType(body, ctx);
    if (!type) {
        fail(
            ctx,
            path,
            body.startsWith('this.')
                ? `\`ref\` "${body}" reads a detector name no \`define\` in the detector binds`
                : `\`ref\` "${body}" reads a run name no \`define\` binds before it in evaluation order`,
        );
        return UNKNOWN;
    }
    return refType(body, type, position, ctx, path);
}

/**
 * The bodies of a source: the body, or each entry of an array. A body is an object of its own keys,
 * and holds no `any`, `all` or `none`, which combine expressions.
 *
 * @param {unknown} branch
 * @param {Context} ctx
 * @param {string} path
 * @returns {{ body: Record<string, any>, path: string }[]}
 */
function collectBodies(branch, ctx, path) {
    /** @type {{ body: Record<string, any>, path: string }[]} */
    const bodies = [];
    forEachSourceBody(branch, path, (body, bodyPath) => {
        const opKeys = Object.keys(body).filter((key) => OPERATOR_KEYS.includes(key));
        if (opKeys.length)
            fail(
                ctx,
                bodyPath,
                `a source body holds no ${opKeys.join(', ')}: \`{"${opKeys[0]}": [...]}\` combines sources, each in its own object`,
            );
        else bodies.push({ body, path: bodyPath });
    });
    return bodies;
}

/**
 * `element` and `text`.
 *
 * @param {'element' | 'text'} key
 * @param {unknown} branch
 * @param {Position} position
 * @param {Scope} scope
 * @param {Context} ctx
 * @param {string} path
 * @returns {StaticType}
 */
function checkConditionSource(key, branch, position, scope, ctx, path) {
    const bodies = collectBodies(branch, ctx, path);
    if (bodies.length === 0) fail(ctx, path, `\`${key}\` needs at least one body`);
    const withField = bodies.filter(({ body }) => 'field' in body).length;
    if (withField && withField !== bodies.length) fail(ctx, path, 'every body of one `element` source has `field`, or none does');
    const hasField = withField > 0;
    if (hasField && position === 'boolean') fail(ctx, path, `\`element\` with \`field\`: ${LIST_CONDITION}`);

    /** @type {StaticType[]} */
    const valueTypes = [];
    for (const { body, path: bodyPath } of bodies) {
        if (key === 'text') {
            checkTextExpressions(body, ctx, bodyPath);
            valueTypes.push(typeOf('string'));
            if ('root' in body && 'xpath' in body) {
                for (const expression of asArray(body.xpath)) {
                    if (typeof expression === 'string' && selectsFromDocument(expression)) {
                        fail(
                            ctx,
                            `${bodyPath}.xpath`,
                            `${JSON.stringify(expression)} selects from the document whatever its root; a scoped XPath expression starts ".//"`,
                        );
                    }
                }
            }
        } else {
            /** @type {StaticType} */
            const itemType = {
                types: [
                    'object',
                ],
                nan: false,
                interfaces: selectorInterfaces(body.selector),
            };
            if (selectorNamesCustomElement(body.selector)) itemType.customElement = true;
            if ('where' in body)
                checkPredicate(body.where, 'item', itemType, { ...bindItem(scope, itemType), underNone: false }, ctx, `${bodyPath}.where`);
            valueTypes.push('field' in body ? checkFieldRead(body.field, itemType, scope, ctx, `${bodyPath}.field`) : itemType);
        }
        if ('root' in body) {
            const rootPath = `${bodyPath}.root`;
            const valid = checkRoot(body.root, child(scope), ctx, rootPath, key === 'text' && 'xpath' in body);
            // Read only in boolean position with no `none` above it, an empty scope does not hold
            const needsGuard = position !== 'boolean' || scope.noneAbove === true;
            if (valid && needsGuard) checkRootGuard(body.root, scope, ctx, bodyPath);
        }
    }

    if (position === 'boolean') return typeOf('boolean');
    const type = sourceType(mergeTypes(valueTypes), 'selected', position, ctx, path);
    return type.list === 'selected' && !hasField ? { ...type, leaf: true } : type;
}

/**
 * Check the `root` of `element` or `text`: an expression or an array of them, each giving a
 * selector, a node or a list of nodes.
 *
 * @param {unknown} root
 * @param {Scope} scope
 * @param {Context} ctx
 * @param {string} path
 * @param {boolean} readsXPath - the source evaluates XPath expressions from each root
 * @returns {boolean} whether the root has entries
 */
function checkRoot(root, scope, ctx, path, readsXPath) {
    if (Array.isArray(root) && root.length === 0) return false;
    asArray(root).forEach((entry, index) =>
        checkRootEntry(entry, scope, ctx, Array.isArray(root) ? `${path}[${index}]` : path, readsXPath),
    );
    return true;
}

/**
 * @param {unknown} entry
 * @param {Scope} scope
 * @param {Context} ctx
 * @param {string} path
 * @param {boolean} readsXPath
 */
function checkRootEntry(entry, scope, ctx, path, readsXPath) {
    if (entry === '') fail(ctx, path, 'a selector root is a non-empty string');
    const type = checkExpr(entry, 'root', scope, ctx, path);
    // `null` and `undefined` are an empty scope. A list's items are nodes
    const allowed = isList(type)
        ? [
              'object',
          ]
        : [
              'string',
              'object',
              'null',
              'undefined',
          ];
    if (type.types !== null && type.types.some((name) => !allowed.includes(name)))
        fail(ctx, path, `a root gives a selector, a node or a list of nodes, and config types it as ${describeType(type)}`);
    // The expression is valid, but evaluating it from a shadow root throws `NotSupportedError`
    if (readsXPath && type.fragment)
        fail(ctx, path, 'an XPath expression cannot be evaluated from a shadow root; use `selector`, or root at an element inside it');
}

/**
 * The type a source gives in a position. A selected list gives its one item in number position,
 * and each item in spread position.
 *
 * @param {StaticType} type - each item's, when `list` is set
 * @param {StaticType['list']} list
 * @param {Position} position - other than boolean
 * @param {Context} ctx
 * @param {string} path
 * @returns {StaticType}
 */
export function sourceType(type, list, position, ctx, path) {
    if (position === 'spread') return type;
    if (position === 'number') {
        if (list === 'array') {
            fail(ctx, path, `number position takes a number, and config types the value as ${describeType({ ...type, list })}`);
            return type;
        }
        const item = list ? itemOf(type) : type;
        if (!allows(item, 'number')) fail(ctx, path, `number position takes a number, and config types the value as ${describeType(item)}`);
        return item;
    }
    return list ? { ...type, list } : type;
}

/**
 * `using`: an expression over the value of the expression beside it, which `self` reads. A path or
 * an `api` body is short for a `self` with that body.
 *
 * @param {unknown} using
 * @param {StaticType} root - the type of the expression beside `using`
 * @param {Position} position
 * @param {Scope} scope - with `bound` the type of the expression beside `using`
 * @param {Context} ctx
 * @param {string} path - the path of the object holding `using`
 * @returns {StaticType}
 */
function checkUsing(using, root, position, scope, ctx, path) {
    const usingPath = `${path}.using`;
    if (isPlainObject(using) && expressionKeysOf(using).length) return checkExpr(using, position, scope, ctx, usingPath);
    const body = typeof using === 'string' ? { path: using } : using;
    if (!isPlainObject(body)) return UNKNOWN;
    // `length` alone is a number, as C-S-S compiles it
    if (body.path === 'length' && Object.keys(body).length === 1)
        expectPosition(ctx, usingPath, '`using` `length`', position, [
            'value',
            'number',
            'root',
        ]);
    return checkApi(body, position, scope, ctx, usingPath, root);
}
