# Predicates

A predicate tests a value. Four keys take one:

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
| An object | Every key holds. A key is a combinator, an operator, a property path, or `field` with `is` ([Keys](#keys)). `{}` holds for any value that is read |

| Operator | Holds when |
|---|---|
| `eq` | The value `===` the operand |
| `in` | The value `===` one of the operand's values. The operand is an array of entries, or one entry, and an entry giving a list contributes each item. `NaN` is in no list |
| `lt`, `lte`, `gt`, `gte` | The JS `<`, `<=`, `>` or `>=` of the value and the operand holds |
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

The operand of `eq`, `lt`, `lte`, `gt` and `gte`, and each entry of `in`, is an expression in value position ([Positions](expressions.md#positions)). In `where`, an operand reads the item under test through [`self`](expressions.md#self). Here `where` keeps resources that finished after the load event, and then those that took more than a second from their start:

```json
{"api": {"path": "performance.getEntriesByType", "args": ["resource"], "where": {"responseEnd": {"gt": {"ref": "loadEventEnd"}}}}}
{"api": {"path": "performance.getEntriesByType", "args": ["resource"], "where": {"responseEnd": {"gt": {"sum": [{"self": "startTime"}, 1000]}}}}}
```

`eq` against a ratio compares floats exactly. Use a range.

The comparison operators coerce as JS does: a comparison on `undefined` or `NaN` is `false`, and `null >= 0` and `"7" >= 7` hold. Every operator holds or not for every read value, so `none` over it inverts it, and `none` over a comparison on `undefined` holds. `type`, or `Number.isFinite` called on the value before them ([Calls](#calls)), keeps a comparison to numbers ([Failure and type](#failure-and-type)).

## Keys

At item level a predicate tests an item: an element, or a member of a list an `api` reads. The top of `where` is item level, and so are the operands of `any`, `all` and `none` there. Everywhere else, under a key, under `is` and in payload fields, a predicate tests a value.

An object ANDs its keys. Only the operator names depend on position:

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

A selected list under `is`, `when` or a bucket reaches the predicate as [Selected lists](expressions.md#selected-lists) says: `{"lt": 2000}` tests its one item, and `{"length": {"gte": 5}}` the number of items.

### Long form

`{"field": F, "is": P}` reads F from the item or value under test, and tests what it reads with P, as `is` on an expression tests the expression's value. F takes the forms `field` takes on a source ([Lists](sources.md#lists-where-and-field)), and binds [`self`](expressions.md#self) to the item or value under test. The long form reads what a property path cannot: a method call, an expression over the value through `self`, and a property named like a key the table reserves at that level:

```json
{"element": {"selector": "div", "where": {"field": {"path": "getAttribute", "args": ["role"]}, "is": "dialog"}}}
{"element": {"selector": "option", "where": {"field": "text", "is": "Sign in", "disabled": false}}}
{"api": "document.activeElement", "is": {"field": "type", "is": "checkbox"}}
```

### Calls

`{"field": {"api": {"path": F, "args": [{"self": {}}]}}, "is": P}` tests the value with a function F on the [`api` allowlist](sources.md#allowed-names): `{"self": {}}` passes the value, in any argument position and beside other arguments, and P tests what F returns. An object holds one `field`, so several calls on one value go under `all`, `any` or `none`:

```json
{"duration": {"field": {"api": {"path": "Number.isFinite", "args": [{"self": {}}]}}, "is": true, "gt": 0}}
{"duration": {"all": [{"field": {"api": {"path": "Number.isNaN", "args": [{"self": {}}]}}, "is": false}, {"field": {"api": {"path": "Number.isFinite", "args": [{"self": {}}]}}, "is": false}]}}
```

The first holds for a finite duration above 0, the second for an infinite one.

## Failure and type

| Operator | Holds when |
|---|---|
| `"fails": true` | The value failed ([Failures](failures.md)) |
| `"fails": false` | The read gives a value. `null` and `undefined` are values, a missing name's included |
| `"type": <name>` or an array of names | The value's type is a listed one. A failed read fails the test |

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

JSON has no literal for `NaN` or the infinities. `Number.isFinite` or `Number.isNaN` called on the value tests for them ([Calls](#calls)), and `eq` takes `Infinity` as an expression: `{"eq": {"api": "Infinity"}}`. Inside a `where` or `field`, CI refuses that `api`, since it reads neither `self` nor a `ref` ([Sources in `where` and `field`](validation.md#sources-in-where-and-field)), so `define` the value before the source and compare with its `ref`, or use `Number.isFinite`.

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

A comparison on a missing field is `false`, not a failure. On an engine without `responseStatus`, the field reads `undefined` and `undefined >= 400` is `false`, so the `length` of the entries the first line keeps reads 0, and a payload reports it. An `if` over the property's presence reports the engine instead ([Presence](#presence)).

### Presence

A property is present when `Reflect.has` holds for it, as JS `in` does: on the object or its prototype chain, whatever its getter returns or throws. Per item, `self` passes the item. For the engine, the interface's prototype stands in:

```json
{"field": {"api": {"path": "Reflect.has", "args": [{"self": {}}, "responseStatus"]}}, "is": true, "responseStatus": {"gte": 400}}
{"if": {"api": {"path": "Reflect.has", "args": [{"api": "PerformanceResourceTiming.prototype"}, "responseStatus"]}},
 "then": {"api": {"path": "performance.getEntriesByType", "args": ["resource"], "where": {"responseStatus": {"gte": 400}}}, "using": "length"},
 "else": "unsupported"}
```

In `where`, the first keeps the entries that have `responseStatus` and an error status. The second counts the entries with an error status on an engine with `responseStatus`, and reads `"unsupported"` on one without it, which a payload sends through a bucket of its own ([Buckets](payloads.md#buckets)). A `responseStatus` getter that throws aborts both.

## Order

| Rule | Detail |
|---|---|
| `fails` and `type` | Tested first in their object. When either does not hold, the object is `false`, and its other keys are not read |
| Other keys | Every one is tested, with `field` and its `is` tested together. The object holds when every key holds. The order among them is unspecified |
| `any`, `all`, `none`, `in` | Every entry is tested, in order |

`{"cssRules": {"fails": false, "length": 0}}` reads `length` only where `cssRules` does not throw. `{"cssRules": {"fails": false}, "cssRules.length": 0}` reads both, and fails where `cssRules` throws. Where several keys fail, which failure is reported is unspecified.

## Property reads

| Rule | Detail |
|---|---|
| One property per name | A key, each name in a `field` path and each name in an `api` `path` read the same way |
| Builtins an `api` reads | The browser's own getter or method, taken when C-S-S loads its detectors, so a page replacing it later does not change the read. An object's own value in place of a builtin property, such as an error's own `message`, is read as a value. A getter the page defines there is not called, and the read fails with `PageAccessor` |
| Other properties | Read as they stand when read, whoever defined them: properties of elements, of entries a call returns, and those a browser defines on each object, such as `location.href` |
| Not present | A name present nowhere on the object or its prototype chain reads `undefined`, as in JS |
| A getter that throws | Fails ([Failures](failures.md#kinds)) |
| A getter returning `undefined` | The value `undefined` |
| `length` on a string | The length, read directly |
| A name in a path after `null` or `undefined` | The value `undefined`, as `?.` gives |
| A method call | The method, as the rows above find it, called with `args`. A name whose value is not a function, or a method that throws anything, fails ([Failures](failures.md#kinds)) |
| Cost | A property that forces layout, such as `offsetWidth`, forces it once per item |

A detector reading `value` could expose what a user typed into a password field: its length through `value.length`, a match against a literal through equality, or the text itself through `field`. It adds `:not([type=password])` to its selector.

### Page code

Web detection reads the page without running page code where it can, with no guarantee. A detector treats any read or call as one that may run page code, and any value it reads as one the page controls. Page code can run through:

| Case | Example |
|---|---|
| A builtin the page replaced before C-S-S loaded its detectors | A wrapped `getComputedStyle`. C-S-S loads them when its script loads, or at `init` when the client sends the config later |
| A property read as it stands | A getter the page defines on an element |
| A method that calls back into the page | `Array.from` and `Object.fromEntries` use the iterator as the page leaves it. `matchAll` reads `Symbol.matchAll` and `exec` from `RegExp.prototype` as the page leaves them |
| A function passed to a method that calls it | `Reflect.apply`, `Function.prototype.call`, `Array.prototype.map` ([Allowed names](validation.md#allowed-names)) |

Prefer reads with no side effects.

## Failures

A predicate fails when the value it tests, a property it reads or an operand fails. In `where`, the failure is the source's, and under `is`, the test's ([Failures](failures.md#propagation)).

`fails` in `where` is tested on each item, so an item whose read fails is excluded and the source doesn't fail. On a page with a cross-origin stylesheet, the first counts the readable stylesheets with no rules, and the second fails:

```json
{"api": {"path": "document.styleSheets", "where": {"cssRules": {"fails": false, "length": 0}}}, "using": "length"}
{"api": {"path": "document.styleSheets", "where": {"cssRules.length": 0}}, "using": "length"}
```
