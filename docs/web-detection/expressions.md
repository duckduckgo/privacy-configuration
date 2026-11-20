# Expressions

An expression is a literal, or an object naming a source, [`self`](#self), an operator, `if`, `ref` or an [action](overview.md#action-keys). Sources read the page, operators combine what sources read, and [`is`](#is) tests a value with a [predicate](predicates.md), giving a boolean.

Every expression gives a value or fails ([Failures](#failures)), and the position it's in expects a type of value ([Positions](#positions)). An array is never an expression, so its meaning depends on the key it's under ([Arrays](#arrays)).

A condition, a detector's [`match`](overview.md#match) or the condition of an `if`, is an expression in boolean position. An object holds one expression key, `all` ANDs several, `any` / `all` / `none` nest at every level, and the leaves are the `text` and `element` conditions ([Conditions](conditions.md)) and the expressions below.

## Values

| Type | Values |
|---|---|
| Boolean | `true`, `false` |
| Number | Numbers, `NaN` and infinities included |
| List | Items in order: what `element` and `text` select, an iterable other than a string or a node that `api` reads, the items an `api` `where` or `field` gives, and the values of [`expr`](#expr) over an array |
| Any value | Every value a read gives, strings, `null`, `undefined` and objects included. An action gives `undefined` |

| Source | Gives |
|---|---|
| `element` | A list of the elements selected, or with `field`, of each one's value |
| `text` | A list of each match's string |
| `api` | The value its path reads or its call returns. An iterable other than a string or a node is a list too, and an `api` with `where`, or with `field` on a list, gives a list |
| [`self`](#self) | What an `api` with the same body gives, read from the value `self` is bound to |

Each source's keys and items are in [Sources](sources.md).

## Positions

| Position | Expects |
|---|---|
| `match`, the condition of `if`, an expression in `where` ([`self`](#self)) | A boolean |
| Operands of `any` / `all` / `none` | Booleans and lists of booleans |
| Operands of `sum` / `mul` | Numbers and lists of numbers |
| Operands of `div` | A number |
| Operand of `only` | A list |
| The expression an `is` tests, the expression beside [`using`](#using), the operand of `eq` or a comparison, payload `value`, a `define` value, `actions` and each element of a sequence ([Sequences](#sequences)) | Any value |
| `root` of `element` and `text` | A selector string, a node or a list of nodes, each entry of an array `root` included ([`root`](sources.md#root)) |
| `then` and `else` of [`if`](#if) | What the `if`'s position expects. In a sequence there, the last element must give that, and the elements before it can give any value. An `if` without `else` gives `undefined` when its condition doesn't hold. Under `sum`, `mul`, `any`, `all` and `none`, a branch that gives a list contributes each item, as an operand would |
| Operand of [`expr`](#expr) | What the `expr`'s position expects. With `is`, a boolean |

A value of a type its position does not expect fails ([Values that do not fit](failures.md#values-that-do-not-fit)), and CI refuses one whose type config shows ([Types](validation.md#types)). An `api` value's type is checked as it is read: `{"api": "document.hidden"}` is a boolean in boolean position, and `{"api": {"path": "document.readyState"}, "is": "complete"}` tests a string.

`element` and `text` always give lists, so their type is known from the config. In boolean position, a selected list holds when it has at least one item. As an operand of `any`, `all` and `none`, `element` without `field` and `text` are one such boolean each, and other lists contribute each item. CI refuses `element` with `field`, and `api` or `self` with `where`, as a condition, directly or through a `ref` to a name bound to one, since they read like a test of their values: `only` gives the one item, and `"using": "length"` counts them.

What each expression gives in each position. "Refused by CI" marks a type config shows is wrong: CI refuses it ([Types](validation.md#types)), and on device it fails as it is read, as a type known only when read does ([Values that do not fit](failures.md#values-that-do-not-fit)):

| Expression | Boolean | Number | Operand of `only` | Value |
|---|---|---|---|---|
| `element`, `text` | Holds when it selects an item | Refused by CI | The list | The list ([Selected lists](#selected-lists)) |
| `element` with `field` | Holds when it selects an item. Refused by CI | Its one item | The list | The list ([Selected lists](#selected-lists)) |
| `api`, `self` | Its value, checked when read | Its value, checked when read | Its value, when it is a list | Its value |
| `api` or `self` with `where`, or `field` on a list | Holds when it has an item. Refused by CI with `where` | Its one item | The list | The list ([Selected lists](#selected-lists)) |
| `only` | Its item, checked when read | Its item, checked when read | Its item, checked when read | Its item |
| `ref` | Its binding, checked when read. A bound list holds when it has an item. Refused by CI for a name bound to `element` with `field`, or to `api` or `self` with `where` | Its binding, checked when read | Its binding, checked when read | Its binding |
| `sum`, `mul`, `div`, a number literal | Refused by CI | A number | Refused by CI | A number |
| `any`, `all`, `none`, `is`, a boolean literal | A boolean | Refused by CI | Refused by CI | A boolean |
| `if` with `else` | As its branches | As its branches | As its branches | As its branches |
| `if` without `else`, a string literal, `null`, an action | Refused by CI | Refused by CI | Refused by CI | Its value |
| `expr` over an array | Refused by CI | Refused by CI | The list | The list |

### Selected lists

`element` and `text` give a selected list, and so does an `api` with `where`, or with `field` on a list. Where one value is needed, it gives its one item:

| Where | A selected list gives |
|---|---|
| Number position, and the operand of `eq` | Its one item |
| `is`, a payload `when` or a bucket whose predicate compares: `lt`, `lte`, `gt`, `gte`, `eq`, `in` or a literal, at its top level or in its `any`, `all` or `none` entries | Its one item, which every key of the predicate tests |
| `is`, a payload `when` or a bucket whose predicate does not compare: `{}`, property paths, `field`, `fails`, `type` | The list, as an array |
| The expression beside [`using`](#using) | The list, as an array |
| Payload `value` | The list, which each bucket tests as above. Without buckets, the array of its items ([Payload spec](payloads.md#payload-spec)) |

Its one item fails on a list with no item or several ([Values that do not fit](failures.md#values-that-do-not-fit)). An iterable an `api` reads directly is a value, and stays one.

```json
{"element": {"selector": "video", "field": "duration"}, "is": {"gt": 60}}
{"element": {"selector": "img"}, "is": {"length": {"gte": 5}}}
{"div": [{"element": {"selector": "video", "field": "currentTime"}}, {"element": {"selector": "video", "field": "duration"}}]}
```

The first tests the duration of the page's one video, the second whether the page has five images or more, and the third divides two one-item lists: the share of the video played.

`any`, `all`, `none`, `sum` and `mul` take an array of operands or a single operand. An operand that is a list contributes each item:

```json
{"sum": {"element": {"selector": "img", "field": "naturalWidth"}}}
{"sum": [{"element": {"selector": "video", "field": "duration"}}, 30]}
{"all": {"element": {"selector": "img", "field": "complete"}}}
```

The first is the images' total natural width, the second the total video duration plus 30, the third whether every image is complete.

Several bodies, such as `"element": [a, b]`, select the union of their items, so in boolean position the source holds when any body selects an item.

Items are in document order for `element`, and in the order the API returns them for `api`.

## Operators

| Expression | Gives | Operands | Value | With no items |
|---|---|---|---|---|
| `only` | Its item, checked when read | A list | The one item. Fails on several | Fails |
| `sum`, `mul` | Number | Numbers and lists | The sum or product | 0, 1 |
| `div` | Number | Two numbers | `a ÷ b` | — |
| `any`, `all`, `none` | Boolean | Booleans and lists | At least one, every one, or no operand true | `false`, `true`, `true` |
| [`if`](#if) | What its branches give: a boolean, a number or a value. Without `else`, a value | A condition; `then` and an optional `else` | `then` when the condition holds, `else` otherwise, `undefined` with no `else` | — |
| [`expr`](#expr) | What its operand gives, or over an array a list | One expression, or an array of them | The operand's value, or with `is` on the operand, the boolean it gives. Over an array, a list of the entries' values | — |
| Number literal, `0.7` | Number | — | The number | — |
| Boolean literal, `true` or `false` | Boolean | — | The boolean | — |
| String literal, `"fast"`, and `null` | Any value | — | The string or `null` | — |
| `ref` | What the name holds | — | The name's binding, `undefined` when unbound ([Names](#names)) | — |

A boolean is a value, so a payload sends a named `all`. Numbers become booleans only through `is`.

`only` takes a list's one item where no position unwraps it: the `navigation` entry from the array an `api` reads, or the one element a value is read from:

```json
{"define": {"navigation": {"only": {"api": {"path": "performance.getEntriesByType", "args": ["navigation"]}}}}}
{"only": {"element": {"selector": "my-widget"}}, "using": "shadowRoot"}
```

The item can go in any position, so a boolean item works as a condition, and an item that's a list adds each of its entries under `sum`, `any` and the other operators that take lists. In boolean position, this holds when the page's one image has loaded:

```json
{"only": {"element": {"selector": "img", "field": "complete"}}}
```

`at` through [`using`](#using) takes an item by position from a list with several, reading every item. `-1` is the last. `at` on a list with no items gives `undefined`, which `"type": "undefined"` tests.

Negation, subtraction, the smallest or largest item and a capped value are in [Counting and arithmetic](recipes.md#counting-and-arithmetic). JS builtins are called through `api` ([Arguments](sources.md#arguments)).

Operators compute as JS does. `div` by 0 gives `Infinity`, `-Infinity` or `NaN`, and a `NaN` operand makes the result `NaN`. `Number.isFinite` or `Number.isNaN` called on a result tests it ([Calls](predicates.md#calls)), and [`if`](#if) guards a denominator.

## Arrays

An array means what the key holding it says:

| Key | Its array |
|---|---|
| `actions`, and `then` and `else` of [`if`](#if) | A sequence, run in order ([Sequences](#sequences)) |
| `any`, `all`, `none`, `sum`, `mul` | The operands. A single operand needs no array |
| `div` | The two operands |
| [`expr`](#expr) | A list of the entries' values |
| `args` | A JS array of the entries' values ([Arguments](sources.md#arguments)) |
| `element`, `text` | Bodies, selecting the union of their items |
| `root` | Roots, scoping to the union of their nodes ([`root`](sources.md#root)) |
| `selector`, `pattern`, `xpath` | Alternatives within one body ([Sources](sources.md)) |
| `in` | The values a predicate tests for ([Forms](predicates.md#forms)) |
| `type` | The type names a predicate tests for ([Failure and type](predicates.md#failure-and-type)) |
| `intervalMs` | The times an `auto` trigger runs |

Anywhere else an array is a parse error, an array inside an operand array, an `args` entry or a predicate included. An OR is `any`, a list is `{"expr": [...]}`, and a test for one of several values is `in`:

```json
{"any": [{"text": {"pattern": "adblocker"}}, {"element": {"selector": ".paywall"}}]}
{"api": {"path": "Array.of", "args": [{"expr": [1, 2]}, 3]}}
{"api": {"path": "performance.getEntriesByType", "args": ["navigation"], "field": "type"}, "is": {"in": ["navigate", "reload"]}}
```

## Failures

An expression fails when something goes wrong on the page at run time: a getter or method it calls throws, or a value does not fit the config, such as a value of the wrong type for its position. A failure propagates up through the expressions holding it until `fails` in a predicate handles it ([`is`](#is)). The kinds of failure, what each does to a run and the guards against each are in [Failures](failures.md).

## Modifiers

Modifiers sit beside an object's expression key:

```json
{"element": {"selector": "img"}, "using": "length"}
{"element": {"selector": "img"}, "using": "length", "is": {"gte": 5}}
```

Modifiers apply in the order `using`, `is`: `using` computes from the expression's value, and `is` tests what `using` gives.

| Modifier | On | Meaning |
|---|---|---|
| `using` | An object with an expression key | An expression over the expression's value, which `self` reads ([`using`](#using)) |
| `is` | An object with an expression key | Tests the value with a predicate, giving a boolean ([`is`](#is)) |

An object holds one expression key, and `{}` is not an expression. `{"all": [...]}` ANDs several conditions.

A name holds a value `define` binds, and `ref` reads it ([Names](#names)). One `define`d `element` holds in an `if` condition when it selects an image, and is a list through `using`:

```json
"actions": [
  {"define": {"images": {"element": {"selector": "img"}}}},
  {"if": {"ref": "images"},
   "then": {"breakageReportData": {"data": {"images": {"value": {"ref": "images", "using": "length"}}}}}}
]
```

### `using`

`using` takes an expression over the value of the expression beside it, which [`self`](#self) reads. A path, or an `api` body of `path`, `args`, `where` and `field`, is short for a `self` with that body. A selected list reaches it as an array ([Selected lists](#selected-lists)). The expression beside `using` is computed once, and every `self` reading it reads that value.

```json
{"element": {"selector": "img"}, "using": "length"}
{"ref": "navigation", "using": "loadEventEnd"}
{"api": {"path": "document"}, "using": {"path": "fonts", "where": {"status": "error"}}}
{"ref": "navigation", "using": {"div": [{"self": "transferSize"}, {"self": "decodedBodySize"}]}}
{"element": {"selector": "img", "field": "naturalWidth"}, "using": {"api": {"path": "Math.max.apply", "args": [null, {"self": {}}]}}}
```

The first is the number of images, the second a field of the named `navigation` entry, the third the fonts that failed to load, the fourth the navigation's transfer size over its decoded body size, and the fifth the widest image's natural width.

`"using": "length"` on a selected list is the number of its items. On any other value, `length` is the value's property: a string's or an array's length. A `FontFaceSet` has `size` and no `length`, so `length` on it reads `undefined`.

### `self`

`self` reads from the value the innermost `using`, `where` or `field` around it binds, as an [`api`](sources.md#api) reads from the global object. Its body is an `api` body, a path or an object of `path`, `args`, `where` and `field`, with `path` optional. `{}` is the bound value itself, and `"length"` on a selected list counts its items as `"using": "length"` does.

| Binder | `self` is |
|---|---|
| `using` | The value of the expression beside it |
| `where` | Each item it tests ([Lists](sources.md#lists-where-and-field)) |
| `field` | The item or value it reads from, in a source and in a predicate ([Long form](predicates.md#long-form)) |

A predicate's operands and `is` bind nothing, so under a key in `where`, `self` is still the item. A `where` or `field` inside another binds `self` to its own items or values.

At item level in `where`, an object with an expression key other than `any`, `all` and `none` is an expression in boolean position over the item, and any other object is a predicate ([Keys](predicates.md#keys)). `any`, `all` and `none` there take both. The first counts the cards holding an image, the second the resources that have `responseStatus`, and the third the complete images whose `naturalWidth` is 0:

```json
{"element": {"selector": ".card", "where": {"element": {"selector": "img", "root": {"self": {}}}}}, "using": "length"}
{"api": {"path": "performance.getEntriesByType", "args": ["resource"], "where": {"api": {"path": "Reflect.has", "args": [{"self": {}}, "responseStatus"]}}}, "using": "length"}
{"element": {"selector": "img", "where": {"all": [{"complete": true}, {"self": "naturalWidth", "is": 0}]}}, "using": "length"}
```

A property named like an expression key is read through `self` or the long form: `{"self": "text", "is": "Sign in"}`. `self` in a predicate operand is in [Forms](predicates.md#forms), and in `field` in [Lists](sources.md#lists-where-and-field).

An expression reading `self` is computed once per value its binder binds: once per item of a `where` or `field`, and once per evaluation of a `using`. An expression inside a `where` or `field` that reads no `self` is computed once per evaluation of the source. CI refuses a source there that reads neither `self` nor a `ref` ([Sources in `where` and `field`](validation.md#sources-in-where-and-field)), so a value that's the same for every item is bound with `define` before the source and read through `ref`.

### `expr`

`expr` gives its operand's value in its own position, so one value can take a second set of modifiers. The number of images, capped at 100:

```json
{"expr": {"element": {"selector": "img"}, "using": "length"}, "using": {"api": {"path": "Math.min", "args": [{"self": {}}, 100]}}}
```

An operand carrying `is` gives the boolean its test gives ([`is`](#is)).

Over an array, `expr` gives a list of the entries' values. Each entry is in value position, and a selected list entry is an array of its items, as in `args`. Every entry is computed, in order, when the list is, and a failed entry fails the list. The list fills value position and the positions that take a list: an operand of `only`, `any`, `all`, `none`, `sum` and `mul`, `root`, the expression beside `using`, an `args` entry and an entry of `in`. In number or boolean position it fails, and CI refuses it there. A payload without buckets sends it as an array. The images' widths after a leading 100:

```json
{"expr": [100], "using": {"path": "concat", "args": [{"element": {"selector": "img", "field": "naturalWidth"}}]}}
```

## `is`

`is` takes a [predicate](predicates.md). The object it's on gives a boolean, in boolean or value position, and its expression key computes a value for the predicate to test. A selected list reaches a predicate that compares as its one item ([Selected lists](#selected-lists)).

```json
{"element": {"selector": "img"}, "using": "length", "is": {"gte": 5}}
{"ref": "images", "is": {"gte": 5}}
```

With `images` bound to the number of images, the two are the same test. In value position, the object gives its boolean: `{"define": {"seen": {"ref": "images", "is": {"gte": 5}}}}` binds `true` or `false`, and a payload `value` of the same object sends it.

`fails` and `type` in the predicate test the value as it reaches `is`, a failure included, before the other keys ([Failure and type](predicates.md#failure-and-type)). On a page with a cross-origin stylesheet, whose `cssRules` getter throws, the first is `false` and the second aborts:

```json
{"api": {"path": "document.styleSheets", "where": {"cssRules.length": 0}}, "using": "length", "is": {"fails": false, "lt": 3}}
{"api": {"path": "document.styleSheets", "where": {"cssRules.length": 0}}, "using": "length", "is": {"lt": 3}}
```

`"is": {}` holds whenever the value is read.

## `if`

```
{"if": C, "then": T, "else": E}
```

| Part | Rule |
|---|---|
| Condition | The value of the `if` key, an expression in boolean position |
| `then` | An expression or a sequence ([Sequences](#sequences)), evaluated when the condition holds |
| `else` | Optional. An expression or a sequence, evaluated when the condition does not hold |
| Value | The value of the branch taken. With no branch taken, `undefined`, distinct from a `null` the page holds |
| Modifiers | `using` and `is` beside `if` apply to the value of the branch taken |

Only the branch taken is evaluated. Here the broken-image ratio reads 0 on a page with no images:

```json
{"if": {"ref": "images", "is": {"gt": 0}},
 "then": {"div": [{"element": {"selector": "img", "where": {"complete": true, "naturalWidth": 0}}, "using": "length"}, {"ref": "images"}]},
 "else": 0}
```

With `fails` in the condition, `if` gives a value in place of a failed read ([A value in place of a throwing read](recipes.md#a-value-in-place-of-a-throwing-read)), and skips a read that would fail before a precondition holds ([First paint as a fallback](recipes.md#first-paint-as-a-fallback)).

A name a `define` in the branch not taken binds reads `undefined` after the `if`, so a payload reading it omits its key.

## Sequences

An array in [`actions`](overview.md#actions), or in `then` or `else` of [`if`](#if), is a sequence. Its elements are evaluated in order, and its value is the last element's. An element's value is discarded otherwise, and an element that fails fails the sequence ([Failures](failures.md)).

Use `if` to choose which actions run. Here every run writes the count, and the event fires on each run where the page has five or more broken images (inside a [once guard](recipes.md#doing-something-once), it fires only once):

```json
"actions": [
  {"define": {"broken": {"element": {"selector": "img", "where": {"complete": true, "naturalWidth": 0}}, "using": "length"}}},
  {"breakageReportData": {"data": {"broken": {"value": {"ref": "broken"}}}}},
  {"if": {"ref": "broken", "is": {"gte": 5}}, "then": {"fireEvent": {"type": "brokenImages"}}}
]
```

A chain that takes the first condition holding nests `if` in `else`:

```json
{"if": {"ref": "loadTime", "is": {"lt": 3000}},
 "then": {"fireEvent": {"type": "loadTime_fast"}},
 "else": {"if": {"ref": "loadTime", "is": {"lt": 8000}},
          "then": {"fireEvent": {"type": "loadTime_mid"}},
          "else": {"fireEvent": {"type": "loadTime_slow"}}}}
```

## Names

| Rule | Detail |
|---|---|
| `"x"` | A run name. Bound for the rest of the run |
| `"this.x"` | A detector name. Bound for the detector in its frame, across every run and trigger, for the life of the injection |
| Pattern | `^(this\.)?[a-zA-Z][a-zA-Z0-9_]*$` |
| Write | `define` evaluates each value where it stands, in the order the config lists its keys, and binds each name before evaluating the next value. `{"define": {"x": a, "y": b}}` is `[{"define": {"x": a}}, {"define": {"y": b}}]`, so `b` reads `x` |
| Rebinding | Allowed. The latest binding wins |
| Read | `{"ref": "x"}` reads the binding at the time of the read, in its own position |
| A list | Bound as its items, read in full when `define` runs, so every `ref` reads the same items. A name bound to `element` without `field`, or to `text`, holds in boolean position, and as an operand of `any`, `all` and `none`, when it has an item |
| Unbound | Reads `undefined`: a run name before its first `define` in the run, a detector name before its first `define` in the frame, and a name defined in an `if` branch not taken. `"type": "undefined"` tests it, and `{"is": true}` does not hold for it |
| A failed value | The `define` fails and binds nothing. The name keeps its earlier binding, so a name never holds a failure ([Failures](failures.md)) |

A detector name holds a value across runs: a count of reads, a first-seen time, the previous read, or a flag that an action has run ([Doing something once](recipes.md#doing-something-once), [Detector shapes](recipes.md#detector-shapes)).

## Evaluation

| Rule | Detail |
|---|---|
| Order | The operands of an array in array order. An object's keys in an unspecified order, so where several fail, which failure is reported and which keys run before it are unspecified. `{"all": [...]}` fixes the order |
| Operators | `any`, `all`, `none`, `sum`, `mul`, `div` and `expr` over an array evaluate every operand. `{"any": [a, b]}` evaluates `b` when `a` holds |
| Failures | A failure ends evaluation where it arises, and propagates up, so the operands after it are not evaluated ([Failures](#failures)) |
| `if` | Evaluates its condition, then the branch taken only. It is the one expression that skips part of its config, so it guards a costly read, a read that fails before a precondition holds, and an action |
| Each evaluation | An expression is computed each time evaluation reaches it, and a source reads the page each time, except where a binder keeps its value ([`self`](#self)). A value read in several places is bound once with `define` and read through `ref` |
| `ref` | Reads the binding at the time of the read, so a `ref` after a `define` reads the new value |

A guard that must stop a later operand is an `if`. On a page with no `first-contentful-paint` entry, the first is `'aborted'`, since `only` over no items is evaluated, and the second is `false`:

```json
{"all": [
  {"api": {"path": "performance.getEntriesByName", "args": ["first-contentful-paint", "paint"]}, "using": "length", "is": {"gt": 0}},
  {"only": {"api": {"path": "performance.getEntriesByName", "args": ["first-contentful-paint", "paint"], "field": "startTime"}}, "is": {"lt": 1800}}
]}
{"if": {"api": {"path": "performance.getEntriesByName", "args": ["first-contentful-paint", "paint"]}, "using": "length", "is": {"gt": 0}},
 "then": {"only": {"api": {"path": "performance.getEntriesByName", "args": ["first-contentful-paint", "paint"], "field": "startTime"}}, "is": {"lt": 1800}},
 "else": false}
```
