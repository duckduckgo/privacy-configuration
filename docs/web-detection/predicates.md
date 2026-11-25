# Predicates

A predicate tests a value. Four keys take a predicate:

| Key | On | Tests | Gives |
|---|---|---|---|
| [`is`](expressions.md#is) | Any expression but a literal | The expression's value | A boolean |
| `where` | `element` and `api` ([Lists](sources.md#lists-where-and-field)) | Each item of the source's list | The items it holds for |
| [`when`](payloads.md#when) | A payload field | The field's value | Whether the key is sent |
| [`buckets`](payloads.md#buckets), as each bucket's `is` | A payload field | The field's value | The bucket's name, for the first that holds |

```json
{"element": {"selector": "img", "where": {"complete": true, "naturalWidth": 0}}, "using": "length", "is": {"gte": 1}}
{"api": {"path": "performance.getEntriesByType", "args": ["resource"], "where": {"duration": {"gt": 1000}}}, "using": "length", "is": {"gte": 1}}
```

## Forms

| Form | Holds when |
|---|---|
| A string, number, boolean or `null` | The value equals it: short for `{"eq": <literal>}` |
| `{"any": …}`, `{"all": …}`, `{"none": …}`, over a predicate or an array of predicates | At least one, every one, or no entry holds |
| An object | Every key holds. A key is a combinator, an operator, a property path, or `field` with `is` ([Keys](#keys)). `{}` holds for any value that's read |

| Operator | Holds when |
|---|---|
| `eq` | The value `===` the operand |
| `in` | The value `===` one of the operand's values. The operand is an array of entries, or one entry, and an entry that gives a list contributes each of its items. `NaN` is never in a list |
| `lt`, `lte`, `gt`, `gte` | The JS comparison `value < operand` (or `<=`, `>`, `>=`) is true |
| `fails` | The read fails ([Failure and type](#failure-and-type)) |
| `type` | The value has a listed type ([Failure and type](#failure-and-type)) |

```json
{"gte": 3000, "lt": 8000}
{"length": {"gt": 0}}
{"complete": true, "naturalWidth": 0, "currentSrc.length": {"gt": 0}}
{"initiatorType": {"in": ["img", "css"]}}
{"initiatorType": {"none": {"in": ["img", "css"]}}}
{"any": [{"value.length": {"gt": 0}}, {"required": false}]}
```

The operand of `eq`, `lt`, `lte`, `gt` and `gte`, and each entry of `in`, is an expression in value position ([Positions](expressions.md#positions)). In `where`, an operand can read the item being tested through [`self`](expressions.md#self). Here `where` keeps the resources that finished after the load event, and then the ones that took more than a second from their start:

```json
{"api": {"path": "performance.getEntriesByType", "args": ["resource"], "where": {"responseEnd": {"gt": {"ref": "loadEventEnd"}}}}}
{"api": {"path": "performance.getEntriesByType", "args": ["resource"], "where": {"responseEnd": {"gt": {"sum": [{"self": "startTime"}, 1000]}}}}}
```

`eq` against a ratio compares floats exactly, so use a range instead.

The comparison operators coerce values like JS does: a comparison on `undefined` or `NaN` is `false`, and `null >= 0` and `"7" >= 7` both hold. Every operator either holds or doesn't for any value that's read, so `none` over it inverts it, and `none` over a comparison on `undefined` holds. To only compare numbers, put `type`, or `Number.isFinite` called on the value ([Calls](#calls)), before the comparison ([Failure and type](#failure-and-type), [Comparison guards](#comparison-guards)).

## Keys

At item level, a predicate tests an item: an element, or a member of a list that an `api` reads. The top of `where` is item level, and so are the operands of `any`, `all` and `none` there. Everywhere else (under a key, under `is` and in payload fields), a predicate tests a value.

An object ANDs its keys. Some keys mean different things at each level:

| Key | At item level | At value level |
|---|---|---|
| `any`, `all`, `none` | Combinator | Combinator |
| `field` with `is` | A read ([Long form](#long-form)) | A read ([Long form](#long-form)) |
| `eq`, `in`, `lt`, `lte`, `gt`, `gte`, `fails`, `type` | Property path | Operator |
| `element`, `text`, `api`, `self`, `expr`, `only`, `sum`, `mul`, `div`, `if`, `ref` | The object is an expression over the item ([`self`](expressions.md#self)) | Property path |
| Any other key | Property path | Property path |

A property path is names joined by `.`, read in turn from the item or value. `"<path>": P` holds when P holds for what the path reads, and is short for `{"field": "<path>", "is": P}`.

```json
{"element": {"selector": "input", "where": {"type": "checkbox", "checked": true}}}
{"api": {"path": "performance.getEntriesByType", "args": ["navigation"], "where": {"type": "reload"}}}
{"element": {"selector": "img", "where": {"currentSrc.length": {"gt": 0}}}}
{"api": {"path": "document.title"}, "is": {"type": "string", "length": {"gte": 7}}}
```

A selected list under `is`, `when` or a bucket reaches the predicate as described in [Selected lists](expressions.md#selected-lists): `{"lt": 2000}` tests its one item, and `{"length": {"gte": 5}}` tests the number of items.

### Long form

`{"field": F, "is": P}` reads F from the item or value being tested, and tests what it reads with P, the same way `is` on an expression tests the expression's value. F takes the same forms as `field` on a source ([Lists](sources.md#lists-where-and-field)), and binds [`self`](expressions.md#self) to the item or value being tested. The long form can read things a property path can't: a method call, an expression over the value through `self`, and a property with the same name as a key the table reserves at that level:

```json
{"element": {"selector": "div", "where": {"field": {"path": "getAttribute", "args": ["role"]}, "is": "dialog"}}}
{"element": {"selector": "option", "where": {"field": "text", "is": "Sign in", "disabled": false}}}
{"api": "document.activeElement", "is": {"field": "type", "is": "checkbox"}}
```

### Calls

`{"field": {"api": {"path": F, "args": [{"self": {}}]}}, "is": P}` tests the value with a function F on the [`api` allowlist](sources.md#allowed-names): `{"self": {}}` passes the value, in any argument position and alongside other arguments, and P tests what F returns. An object can only have one `field`, so to make several calls on one value, put them under `all`, `any` or `none`:

```json
{"duration": {"field": {"api": {"path": "Number.isFinite", "args": [{"self": {}}]}}, "is": true, "gt": 0}}
{"duration": {"all": [{"field": {"api": {"path": "Number.isNaN", "args": [{"self": {}}]}}, "is": false}, {"field": {"api": {"path": "Number.isFinite", "args": [{"self": {}}]}}, "is": false}]}}
```

The first holds for a finite duration above 0, the second for an infinite one.

## Failure and type

| Operator | Holds when |
|---|---|
| `"fails": true` | The value failed ([Failures](failures.md)) |
| `"fails": false` | The read gives a value. `null` and `undefined` count as values, including the `undefined` of a missing name |
| `"type": <name>` or an array of names | The value's type is one of those listed. A failed read fails the test |

| Type name | Values |
|---|---|
| `number` | Numbers, `NaN` and infinities included |
| `string` | Strings |
| `boolean` | `true`, `false` |
| `null` | `null` |
| `undefined` | `undefined` |
| `array` | Arrays |
| `function` | Functions |
| `symbol` | Symbols |
| `bigint` | BigInts |
| `object` | Every other value, nodes included |

Each name follows `typeof`, except that `null` and arrays have names of their own.

JSON has no literal for `NaN` or the infinities. To test for them, call `Number.isFinite` or `Number.isNaN` on the value ([Calls](#calls)), or give `eq` `Infinity` as an expression: `{"eq": {"api": "Infinity"}}`. Inside a `where` or `field`, `define` the value before the source and compare with its `ref` ([Sources in `where` and `field`](sources.md#sources-in-where-and-field)), or use `Number.isFinite`.

| Predicate | `foo` is not present | `foo`'s getter throws | `foo` is `null` | `foo` is `"7"` | `foo` is `8` |
|---|---|---|---|---|---|
| `{"foo": 8}` | `false` | Fails | `false` | `false` | `true` |
| `{"foo": {"gt": 7}}` | `false` | Fails | `false` | `false` | `true` |
| `{"foo": {"gte": 0}}` | `false` | Fails | `true` | `true` | `true` |
| `{"foo": {"type": "undefined"}}` | `true` | Fails | `false` | `false` | `false` |
| `{"foo": {"fails": false}}` | `true` | `false` | `true` | `true` | `true` |
| `{"foo": {"fails": true}}` | `false` | `true` | `false` | `false` | `false` |
| `{"foo": {"fails": false, "gt": 7}}` | `false` | `false` | `false` | `false` | `true` |
| `{"foo": {"type": "number", "gte": 0}}` | `false` | Fails | `false` | `false` | `true` |
| `{"foo": {"field": {"api": {"path": "Number.isFinite", "args": [{"self": {}}]}}, "is": true, "gt": 7}}` | `false` | Fails | `false` | `false` | `true` |

```json
{"responseStatus": {"gte": 400}}
{"sheet": {"type": "object"}}
{"value": {"type": ["string", "null"]}}
```

A comparison on a missing field is `false` and doesn't fail. On an engine without `responseStatus`, the field reads `undefined` and `undefined >= 400` is `false`, so the number of entries the first line keeps is 0, and a payload reports 0. To report that the engine doesn't support the field instead, use an `if` over whether the property is present ([Presence](#presence)).

### Presence

A property is present when `Reflect.has` returns `true` for it, the same as JS `in`: it's on the object or its prototype chain, whatever its getter returns or throws. To check per item, `self` passes the item. To check the engine, pass the interface's prototype instead:

```json
{"field": {"api": {"path": "Reflect.has", "args": [{"self": {}}, "responseStatus"]}}, "is": true, "responseStatus": {"gte": 400}}
{"if": {"api": {"path": "Reflect.has", "args": [{"api": "PerformanceResourceTiming.prototype"}, "responseStatus"]}},
 "then": {"api": {"path": "performance.getEntriesByType", "args": ["resource"], "where": {"responseStatus": {"gte": 400}}}, "using": "length"},
 "else": "unsupported"}
```

In `where`, the first keeps the entries that have `responseStatus` and an error status. The second counts the entries with an error status on an engine with `responseStatus`, and reads `"unsupported"` on one without it, which a payload can send through a bucket of its own ([Buckets](payloads.md#buckets)). A `responseStatus` getter that throws aborts both.

## Order

| Rule | Detail |
|---|---|
| `fails` and `type` | Tested first in their object. When either doesn't hold, the object is `false`, and its other keys aren't read |
| Other keys | Every one is tested, with `field` and its `is` tested together. The object holds when every key holds. The order among them is unspecified |
| `any`, `all`, `none`, `in` | Every entry is tested, in order |

`{"cssRules": {"fails": false, "length": 0}}` only reads `length` where `cssRules` doesn't throw. `{"cssRules": {"fails": false}, "cssRules.length": 0}` reads both, and fails where `cssRules` throws. When several keys fail, which failure gets reported is unspecified.

## Property reads

| Rule | Detail |
|---|---|
| One property per name | A key, each name in a `field` path and each name in an `api` `path` are all read the same way |
| Builtins an `api` reads | The browser's own getter or method, captured when C-S-S loads its detectors, so a page replacing it later doesn't change the read. If an object has its own value in place of a builtin property, such as an error's own `message`, it's read as a value. A getter the page defines there isn't called, and the read fails with `PageAccessor` |
| Other properties | Read as they are at the time of the read, whoever defined them: properties of elements, of entries a call returns, and those a browser defines on each object, such as `location.href` |
| Not present | A name that isn't on the object or its prototype chain reads `undefined`, as in JS |
| A getter that throws | Fails ([Failures](failures.md#kinds)) |
| A getter returning `undefined` | The value `undefined` |
| `length` on a string | The length, read directly |
| A name in a path after `null` or `undefined` | The value `undefined`, as `?.` gives |
| A method call | The method, found as the rows above describe, called with `args`. A name whose value isn't a function, or a method that throws anything, fails ([Failures](failures.md#kinds)) |
| Cost | A property that forces layout, such as `offsetWidth`, forces it once per item |

A detector reading `value` could expose what a user typed into a password field: its length through `value.length`, whether it matches a literal through equality, or the text itself through `field`. Add `:not([type=password])` to the selector of any detector reading `value`.

### Page code

Web detection reads the page without running page code where it can, but this isn't guaranteed. Treat any read or call as one that may run page code, and any value a detector reads as one the page controls. Page code can run through:

| Case | Example |
|---|---|
| A builtin the page replaced before C-S-S loaded its detectors | A wrapped `getComputedStyle`. C-S-S loads them when its script loads, or at `init` when the client sends the config later |
| A property read as it is | A getter the page defines on an element |
| A method that calls back into the page | `Array.from` and `Object.fromEntries` use the iterator as the page leaves it. `matchAll` reads `Symbol.matchAll` and `exec` from `RegExp.prototype` as the page leaves them |
| A function passed to a method that calls it | `Reflect.apply`, `Function.prototype.call`, `Array.prototype.map` ([Allowed names](sources.md#allowed-names)) |

Prefer reads with no side effects.

## Failures

A predicate fails when the value it tests, a property it reads or an operand fails. In `where`, the source fails, and under `is`, the test fails ([Failures](failures.md#propagation)).

`fails` in `where` is tested on each item, so an item whose read fails is excluded and the source doesn't fail. On a page with a cross-origin stylesheet, the first counts the readable stylesheets with no rules, and the second fails:

```json
{"api": {"path": "document.styleSheets", "where": {"cssRules": {"fails": false, "length": 0}}}, "using": "length"}
{"api": {"path": "document.styleSheets", "where": {"cssRules.length": 0}}, "using": "length"}
```

## Authoring rules

### Comparison guards

CI rejects these predicates, which either never hold for a value that's read, or coerce a value that the config types as something other than a number:

- `"fails": true` beside any other key: the key reads the failed value, and the detector aborts.
- Beside `type`, a comparison on a listed type other than `number`, such as `gt` beside `"type": ["string", "null"]`.
- `Number.isFinite` or `Number.isNaN` called on the value and required to hold, beside a `type` that leaves out `number`.
- A comparison on a value that the config shows can be something other than a number, such as an element property that can be `null` (where `null >= 0` holds), unless `type`, or `Number.isFinite` called on the value and required to hold, comes before it.

A string literal that converts to `NaN`, such as `"unsupported"` from an `if` branch, doesn't need a guard, since a comparison on it is `false`.

When the value can be `NaN`, CI requires `Number.isFinite` or `Number.isNaN` called on the value beside a comparison under `none`. A value can be `NaN` when it's a `div`, an operator over such a value, a builtin that returns a number (such as `Math.max` or `Math.max.apply`), or an element property the allowlist types as a number that can be `NaN`. A comparison on `NaN` is `false`, so `none` over it holds.

### Property paths

CI rejects a property path on a value it types as a number or a boolean, and any path on a string other than `length` and an index.
