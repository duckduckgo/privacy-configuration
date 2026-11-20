# Expressions

An expression is a literal, or an object whose key is a source, [`self`](#self), an operator, `if`, `ref` or an [action](overview.md#action-keys). Sources read the page, operators combine what sources read, and [`is`](#is) tests a value with a [predicate](predicates.md) and gives a boolean.

Every expression either gives a value or fails ([Failures](#failures)), and the position it's in expects a certain type of value ([Positions](#positions)). An array is never an expression on its own, so what it means depends on the key it's under ([Arrays](#arrays)).

A condition (a detector's [`match`](overview.md#match) or the condition of an `if`) is an expression in boolean position. Each object has one expression key, so `all` is used to AND several, and `any` / `all` / `none` can nest at any level. Conditions are built from the `text` and `element` conditions ([Conditions](conditions.md)) and the expressions below.

## Values

| Type | Values |
|---|---|
| Boolean | `true`, `false` |
| Number | Numbers, `NaN` and infinities included |
| List | Items in order: what `element` and `text` select, an iterable other than a string or a node that `api` reads, the items an `api` `where` or `field` gives, and the values of [`expr`](#expr) over an array |
| Any value | Every value a read can give, including strings, `null`, `undefined` and objects. An action gives `undefined` |

| Source | Gives |
|---|---|
| `element` | A list of the elements selected, or with `field`, of each one's value |
| `text` | A list of each match's string |
| `api` | The value its path reads or its call returns. An iterable other than a string or a node is a list too, and an `api` with `where`, or with `field` on a list, gives a list |
| [`self`](#self) | What an `api` with the same body gives, read from the value `self` is bound to |

See [Sources](sources.md) for each source's keys and items.

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

A value of a type its position doesn't expect fails ([Values that do not fit](failures.md#values-that-do-not-fit)), and CI rejects it when the type can be told from the config ([Types](validation.md#types)). An `api` value's type is checked when it's read: `{"api": "document.hidden"}` is a boolean in boolean position, and `{"api": {"path": "document.readyState"}, "is": "complete"}` tests a string.

`element` and `text` always give lists, so their type is known from the config. In boolean position, a selected list holds when it has at least one item. As an operand of `any`, `all` and `none`, `element` without `field` and `text` each count as one such boolean, while other lists contribute each of their items. CI rejects `element` with `field`, and `api` or `self` with `where`, as a condition (directly or through a `ref` to a name bound to one), because they look like a test of their values. Use `only` to get the one item, or `"using": "length"` to count them.

This table shows what each expression gives in each position. "Refused by CI" marks a type that the config shows is wrong for that position. CI rejects it ([Types](validation.md#types)), and on device it fails when it's read, the same as a type that's only known at read time ([Values that do not fit](failures.md#values-that-do-not-fit)):

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

`element` and `text` give a selected list, and so does an `api` with `where`, or with `field` on a list. Where one value is needed, a selected list gives its one item:

| Where | A selected list gives |
|---|---|
| Number position, and the operand of `eq` | Its one item |
| `is`, a payload `when` or a bucket whose predicate compares: `lt`, `lte`, `gt`, `gte`, `eq`, `in` or a literal, at its top level or in its `any`, `all` or `none` entries | Its one item, which every key of the predicate tests |
| `is`, a payload `when` or a bucket whose predicate does not compare: `{}`, property paths, `field`, `fails`, `type` | The list, as an array |
| The expression beside [`using`](#using) | The list, as an array |
| Payload `value` | The list, which each bucket tests as above. Without buckets, the array of its items ([Payload spec](payloads.md#payload-spec)) |

Taking its one item fails on a list with no items or several ([Values that do not fit](failures.md#values-that-do-not-fit)). An iterable that an `api` reads directly is a value, and stays one.

```json
{"element": {"selector": "video", "field": "duration"}, "is": {"gt": 60}}
{"element": {"selector": "img"}, "is": {"length": {"gte": 5}}}
{"div": [{"element": {"selector": "video", "field": "currentTime"}}, {"element": {"selector": "video", "field": "duration"}}]}
```

The first tests the duration of the page's one video, the second whether the page has five images or more, and the third divides two one-item lists: the share of the video played.

`any`, `all`, `none`, `sum` and `mul` take an array of operands or a single operand. An operand that's a list contributes each of its items:

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
| `div` | Number | Two numbers | `a ÷ b` |  |
| `any`, `all`, `none` | Boolean | Booleans and lists | At least one, every one, or no operand true | `false`, `true`, `true` |
| [`if`](#if) | What its branches give: a boolean, a number or a value. Without `else`, a value | A condition, `then` and an optional `else` | `then` when the condition holds, `else` otherwise, `undefined` with no `else` |  |
| [`expr`](#expr) | What its operand gives, or over an array a list | One expression, or an array of them | The operand's value, or with `is` on the operand, the boolean it gives. Over an array, a list of the entries' values |  |
| Number literal, `0.7` | Number |  | The number |  |
| Boolean literal, `true` or `false` | Boolean |  | The boolean |  |
| String literal, `"fast"`, and `null` | Any value |  | The string or `null` |  |
| `ref` | What the name is bound to |  | The name's binding, `undefined` when unbound ([Names](#names)) |  |

A boolean is a value, so a payload can send a named `all`. Numbers only become booleans through `is`.

`only` takes a list's one item where the position doesn't unwrap it, such as the `navigation` entry from the array an `api` reads, or the one element a value is read from:

```json
{"define": {"navigation": {"only": {"api": {"path": "performance.getEntriesByType", "args": ["navigation"]}}}}}
{"only": {"element": {"selector": "my-widget"}}, "using": "shadowRoot"}
```

The item can go in any position, so a boolean item works as a condition, and an item that's a list adds each of its entries under `sum`, `any` and the other operators that take lists. In boolean position, this holds when the page's one image has loaded:

```json
{"only": {"element": {"selector": "img", "field": "complete"}}}
```

`at` through [`using`](#using) takes an item by position from a list with several items, and reads every item. `-1` is the last one. `at` on a list with no items gives `undefined`, which you can test with `"type": "undefined"`.

See [Counting and arithmetic](recipes.md#counting-and-arithmetic) for negation, subtraction, the smallest or largest item and capping a value. JS builtins are called through `api` ([Arguments](sources.md#arguments)).

Operators compute the same way JS does. `div` by 0 gives `Infinity`, `-Infinity` or `NaN`, and a `NaN` operand makes the result `NaN`. To test a result, call `Number.isFinite` or `Number.isNaN` on it ([Calls](predicates.md#calls)), and use [`if`](#if) to guard a denominator.

## Arrays

What an array means depends on the key it's under:

| Key | Its array |
|---|---|
| `actions`, and `then` and `else` of [`if`](#if) | A sequence, run in order ([Sequences](#sequences)) |
| `any`, `all`, `none`, `sum`, `mul` | The operands. A single operand doesn't need an array |
| `div` | The two operands |
| [`expr`](#expr) | A list of the entries' values |
| `args` | A JS array of the entries' values ([Arguments](sources.md#arguments)) |
| `element`, `text` | Bodies, selecting the union of their items |
| `root` | Roots, scoping to the union of their nodes ([`root`](sources.md#root)) |
| `selector`, `pattern`, `xpath` | Alternatives within one body ([Sources](sources.md)) |
| `in` | The values a predicate tests for ([Forms](predicates.md#forms)) |
| `type` | The type names a predicate tests for ([Failure and type](predicates.md#failure-and-type)) |
| `intervalMs` | The times an `auto` trigger runs |

Anywhere else, an array is a parse error, including an array inside an operand array, an `args` entry or a predicate. Use `any` for an OR, `{"expr": [...]}` for a list, and `in` to test for one of several values:

```json
{"any": [{"text": {"pattern": "adblocker"}}, {"element": {"selector": ".paywall"}}]}
{"api": {"path": "Array.of", "args": [{"expr": [1, 2]}, 3]}}
{"api": {"path": "performance.getEntriesByType", "args": ["navigation"], "field": "type"}, "is": {"in": ["navigate", "reload"]}}
```

## Failures

An expression fails when something goes wrong on the page at run time: a getter or method it calls throws, or a value doesn't fit the config, such as a value of the wrong type for its position. A failure propagates up through the expressions that contain it until `fails` in a predicate handles it ([`is`](#is)). See [Failures](failures.md) for the kinds of failure, what each does to a run, and how to guard against each.

## Modifiers

Modifiers go beside an object's expression key:

```json
{"element": {"selector": "img"}, "using": "length"}
{"element": {"selector": "img"}, "using": "length", "is": {"gte": 5}}
```

Modifiers apply in the order `using`, `is`: `using` computes from the expression's value, and `is` tests what `using` gives.

| Modifier | On | Meaning |
|---|---|---|
| `using` | An object with an expression key | An expression over the expression's value, which `self` reads ([`using`](#using)) |
| `is` | An object with an expression key | Tests the value with a predicate, giving a boolean ([`is`](#is)) |

An object has one expression key, and `{}` isn't an expression. To AND several conditions, use `{"all": [...]}`.

`define` binds a value to a name, and `ref` reads it ([Names](#names)). Here one `define`d `element` holds in an `if` condition when it selects an image, and is used as a list through `using`:

```json
"actions": [
  {"define": {"images": {"element": {"selector": "img"}}}},
  {"if": {"ref": "images"},
   "then": {"breakageReportData": {"data": {"images": {"value": {"ref": "images", "using": "length"}}}}}}
]
```

### `using`

`using` takes an expression over the value of the expression beside it, which [`self`](#self) reads. A path, or an `api` body of `path`, `args`, `where` and `field`, is short for a `self` with that body. A selected list reaches it as an array ([Selected lists](#selected-lists)). The expression beside `using` is computed once, and every `self` that reads it gets that value.

```json
{"element": {"selector": "img"}, "using": "length"}
{"ref": "navigation", "using": "loadEventEnd"}
{"api": {"path": "document"}, "using": {"path": "fonts", "where": {"status": "error"}}}
{"ref": "navigation", "using": {"div": [{"self": "transferSize"}, {"self": "decodedBodySize"}]}}
{"element": {"selector": "img", "field": "naturalWidth"}, "using": {"api": {"path": "Math.max.apply", "args": [null, {"self": {}}]}}}
```

The first is the number of images, the second a field of the named `navigation` entry, the third the fonts that failed to load, the fourth the navigation's transfer size over its decoded body size, and the fifth the widest image's natural width.

`"using": "length"` on a selected list is the number of its items. On any other value, `length` reads the value's own property, such as a string's or an array's length. A `FontFaceSet` has `size` but no `length`, so `length` on it reads `undefined`.

### `self`

`self` reads from the value bound by the innermost `using`, `where` or `field` around it, the same way an [`api`](sources.md#api) reads from the global object. Its body is an `api` body: a path, or an object of `path`, `args`, `where` and `field`, where `path` is optional. `{}` is the bound value itself, and `"length"` on a selected list counts its items, like `"using": "length"` does.

| Binder | `self` is |
|---|---|
| `using` | The value of the expression beside it |
| `where` | Each item it tests ([Lists](sources.md#lists-where-and-field)) |
| `field` | The item or value it reads from, in a source and in a predicate ([Long form](predicates.md#long-form)) |

A predicate's operands and `is` don't bind anything, so under a key in `where`, `self` is still the item. A `where` or `field` nested inside another binds `self` to its own items or values.

At item level in `where`, an object with an expression key other than `any`, `all` and `none` is an expression in boolean position over the item, and any other object is a predicate ([Keys](predicates.md#keys)). `any`, `all` and `none` there can take both. The first counts the cards containing an image, the second the resources that have `responseStatus`, and the third the complete images whose `naturalWidth` is 0:

```json
{"element": {"selector": ".card", "where": {"element": {"selector": "img", "root": {"self": {}}}}}, "using": "length"}
{"api": {"path": "performance.getEntriesByType", "args": ["resource"], "where": {"api": {"path": "Reflect.has", "args": [{"self": {}}, "responseStatus"]}}}, "using": "length"}
{"element": {"selector": "img", "where": {"all": [{"complete": true}, {"self": "naturalWidth", "is": 0}]}}, "using": "length"}
```

To read a property with the same name as an expression key, use `self` or the long form: `{"self": "text", "is": "Sign in"}`. See [Forms](predicates.md#forms) for `self` in a predicate operand, and [Lists](sources.md#lists-where-and-field) for `self` in `field`.

An expression that reads `self` is computed once for each value its binder binds: once per item of a `where` or `field`, and once per evaluation of a `using`. An expression inside a `where` or `field` that doesn't read `self` is computed once per evaluation of the source. CI rejects a source there that reads neither `self` nor a `ref` ([Sources in `where` and `field`](validation.md#sources-in-where-and-field)), so bind a value that's the same for every item with `define` before the source, and read it through `ref`.

### `expr`

`expr` gives its operand's value in its own position, so one value can take a second set of modifiers. Here's the number of images, capped at 100:

```json
{"expr": {"element": {"selector": "img"}, "using": "length"}, "using": {"api": {"path": "Math.min", "args": [{"self": {}}, 100]}}}
```

An operand with `is` gives the boolean result of its test ([`is`](#is)).

Over an array, `expr` gives a list of the entries' values. Each entry is in value position, and an entry that's a selected list becomes an array of its items, as in `args`. Every entry is computed in order when the list is, and if one entry fails, the list fails. The list can go in value position and in the positions that take a list: an operand of `only`, `any`, `all`, `none`, `sum` and `mul`, `root`, the expression beside `using`, an `args` entry and an entry of `in`. In number or boolean position it fails, and CI rejects it there. A payload without buckets sends it as an array. Here are the images' widths after a leading 100:

```json
{"expr": [100], "using": {"path": "concat", "args": [{"element": {"selector": "img", "field": "naturalWidth"}}]}}
```

## `is`

`is` takes a [predicate](predicates.md). The object it's on gives a boolean, in boolean or value position, and the object's expression key computes the value for the predicate to test. A selected list reaches a comparing predicate as its one item ([Selected lists](#selected-lists)).

```json
{"element": {"selector": "img"}, "using": "length", "is": {"gte": 5}}
{"ref": "images", "is": {"gte": 5}}
```

With `images` bound to the number of images, the two are the same test. In value position, the object gives its boolean: `{"define": {"seen": {"ref": "images", "is": {"gte": 5}}}}` binds `true` or `false`, and a payload `value` of the same object sends it.

`fails` and `type` in the predicate test the value as it reaches `is` (including a failure), before the other keys ([Failure and type](predicates.md#failure-and-type)). On a page with a cross-origin stylesheet, whose `cssRules` getter throws, the first is `false` and the second aborts:

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
| `else` | Optional. An expression or a sequence, evaluated when the condition doesn't hold |
| Value | The value of the branch taken. With no branch taken, `undefined`, which is different from a `null` read from the page |
| Modifiers | `using` and `is` beside `if` apply to the value of the branch taken |

Only the branch taken is evaluated. Here the broken-image ratio is 0 on a page with no images:

```json
{"if": {"ref": "images", "is": {"gt": 0}},
 "then": {"div": [{"element": {"selector": "img", "where": {"complete": true, "naturalWidth": 0}}, "using": "length"}, {"ref": "images"}]},
 "else": 0}
```

With `fails` in the condition, `if` can give a value in place of a failed read ([A value in place of a throwing read](recipes.md#a-value-in-place-of-a-throwing-read)). It can also skip a read that would fail before a precondition holds ([First paint as a fallback](recipes.md#first-paint-as-a-fallback)).

If a name is only bound by a `define` in the branch not taken, it reads `undefined` after the `if`, so a payload reading it leaves its key out.

## Sequences

An array in [`actions`](overview.md#actions), or in `then` or `else` of [`if`](#if), is a sequence. Its elements are evaluated in order, and its value is the last element's value. The other elements' values are discarded, and if any element fails, the sequence fails ([Failures](failures.md)).

Use `if` to choose which actions run. Here every run writes the count, and the event fires on each run where the page has five or more broken images (inside a [once guard](recipes.md#doing-something-once), it fires only once):

```json
"actions": [
  {"define": {"broken": {"element": {"selector": "img", "where": {"complete": true, "naturalWidth": 0}}, "using": "length"}}},
  {"breakageReportData": {"data": {"broken": {"value": {"ref": "broken"}}}}},
  {"if": {"ref": "broken", "is": {"gte": 5}}, "then": {"fireEvent": {"type": "brokenImages"}}}
]
```

To take the first condition that holds, chain `if`s by nesting each one in the previous `else`:

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
| Write | `define` evaluates each value in place, in the order its keys are listed in config, and binds each name before evaluating the next value. `{"define": {"x": a, "y": b}}` is `[{"define": {"x": a}}, {"define": {"y": b}}]`, so `b` reads `x` |
| Rebinding | Allowed. The latest binding wins |
| Read | `{"ref": "x"}` reads the binding at the time of the read, in its own position |
| A list | Bound as its items, read in full when `define` runs, so every `ref` reads the same items. A name bound to `element` without `field`, or to `text`, holds in boolean position, and as an operand of `any`, `all` and `none`, when it has an item |
| Unbound | Reads `undefined`: a run name before its first `define` in the run, a detector name before its first `define` in the frame, and a name defined in an `if` branch not taken. `"type": "undefined"` tests it, and `{"is": true}` doesn't hold for it |
| A failed value | The `define` fails and doesn't bind anything. The name keeps its earlier binding, so a name is never bound to a failure ([Failures](failures.md)) |

A detector name keeps its value across runs, so it can store a count of reads, a first-seen time, the previous read, or a flag that an action has run ([Doing something once](recipes.md#doing-something-once), [Detector shapes](recipes.md#detector-shapes)).

## Evaluation

| Rule | Detail |
|---|---|
| Order | The operands of an array are evaluated in array order, and an object's keys in an unspecified order, so when several fail, which failure is reported and which keys run before it is unspecified. Use `{"all": [...]}` to fix the order |
| Operators | `any`, `all`, `none`, `sum`, `mul`, `div` and `expr` over an array evaluate every operand. `{"any": [a, b]}` evaluates `b` even when `a` holds |
| Failures | A failure ends evaluation where it happens, and propagates up, so the operands after it aren't evaluated ([Failures](#failures)) |
| `if` | Evaluates its condition, then only the branch taken. It's the only expression that skips part of its config, so use it to guard a costly read, a read that fails before a precondition holds, or an action |
| Each evaluation | An expression is computed each time evaluation reaches it, and a source reads the page each time, except where a binder keeps its value ([`self`](#self)). To read a value in several places, bind it once with `define` and read it through `ref` |
| `ref` | Reads the binding at the time of the read, so a `ref` after a `define` reads the new value |

To stop a later operand from being evaluated, the guard must be an `if`. On a page with no `first-contentful-paint` entry, the first one below is `'aborted'`, since `only` over no items is still evaluated, and the second is `false`:

```json
{"all": [
  {"api": {"path": "performance.getEntriesByName", "args": ["first-contentful-paint", "paint"]}, "using": "length", "is": {"gt": 0}},
  {"only": {"api": {"path": "performance.getEntriesByName", "args": ["first-contentful-paint", "paint"], "field": "startTime"}}, "is": {"lt": 1800}}
]}
{"if": {"api": {"path": "performance.getEntriesByName", "args": ["first-contentful-paint", "paint"]}, "using": "length", "is": {"gt": 0}},
 "then": {"only": {"api": {"path": "performance.getEntriesByName", "args": ["first-contentful-paint", "paint"], "field": "startTime"}}, "is": {"lt": 1800}},
 "else": false}
```
