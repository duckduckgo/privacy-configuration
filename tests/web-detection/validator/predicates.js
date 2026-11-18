// @ts-check
import { PAYLOAD_SCOPE, child, fail } from './context.js';
import { checkExpr, predicateSubject } from './expressions.js';
import { COMPARISON_OPERATORS, NAME_PATTERN, OPERATOR_KEYS, VALUE_OPERATORS } from './grammar.js';
import { checkFieldRead, numberGuard } from './reads.js';
import { describeType } from './types.js';
import { asArray, isItemExpression } from './walk.js';
import { isPlainObject } from '../../../util.js';

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
    if (isLiteral(predicate)) return;
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
    // The JS operators convert their operands, so an operand is a value, as C-S-S compiles it
    for (const key of comparisons) checkExpr(predicate[key], 'value', child(scope), ctx, `${path}.${key}`);

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
    if (has('type')) listed = asArray(predicate.type);

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
 * @param {Scope} scope - the payload scope, with the index of its action item
 */
export function checkPayloadSpec(data, action, ctx, path, scope) {
    if (!isPlainObject(data)) return;
    for (const [
        key,
        field,
    ] of Object.entries(data)) {
        const fieldPath = `${path}.${key}`;
        if (!NAME_PATTERN.test(key)) fail(ctx, fieldPath, `payload key "${key}" does not match ${NAME_PATTERN}`);
        if (key === 'nativeData') fail(ctx, fieldPath, 'payload key "nativeData" is reserved');
        if (!isPlainObject(field) || !('value' in field)) continue;
        const type = checkExpr(field.value, 'value', scope, ctx, `${fieldPath}.value`);
        if (action === 'fireEvent' && !('buckets' in field)) fail(ctx, fieldPath, 'a `fireEvent` payload field is sent through `buckets`');
        if ('when' in field) {
            const whenPath = `${fieldPath}.when`;
            checkPredicate(field.when, 'value', predicateSubject(type, field.when, ctx, whenPath), scope, ctx, whenPath);
        }
        if ('buckets' in field) checkBuckets(field.buckets, type, ctx, `${fieldPath}.buckets`);
    }
}

/**
 * @typedef {{ lo: number, loIn: boolean, hi: number, hiIn: boolean }} Interval
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
 * comparisons against literals. A literal, `eq` and `in` test with `===`, so they hold for the
 * points they list; `lt`, `lte`, `gt` and `gte` convert the value as JS does, so they hold for an
 * interval. Null for any other predicate, which the overlap check skips.
 *
 * @param {unknown} predicate
 * @returns {BucketSet | null}
 */
function simpleBucketSet(predicate) {
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
    const comparisons = keys.filter((key) => key !== 'eq');
    if (!comparisons.every((key) => typeof predicate[key] === 'number')) return null;

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
    for (const key of comparisons) {
        const bound = predicate[key];
        if (key === 'gte') raiseLow(bound, true);
        if (key === 'gt') raiseLow(bound, false);
        if (key === 'lte') lowerHigh(bound, true);
        if (key === 'lt') lowerHigh(bound, false);
    }
    if (!('eq' in predicate))
        return {
            intervals: [
                interval,
            ],
            points: [],
        };
    if (!isLiteral(predicate.eq)) return null;
    // `eq` beside comparisons holds for its literal when they hold for it too
    return {
        intervals: [],
        points: pointIn(predicate.eq, interval)
            ? [
                  predicate.eq,
              ]
            : [],
    };
}

/**
 * Whether a comparison interval holds for a literal, which it converts as JS does: `null` and `""`
 * to 0, a boolean to 0 or 1, and `"7"` to 7.
 *
 * @param {unknown} point
 * @param {Interval} interval
 */
function pointIn(point, interval) {
    const value = Number(point);
    if (Number.isNaN(value)) return false;
    return (
        (interval.lo < value || (interval.lo === value && interval.loIn)) &&
        (value < interval.hi || (value === interval.hi && interval.hiIn))
    );
}

/**
 * @param {unknown} point
 * @param {BucketSet} set
 */
function setHolds(point, set) {
    return set.points.includes(point) || set.intervals.some((interval) => pointIn(point, interval));
}

/**
 * The values both intervals hold for, or null when they share none.
 *
 * @param {Interval} a
 * @param {Interval} b
 * @returns {Interval | null}
 */
function intersect(a, b) {
    const lo = Math.max(a.lo, b.lo);
    const hi = Math.min(a.hi, b.hi);
    const loIn = (a.lo < lo || a.loIn) && (b.lo < lo || b.loIn);
    const hiIn = (a.hi > hi || a.hiIn) && (b.hi > hi || b.hiIn);
    if (lo < hi || (lo === hi && Number.isFinite(lo) && loIn && hiIn)) return { lo, loIn, hi, hiIn };
    return null;
}

/**
 * Whether `outer` holds for every value `inner` holds for.
 *
 * @param {BucketSet} inner
 * @param {BucketSet} outer
 */
function contains(inner, outer) {
    if (!inner.points.length && !inner.intervals.length) return false;
    return (
        inner.points.every((point) => setHolds(point, outer)) &&
        inner.intervals.every((x) =>
            outer.intervals.some(
                (y) => (y.lo < x.lo || (y.lo === x.lo && (y.loIn || !x.loIn))) && (x.hi < y.hi || (x.hi === y.hi && (y.hiIn || !x.hiIn))),
            ),
        )
    );
}

/**
 * The values two bucket sets both hold for.
 *
 * @param {BucketSet} a
 * @param {BucketSet} b
 * @returns {BucketSet}
 */
function sharedValues(a, b) {
    const points = [
        ...new Set([
            ...a.points.filter((point) => setHolds(point, b)),
            ...b.points.filter((point) => setHolds(point, a)),
        ]),
    ];
    const intervals = a.intervals.flatMap((x) => b.intervals.map((y) => intersect(x, y))).filter((x) => x !== null);
    return { points, intervals };
}

/**
 * Values a bucket set holds for, written as predicates.
 *
 * @param {BucketSet} set
 */
function describeValues(set) {
    return [
        ...set.points.map((point) => JSON.stringify(point)),
        ...set.intervals.map((x) => {
            /** @type {Record<string, number>} */
            const bounds = {};
            if (x.lo === x.hi) return JSON.stringify(x.lo);
            if (Number.isFinite(x.lo)) bounds[x.loIn ? 'gte' : 'gt'] = x.lo;
            if (Number.isFinite(x.hi)) bounds[x.hiIn ? 'lte' : 'lt'] = x.hi;
            return JSON.stringify(bounds);
        }),
    ].join(', ');
}

/**
 * The overlaps between buckets of different names whose predicates are simple. Buckets are tested
 * in array order, and the first that holds names the value. A bucket holding only values an
 * earlier one holds never names a value, and two ranges sharing an endpoint both include are an
 * error; any other overlap is a warning, since the earlier bucket takes the shared values.
 * Entries sharing a name may overlap.
 *
 * @param {unknown} buckets
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function bucketOverlaps(buckets) {
    /** @type {{ errors: string[], warnings: string[] }} */
    const found = { errors: [], warnings: [] };
    if (!Array.isArray(buckets)) return found;
    /** @type {{ name: string, set: BucketSet }[]} */
    const simple = [];
    for (const bucket of buckets) {
        const set = isPlainObject(bucket) && 'is' in bucket ? simpleBucketSet(bucket.is) : null;
        if (set) simple.push({ name: String(bucket.name), set });
    }
    simple.forEach((later, j) => {
        for (const earlier of simple.slice(0, j)) {
            if (earlier.name === later.name) continue;
            if (contains(later.set, earlier.set)) {
                found.errors.push(`bucket "${later.name}" holds only values "${earlier.name}" before it holds, so it never names a value`);
                break;
            }
            const shared = sharedValues(earlier.set, later.set);
            if (!shared.points.length && !shared.intervals.length) continue;
            const [
                interval,
            ] = shared.intervals;
            if (!shared.points.length && shared.intervals.length === 1 && interval.lo === interval.hi) {
                found.errors.push(
                    `buckets "${earlier.name}" and "${later.name}" both include ${interval.lo}; make one end exclusive with \`gt\` or \`lt\``,
                );
            } else {
                found.warnings.push(
                    `buckets "${earlier.name}" and "${later.name}" overlap on ${describeValues(shared)}, which "${earlier.name}" names since it comes first`,
                );
            }
        }
    });
    return found;
}

/**
 * @param {unknown} buckets
 * @param {StaticType} type - the value's
 * @param {Context} ctx
 * @param {string} path
 */
function checkBuckets(buckets, type, ctx, path) {
    if (!Array.isArray(buckets)) return;
    buckets.forEach((bucket, i) => {
        if (!isPlainObject(bucket) || !('is' in bucket)) return;
        const isPath = `${path}[${i}].is`;
        checkPredicate(bucket.is, 'value', predicateSubject(type, bucket.is, ctx, isPath), PAYLOAD_SCOPE, ctx, isPath);
    });
    for (const error of bucketOverlaps(buckets).errors) fail(ctx, path, error);
}
