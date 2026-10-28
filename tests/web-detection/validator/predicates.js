import { PAYLOAD_SCOPE, child, fail } from './context.js';
import { checkExpr, predicateSubject } from './expressions.js';
import { COMPARISON_OPERATORS, NAME_PATTERN, OPERATOR_KEYS, PAYLOAD_FIELD_KEYS, TYPE_NAMES, VALUE_OPERATORS } from './grammar.js';
import { checkFieldRead, numberGuard } from './reads.js';
import { describeType } from './types.js';
import { asArray, isItemExpression, isPlainObject } from './walk.js';

/**
 * @typedef {import('./context.js').Context} Context
 * @typedef {import('./context.js').Scope} Scope
 * @typedef {import('./types.js').StaticType} StaticType
 */

/**
 * Check a predicate testing an item or a value of the given type.
 *
 * @param {unknown} predicate
 * @param {'item' | 'value'} level
 * @param {StaticType} subject
 * @param {Scope} scope - `underNone` is set under a `none`, in the predicate or the match tree
 * @param {Context} ctx
 * @param {string} path
 */
export function checkPredicate(predicate, level, subject, scope, ctx, path) {
    if (
        predicate === null ||
        [
            'string',
            'number',
            'boolean',
        ].includes(typeof predicate)
    )
        return;
    if (Array.isArray(predicate)) {
        fail(
            ctx,
            path,
            'an array is not a predicate: `{"in": [...]}` tests for one of several values, and `{"any": [...]}` one of several predicates',
        );
        return;
    }
    if (!isPlainObject(predicate)) {
        fail(ctx, path, `${JSON.stringify(predicate)} is not a predicate`);
        return;
    }
    if (level === 'item' && isItemExpression(predicate)) {
        checkExpr(predicate, 'boolean', child(scope), ctx, path);
        return;
    }

    if ('field' in predicate !== 'is' in predicate) fail(ctx, path, '`field` and `is` go together: `{"field": F, "is": P}`');
    const operators = level === 'value' ? Object.keys(predicate).filter((key) => VALUE_OPERATORS.includes(key)) : [];
    if (operators.length) checkOperators(predicate, subject, scope, ctx, path);

    for (const [
        key,
        value,
    ] of Object.entries(predicate)) {
        const keyPath = `${path}.${key}`;
        if (OPERATOR_KEYS.includes(key)) {
            const entryScope = { ...scope, underNone: scope.underNone || key === 'none', noneAbove: scope.noneAbove || key === 'none' };
            for (const entry of asArray(value)) checkPredicate(entry, level, subject, entryScope, ctx, keyPath);
        } else if (key === 'field') {
            const read = checkFieldRead(value, subject, scope, ctx, keyPath);
            if ('is' in predicate) checkPredicate(predicate.is, 'value', read, scope, ctx, `${path}.is`);
        } else if (key === 'is' || operators.includes(key)) {
            continue;
        } else {
            const read = checkFieldRead(key, subject, scope, ctx, keyPath);
            checkPredicate(value, 'value', read, scope, ctx, keyPath);
        }
    }
}

/**
 * The operators of a value-level predicate object.
 *
 * @param {Record<string, any>} predicate
 * @param {StaticType} subject
 * @param {Scope} scope
 * @param {Context} ctx
 * @param {string} path
 */
function checkOperators(predicate, subject, scope, ctx, path) {
    /** @param {string} key */
    const has = (key) => Object.hasOwn(predicate, key);

    if (has('eq')) checkExpr(predicate.eq, 'value', child(scope), ctx, `${path}.eq`);
    if (has('in')) {
        // Each entry a value, an entry giving a list contributing each item
        asArray(predicate.in).forEach((entry, index) =>
            checkExpr(entry, 'value', child(scope), ctx, Array.isArray(predicate.in) ? `${path}.in[${index}]` : `${path}.in`),
        );
    }
    const comparisons = COMPARISON_OPERATORS.filter(has);
    for (const key of comparisons) checkExpr(predicate[key], 'number', child(scope), ctx, `${path}.${key}`);

    if (has('fails') && typeof predicate.fails !== 'boolean') fail(ctx, `${path}.fails`, '`fails` is a boolean');
    if (predicate.fails === true) {
        const beside = Object.keys(predicate).filter((key) => key !== 'fails');
        if (beside.length)
            fail(
                ctx,
                path,
                `beside \`"fails": true\`, ${beside.join(', ')} read${beside.length === 1 ? 's' : ''} the failed value, which aborts the detector`,
            );
    }

    /** @type {string[] | null} */
    let listed = null;
    if (has('type')) {
        const names = asArray(predicate.type);
        const unknown = names.filter((name) => !TYPE_NAMES.includes(name));
        if (unknown.length)
            fail(
                ctx,
                `${path}.type`,
                `unknown type name ${unknown.map((name) => JSON.stringify(name)).join(', ')}; names are ${TYPE_NAMES.join(', ')}`,
            );
        listed = names;
    }

    const guard = numberGuard(predicate);
    // `Number.isFinite` holding means a number, when tested before the comparisons. `Number.isNaN`
    // holding means NaN, on which every comparison is false, so it guards nothing
    const keys = Object.keys(predicate);
    const guardsFirst = keys.indexOf('field') < Math.min(...comparisons.map((key) => keys.indexOf(key)));
    const numberOnly = guard?.name === 'Number.isFinite' && guard.expected === true && guardsFirst;
    if (guard?.expected === true && listed && !listed.includes('number'))
        fail(ctx, path, `\`${guard.name}\` holding beside a \`type\` that leaves out number never holds`);

    if (comparisons.length) {
        const operatorList = comparisons.join(', ');
        if (listed) {
            const outside = listed.filter((name) => name !== 'number');
            if (outside.length)
                fail(ctx, path, `beside \`type\`, ${operatorList} takes numbers only, and \`type\` also lists ${outside.join(', ')}`);
        } else if (!numberOnly && subject.types !== null) {
            // A comparison on a string literal that converts to NaN is false, as on a number out of range
            const outside = subject.types.filter((name) => name !== 'number' && !(name === 'string' && subject.nonNumericStrings));
            if (outside.length) {
                fail(
                    ctx,
                    path,
                    `${operatorList} takes numbers, and config types the value as ${describeType(subject)}; guard it with "type": "number", or \`Number.isFinite\` of \`self\` holding, before the comparison`,
                );
            }
        }
        if (scope.underNone && subject.nan && !guard) {
            fail(
                ctx,
                path,
                `under \`none\`, ${operatorList} on a value that can be NaN needs \`Number.isFinite\` or \`Number.isNaN\` of \`self\` beside it, since a comparison on NaN is false`,
            );
        }
    }
}

/**
 * Every `fireEvent` field has `buckets`, so an event carries bucket names. A `breakageReportData` value
 * is sent as JSON writes it.
 *
 * @param {unknown} data
 * @param {'fireEvent' | 'breakageReportData'} action
 * @param {Context} ctx
 * @param {string} path
 * @param {Scope} [scope] - the payload scope, with the index of its action item
 */
export function checkPayloadSpec(data, action, ctx, path, scope = PAYLOAD_SCOPE) {
    if (!isPlainObject(data)) {
        fail(ctx, path, '`data` maps payload keys to fields');
        return;
    }
    for (const [
        key,
        field,
    ] of Object.entries(data)) {
        const fieldPath = `${path}.${key}`;
        if (!NAME_PATTERN.test(key)) fail(ctx, fieldPath, `payload key "${key}" does not match ${NAME_PATTERN}`);
        if (key === 'nativeData') fail(ctx, fieldPath, 'payload key "nativeData" is reserved');
        if (!isPlainObject(field)) {
            fail(ctx, fieldPath, 'a payload field is an object with `value`');
            continue;
        }
        for (const fieldKey of Object.keys(field)) {
            if (!PAYLOAD_FIELD_KEYS.includes(fieldKey)) fail(ctx, fieldPath, `unknown payload field key "${fieldKey}"`);
        }
        if (!('value' in field)) {
            fail(ctx, fieldPath, 'a payload field needs `value`');
            continue;
        }
        const type = checkExpr(field.value, 'value', scope, ctx, `${fieldPath}.value`);
        if (action === 'fireEvent' && !('buckets' in field)) fail(ctx, fieldPath, 'a `fireEvent` payload field is sent through `buckets`');
        if ('when' in field) {
            const whenPath = `${fieldPath}.when`;
            checkPredicate(field.when, 'value', predicateSubject(type, field.when, ctx, whenPath), scope, ctx, whenPath);
        }
        if ('buckets' in field) checkBuckets(field.buckets, type, ctx, `${fieldPath}.buckets`);
    }
}

/** A bucket name a JS object lists first, in ascending order, whatever order the config writes it in. */
const INTEGER_NAME = /^(0|[1-9][0-9]*)$/;

/**
 * @typedef {{ lo: number, loIn: boolean, hi: number, hiIn: boolean, strict?: boolean }} Interval
 * @typedef {{ intervals: Interval[], points: unknown[] }} BucketSet
 */

/**
 * @param {unknown} value
 * @returns {value is string | number | boolean | null}
 */
export function isLiteral(value) {
    return (
        value === null ||
        [
            'string',
            'number',
            'boolean',
        ].includes(typeof value)
    );
}

/**
 * The values a bucket holds for, when its predicate is a literal, `in` over literals or
 * comparisons against literals. Null for any other predicate, which the overlap check skips.
 *
 * @param {unknown} predicate
 * @returns {BucketSet | null}
 */
function simpleBucketSet(predicate) {
    // A number literal tests with `===`, so it holds for no other type
    if (typeof predicate === 'number')
        return {
            intervals: [
                { lo: predicate, loIn: true, hi: predicate, hiIn: true, strict: true },
            ],
            points: [],
        };
    if (isLiteral(predicate))
        return {
            intervals: [],
            points: [
                predicate,
            ],
        };
    if (!isPlainObject(predicate)) return null;
    const keys = Object.keys(predicate);
    if (keys.length === 1 && keys[0] === 'in') {
        const entries = asArray(predicate.in);
        if (!entries.every(isLiteral)) return null;
        return { intervals: [], points: entries };
    }
    if (!keys.length || !keys.every((key) => key === 'eq' || COMPARISON_OPERATORS.includes(key))) return null;
    if (keys.length === 1 && keys[0] === 'eq' && isLiteral(predicate.eq)) return simpleBucketSet(predicate.eq);
    if (!keys.every((key) => typeof predicate[key] === 'number')) return null;

    /** @type {Interval} */
    const interval = { lo: -Infinity, loIn: false, hi: Infinity, hiIn: false };
    /**
     * @param {number} bound
     * @param {boolean} inclusive
     */
    const raiseLow = (bound, inclusive) => {
        if (bound > interval.lo || (bound === interval.lo && !inclusive)) Object.assign(interval, { lo: bound, loIn: inclusive });
    };
    /**
     * @param {number} bound
     * @param {boolean} inclusive
     */
    const lowerHigh = (bound, inclusive) => {
        if (bound < interval.hi || (bound === interval.hi && !inclusive)) Object.assign(interval, { hi: bound, hiIn: inclusive });
    };
    for (const key of keys) {
        const bound = predicate[key];
        if (key === 'gte' || key === 'eq') raiseLow(bound, true);
        if (key === 'gt') raiseLow(bound, false);
        if (key === 'lte' || key === 'eq') lowerHigh(bound, true);
        if (key === 'lt') lowerHigh(bound, false);
    }
    return {
        intervals: [
            interval,
        ],
        points: [],
    };
}

/**
 * @param {Interval} a
 * @param {Interval} b
 */
function intervalsOverlap(a, b) {
    const lo = Math.max(a.lo, b.lo);
    const hi = Math.min(a.hi, b.hi);
    if (lo < hi) return true;
    if (lo > hi || !Number.isFinite(lo)) return false;
    // They meet at one point, held only if every bound there is inclusive
    return (a.lo < lo || a.loIn) && (b.lo < lo || b.loIn) && (a.hi > hi || a.hiIn) && (b.hi > hi || b.hiIn);
}

/**
 * Whether a comparison interval holds for a literal that is not a number, which it converts as
 * JS does: `null` and `""` to 0, a boolean to 0 or 1, and `"7"` to 7.
 *
 * @param {unknown} point
 * @param {Interval[]} intervals
 */
function pointCoercesInto(point, intervals) {
    const value = Number(point);
    if (Number.isNaN(value)) return false;
    return intervals.some((x) => !x.strict && (x.lo < value || (x.lo === value && x.loIn)) && (value < x.hi || (value === x.hi && x.hiIn)));
}

/**
 * @param {BucketSet} a
 * @param {BucketSet} b
 */
function bucketSetsOverlap(a, b) {
    return (
        a.points.some((point) => b.points.includes(point) || pointCoercesInto(point, b.intervals)) ||
        b.points.some((point) => pointCoercesInto(point, a.intervals)) ||
        a.intervals.some((x) => b.intervals.some((y) => intervalsOverlap(x, y)))
    );
}

/**
 * @param {unknown} buckets
 * @param {StaticType} type - the value's
 * @param {Context} ctx
 * @param {string} path
 */
function checkBuckets(buckets, type, ctx, path) {
    if (!isPlainObject(buckets) || Object.keys(buckets).length === 0) {
        fail(ctx, path, '`buckets` maps at least one bucket name to a predicate');
        return;
    }
    /** @type {{ name: string, set: BucketSet }[]} */
    const simple = [];
    for (const [
        name,
        predicate,
    ] of Object.entries(buckets)) {
        if (name === '') fail(ctx, path, 'a bucket name is a non-empty string');
        if (INTEGER_NAME.test(name))
            fail(ctx, path, `bucket name "${name}" is integer-like, which a JS object lists first in ascending order`);
        const bucketPath = `${path}.${name}`;
        checkPredicate(predicate, 'value', predicateSubject(type, predicate, ctx, bucketPath), PAYLOAD_SCOPE, ctx, bucketPath);
        const set = simpleBucketSet(predicate);
        if (set) simple.push({ name, set });
    }
    for (let i = 0; i < simple.length; i++) {
        for (let j = i + 1; j < simple.length; j++) {
            if (bucketSetsOverlap(simple[i].set, simple[j].set))
                fail(ctx, path, `buckets "${simple[i].name}" and "${simple[j].name}" overlap`);
        }
    }
}
