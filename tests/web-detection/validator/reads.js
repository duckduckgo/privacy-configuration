import { child, expectPosition, fail } from './context.js';
import { bindItem, checkBodyKeys, checkExpr, sourceType } from './expressions.js';
import {
    API_ALLOWLIST,
    BODY_KEYS,
    BUILTIN_RETURN_TYPES,
    ELEMENT_METHOD_ALLOWLIST,
    FIELD_KEYS,
    FUNCTION_READS,
    apiBody,
} from './grammar.js';
import { checkPredicate } from './predicates.js';
import {
    UNKNOWN,
    allows,
    describeInterfaces,
    describeType,
    interfaceProperties,
    itemOf,
    mergeTypes,
    oneItem,
    typeFromIdl,
    typeOf,
} from './types.js';
import { expressionKeysOf, isPlainObject } from './walk.js';

/**
 * @typedef {import('./context.js').Context} Context
 * @typedef {import('./types.js').Position} Position
 * @typedef {import('./context.js').Scope} Scope
 * @typedef {import('./types.js').StaticType} StaticType
 */

/**
 * @param {unknown} body
 * @param {Position} position
 * @param {Scope} scope
 * @param {Context} ctx
 * @param {string} path
 * @param {StaticType} [root] - through `using` or `self`, the type of the value `path` reads from. Without it, the global object
 * @param {boolean} [asFunction] - whether the `api` is an `args` entry, which may read a method as a function
 * @param {boolean} [bound] - whether the body is a `self` body, whose `path` may be left out to read the bound value itself
 * @returns {StaticType}
 */
export function checkApi(body, position, scope, ctx, path, root, asFunction = false, bound = false) {
    if (!isPlainObject(body)) {
        fail(ctx, path, '`api` takes a path or one body object');
        return UNKNOWN;
    }
    const hasWhere = 'where' in body;
    expectPosition(ctx, path, hasWhere ? '`api` with `where`' : '`api`', position, [
        ...(hasWhere
            ? []
            : [
                  'boolean',
              ]),
        'value',
        'number',
        'list',
        'spread',
        'root',
    ]);
    checkBodyKeys(body, BODY_KEYS.api, ctx, path);
    const pathless = bound && body.path === undefined;
    if (pathless && 'args' in body) fail(ctx, path, '`args` calls the last name in `path`, so it needs `path`');
    if (!pathless && (typeof body.path !== 'string' || body.path === '')) {
        fail(ctx, `${path}.path`, '`path` is a non-empty string');
        return UNKNOWN;
    }
    const names = pathless ? [] : String(body.path).split('.');
    const asArgument = asFunction && !('args' in body);
    /** @type {StaticType} */
    let read = root ?? UNKNOWN;
    if (root) {
        // `concat`, an item read and `length` on a list add no name
        const addsNoName =
            read.list !== undefined &&
            names.length === 1 &&
            ('args' in body ? names[0] === 'concat' || readsItem(names[0], true, body.args) : names[0] === 'length');
        if (read.apiPaths === undefined && !read.interfaces && !addsNoName && names.length > 0) {
            fail(
                ctx,
                path,
                'CI names what `using` or `self` reads by the `api` names or element type of the value it reads from, and this expression has neither',
            );
            read = UNKNOWN;
        }
    }
    const argTypes = 'args' in body ? checkArgs(body.args, scope, ctx, `${path}.args`) : undefined;
    if (root) {
        names.forEach((name, index) => {
            const last = index === names.length - 1;
            const isCall = 'args' in body && last;
            read = readName(read, name, isCall, ctx, `${path}.path`, body.args, {
                next: names[index + 1],
                argTypes: isCall ? argTypes : undefined,
                asArgument: asArgument && last,
            });
        });
    } else {
        names.forEach((_, index) => {
            const last = index === names.length - 1;
            const isCall = 'args' in body && last;
            checkApiName(names.slice(0, index + 1).join('.'), isCall, ctx, `${path}.path`, names[index + 1], asArgument && last);
        });
        const returns = 'args' in body && Object.hasOwn(BUILTIN_RETURN_TYPES, body.path) ? BUILTIN_RETURN_TYPES[body.path] : undefined;
        read = {
            types: returns
                ? [
                      returns,
                  ]
                : null,
            nan: returns === 'number',
            apiPaths: [
                body.path,
            ],
        };
        if (argTypes) checkCallArgs(body.path, body.args, argTypes, ctx, `${path}.args`);
    }
    const itemType = itemOf(read);
    if (hasWhere) checkPredicate(body.where, 'item', itemType, { ...bindItem(scope, itemType), underNone: false }, ctx, `${path}.where`);
    const valueType = 'field' in body ? checkFieldRead(body.field, itemType, scope, ctx, `${path}.field`) : itemType;
    // `field` gives a list when `path` reads one, which config does not show, and `concat` gives an array
    const list = hasWhere ? 'selected' : 'field' in body || read.list !== undefined ? 'maybe' : undefined;
    if (position === 'boolean') {
        if (!allows(valueType, 'boolean'))
            fail(ctx, path, `boolean position takes a boolean, and config types the value as ${describeType(valueType)}`);
        return typeOf('boolean');
    }
    return sourceType(valueType, list, position, ctx, path);
}

/**
 * Check one name an `api` reads: listed, and called exactly when it is a method. A method is also
 * read as a function before `apply` or `call`, and as the last name of an `args` entry, where its
 * listing as a method names the function the receiving method may call.
 *
 * @param {string} name
 * @param {boolean} isCall
 * @param {Context} ctx
 * @param {string} path
 * @param {string} [next] - the name read after it
 * @param {boolean} [asArgument] - whether the value is an `args` entry
 */
function checkApiName(name, isCall, ctx, path, next, asArgument = false) {
    const kind = Object.hasOwn(API_ALLOWLIST, name) ? API_ALLOWLIST[name] : undefined;
    if (!kind) {
        fail(ctx, path, `\`api\` reads "${name}", which is not in API_ALLOWLIST`);
    } else if (isCall && kind !== 'method') {
        fail(ctx, path, `calls "${name}", which API_ALLOWLIST records as a ${kind}`);
    } else if (!isCall && kind === 'method' && !asArgument && !(next !== undefined && FUNCTION_READS.includes(next))) {
        fail(
            ctx,
            path,
            `reads the method "${name}" without calling it; a method is called through \`args\`, as the last name of a path, or read before \`apply\`, \`call\` or \`bind\`, or as an \`args\` entry`,
        );
    }
}

/**
 * Check `args`, and return the type of each entry.
 *
 * @param {unknown} args
 * @param {Scope} scope
 * @param {Context} ctx
 * @param {string} path
 * @returns {StaticType[]}
 */
function checkArgs(args, scope, ctx, path) {
    if (!Array.isArray(args)) {
        fail(ctx, path, '`args` is an array');
        return [];
    }
    return args.map((arg, index) => checkArg(arg, scope, ctx, `${path}[${index}]`));
}

/**
 * An `args` entry: an expression in value position. `{"expr": [...]}` builds an inner array, typed as
 * a list of its entries, as `apply` and `concat` read it.
 *
 * @param {unknown} arg
 * @param {Scope} scope
 * @param {Context} ctx
 * @param {string} path
 * @returns {StaticType}
 */
function checkArg(arg, scope, ctx, path) {
    if (isPlainObject(arg) && 'api' in arg) ctx.functionApis.add(arg);
    return checkExpr(arg, 'value', child(scope), ctx, path);
}

/**
 * Whether an `apply` list is one config shows is a list: a selected list, `{"expr": [...]}`, or
 * `Array.from`, `Array.of` or `concat` over one. `apply` over any other value, such as `null` or
 * a `FontFaceSet`, passes no arguments.
 *
 * @param {unknown} arg
 * @param {StaticType | undefined} type
 * @returns {boolean}
 */
function isApplyList(arg, type) {
    if (type?.list !== undefined) return true;
    if (!isPlainObject(arg)) return false;
    const body = apiBody(arg.api);
    if (!isPlainObject(body) || typeof body.path !== 'string') return false;
    const path = body.path;
    return path === 'Array.from' || path === 'Array.of' || path.endsWith('.concat.call');
}

/**
 * Check the arguments of a call config can type: the list `apply` takes, a string `JSON.parse`
 * parses, and the numbers `Math.max` and `Math.min` take.
 *
 * @param {string} apiPath
 * @param {unknown[]} args
 * @param {StaticType[]} argTypes
 * @param {Context} ctx
 * @param {string} path
 */
function checkCallArgs(apiPath, args, argTypes, ctx, path) {
    const isApply = apiPath.endsWith('.apply');
    if (isApply && !isApplyList(args[1], argTypes[1])) {
        fail(ctx, `${path}[1]`, '`apply` takes its arguments as a selected list, `{"expr": [...]}`, or `Array.from` or `concat` over one');
    }
    if (apiPath === 'JSON.parse' && typeof args[0] === 'string') {
        try {
            JSON.parse(args[0]);
        } catch {
            fail(ctx, `${path}[0]`, 'the string passed to `JSON.parse` does not parse');
        }
    }
    const method = isApply ? apiPath.slice(0, -'.apply'.length) : apiPath;
    if (method !== 'Math.max' && method !== 'Math.min') return;
    const numbers = isApply ? argTypes.slice(1, 2).map(itemOf) : argTypes;
    numbers.forEach((type, index) => {
        const argPath = `${path}[${isApply ? 1 : index}]`;
        if (!isApply && type.list === 'selected') fail(ctx, argPath, `\`${method}\` takes numbers; \`${method}.apply\` takes a list`);
        else if (!allows(type, 'number'))
            fail(ctx, argPath, `\`${method}\` takes numbers, and config types the value as ${describeType(type)}`);
    });
}

/**
 * Check a `field` read, from an item or value of the given type, and return the type it reads. A
 * `field` given as an expression, and its `args`, read the item or value through `self`.
 *
 * @param {unknown} field
 * @param {StaticType} subject
 * @param {Scope} scope
 * @param {Context} ctx
 * @param {string} path
 * @returns {StaticType}
 */
export function checkFieldRead(field, subject, scope, ctx, path) {
    if (isPlainObject(field) && expressionKeysOf(field).length) {
        const type = checkExpr(field, 'value', bindItem(scope, subject), ctx, path);
        // A selected list reaches the predicate as an array
        return type.list === 'selected' ? { ...type, list: 'maybe' } : type;
    }
    /** @type {Record<string, any>} */
    let read;
    if (typeof field === 'string') {
        read = { path: field };
    } else if (isPlainObject(field)) {
        for (const key of Object.keys(field)) {
            if (!FIELD_KEYS.includes(key)) fail(ctx, path, `unknown \`field\` key "${key}"`);
        }
        if (!('path' in field)) {
            fail(
                ctx,
                path,
                'args' in field ? '`args` calls the last name in `path`, so it needs `path`' : '`field` needs `path`, or is an expression',
            );
        }
        read = field;
    } else {
        fail(ctx, path, '`field` is a string, an object or an expression');
        return UNKNOWN;
    }

    let current = subject;
    if (read.path !== undefined) {
        if (typeof read.path !== 'string' || read.path === '') {
            fail(ctx, path, '`path` is a non-empty string');
            return UNKNOWN;
        }
        const argTypes = read.args !== undefined ? checkArgs(read.args, bindItem(scope, subject), ctx, `${path}.args`) : undefined;
        const names = read.path.split('.');
        names.forEach((name, index) => {
            const isCall = read.args !== undefined && index === names.length - 1;
            current = readName(current, name, isCall, ctx, path, read.args, {
                next: names[index + 1],
                argTypes: isCall ? argTypes : undefined,
            });
        });
    }
    return current;
}

/**
 * The `Number` test a predicate object makes on its value through
 * `{"field": {"api": {"path": <test>, "args": [{"self": {}}]}}, "is": <boolean>}`: `Number.isFinite`
 * or `Number.isNaN`, with the boolean it expects.
 *
 * @param {Record<string, any>} predicate
 * @returns {{ name: string, expected: boolean } | undefined}
 */
export function numberGuard(predicate) {
    const { field, is } = predicate;
    if (typeof is !== 'boolean' || !isPlainObject(field) || Object.keys(field).length !== 1 || !('api' in field)) return undefined;
    const body = apiBody(field.api);
    if (!isPlainObject(body) || Object.keys(body).length !== 2 || !Array.isArray(body.args) || body.args.length !== 1) return undefined;
    if (body.path !== 'Number.isFinite' && body.path !== 'Number.isNaN') return undefined;
    const [
        arg,
    ] = body.args;
    if (!isPlainObject(arg) || Object.keys(arg).length !== 1 || !isPlainObject(arg.self) || Object.keys(arg.self).length) return undefined;
    return { name: body.path, expected: is };
}

/**
 * Whether a read takes one item of an array: `at` called with one integer, or an index.
 *
 * @param {string} name
 * @param {boolean} isCall
 * @param {unknown} args
 */
function readsItem(name, isCall, args) {
    if (!isCall) return /^\d+$/.test(name);
    return name === 'at' && Array.isArray(args) && args.length === 1 && Number.isInteger(args[0]);
}

/**
 * Read one name from a value of the given type.
 *
 * An item read on a list, or on an `api` value, takes no name of its own: an item of
 * `performance.getEntriesByType` is named `performance.getEntriesByType`, as `where` names it.
 *
 * @param {StaticType} current
 * @param {string} name
 * @param {boolean} isCall
 * @param {Context} ctx
 * @param {string} path
 * @param {unknown} [args] - when `isCall`, the arguments
 * @param {{ next?: string, argTypes?: StaticType[], asArgument?: boolean }} [options] - the name read after it, the type of each argument, and whether the value is an `args` entry
 * @returns {StaticType}
 */
function readName(current, name, isCall, ctx, path, args, options = {}) {
    if (name === '') {
        fail(ctx, path, 'a path has an empty name');
        return UNKNOWN;
    }
    if (isCall && name === 'concat' && (current.list !== undefined || current.apiPaths !== undefined)) {
        // `concat` joins lists, and each item keeps the name and type of its list
        return {
            ...mergeTypes([
                itemOf(current),
                ...(options.argTypes ?? []).map(itemOf),
            ]),
            list: 'maybe',
        };
    }
    const item = readsItem(name, isCall, args);
    if (current.list === 'selected') {
        if (item) return oneItem(current, ctx, path);
        if (name === 'length' && !isCall) return typeOf('number');
        fail(ctx, path, `reads "${name}" on a list, which \`at\`, an index and \`length\` read; \`only\` takes its one item`);
        return UNKNOWN;
    }
    if (item && (current.list === 'maybe' || current.apiPaths !== undefined)) return oneItem(current, ctx, path);
    if (current.list) current = itemOf(current);
    if (current.apiPaths !== undefined && current.interfaces) {
        // Branches reading an `api` and branches giving an element: check the name both ways
        const { apiPaths, ...element } = current;
        return mergeTypes([
            readName({ types: null, nan: false, apiPaths }, name, isCall, ctx, path, args, options),
            readName(element, name, isCall, ctx, path, args, options),
        ]);
    }
    if (current.apiPaths !== undefined) {
        const apiPaths = current.apiPaths.map((apiPath) => `${apiPath}.${name}`);
        for (const apiPath of apiPaths) checkApiName(apiPath, isCall, ctx, path, options.next, options.asArgument);
        return { types: null, nan: false, apiPaths };
    }
    // The tables do not type the items of an IDL sequence
    if (isCall && item && current.types?.includes('array')) return UNKNOWN;
    if (isCall) {
        if (!current.interfaces) {
            fail(ctx, path, `calls ${name}() on a value that is not an element or an \`api\` read`);
            return UNKNOWN;
        }
        if (!Object.hasOwn(ELEMENT_METHOD_ALLOWLIST, name)) {
            fail(ctx, path, `calls ${name}() on an element, which is not in ELEMENT_METHOD_ALLOWLIST`);
            return UNKNOWN;
        }
        return typeFromIdl(ELEMENT_METHOD_ALLOWLIST[/** @type {keyof typeof ELEMENT_METHOD_ALLOWLIST} */ (name)]);
    }
    if (current.types === null) return UNKNOWN;

    const isIndex = /^\d+$/.test(name);
    /** @type {StaticType[]} */
    const results = [];
    const wrong = [];
    for (const type of current.types) {
        if (type === 'null' || type === 'undefined') {
            results.push(typeOf('undefined'));
        } else if ((type === 'string' || type === 'array') && name === 'length') {
            results.push(typeOf('number'));
        } else if (type === 'string' && isIndex) {
            results.push(
                mergeTypes([
                    typeOf('string'),
                    typeOf('undefined'),
                ]),
            );
        } else if (type === 'array' && isIndex) {
            results.push(UNKNOWN);
        } else if (type === 'object' && current.interfaces) {
            const found = current.interfaces.map((iface) => interfaceProperties(iface).get(name)).filter((idl) => idl !== undefined);
            if (found.length) {
                results.push(...found.map(typeFromIdl));
            } else if (current.customElement) {
                results.push(UNKNOWN);
            } else {
                fail(ctx, path, `"${name}" is not a property of ${describeInterfaces(current.interfaces)}`);
            }
        } else if (type === 'object') {
            results.push(UNKNOWN);
        } else {
            wrong.push(type);
        }
    }
    if (wrong.length) fail(ctx, path, `reads "${name}" on a value config types as ${wrong.join(' or ')}`);
    return results.length ? mergeTypes(results) : UNKNOWN;
}
