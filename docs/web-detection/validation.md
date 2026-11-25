# Validation

A detector's config is checked in two places: on device, where C-S-S parses it, and in this repository's CI, before it ships.

## On device

A detector with a parse error doesn't run. It's listed in breakage reports with `"errors": {"parse": "error"}` ([`webDetection` entries](breakageData-parameter.md#webdetection)).

### Detectors and actions

- A detector without `actions`.
- An object with an action key beside an expression key or a modifier.
- An unknown key in `fireEvent` or `breakageReportData`, and a `fireEvent` without a string `type`.
- A `define` that isn't an object, a name that doesn't match the [name pattern](expressions.md#names), and a value that isn't an expression in value position.
- `buckets` that isn't an array.

### Expressions

- An array in an expression position, including an `args` entry ([Arrays](expressions.md#arrays)).
- An object with no expression key, or with several, in any position, including `{}` and `is` or `using` without an expression key beside it. Use `{"all": [...]}` to AND several conditions.
- `using` other than a path, an object or an expression. A `using` body of `{}`, or with a key other than `path`, `args`, `where` and `field`.
- `self` outside every `using`, `where` and `field`. A `self` body with `args` and no `path`.
- An unknown expression key, an unknown key in a source body, an unknown key beside an operator key, or an unknown `visibility`. At item level in `where`, an object with an expression key beside a property path.
- An `if` without `then`, or with a key other than `then`, `else`, `using` and `is`. `then` or `else` without `if`.

### Predicates

- An array as a predicate, at any level. `in` tests for one of several values, and `any` for one of several predicates.
- An object with only one of `field` and `is`.
- An unknown type name.

## In CI

CI ([`tests/web-detection/config-tests.js`](../../tests/web-detection/config-tests.js)) checks every config the repository generates. Run it with `npm test`.

### Text and element conditions

- Every `pattern` compiles as a RegExp.
- Every `xpath` parses under the XPath 1.0 grammar, including XPath expressions reachable only through `patchSettings`.
- With `root`, every `xpath` starts `.//` ([`root`](sources.md#root)). A `text` whose `root` reads a shadow root, such as through `"using": "shadowRoot"`, takes no `xpath`.
- Every body of one `element` source has `field`, or none does.
- `chunkSize` is 0 or at least 1024, `chunkTail` is at most `chunkSize / 4`, and every `xpathConfig` value is a non-negative integer.

The XPath check only checks grammar. An XPath expression that parses can still select nothing on a real page, so test it against the page before shipping.

### Detectors

- An enabled detector whose `breakageReport` trigger is enabled has a `breakageReportData` action somewhere in its `actions`, in any platform's config once `conditionalChanges` apply. So a detector that only fires events needs `triggers.breakageReport.state` set to `"disabled"`.
- `match` doesn't contain an action or a `ref`, and a detector with `match` doesn't use detector names, since its `actions` only runs once.
- A `fireEvent` in a detector with no `match` warns, unless an `if` around it tests a detector name that a `define` within that `if`'s branch binds ([Doing something once](recipes.md#doing-something-once)).
- Every `fireEvent` type has a consumer in the same platform's config ([The consumer cross-check](authoring/shipping-a-detector.md#the-consumer-cross-check)), unless it starts `temp_`. No type starts `detectorPerf_`, which is reserved.
- Every `conditionalChanges` patch a client matches applies, and every path it replaces, removes or tests exists.
- Each detector enabled on an Apple release older than the first to ship C-S-S 19.0.0 has `actions` as an object with only `fireEvent` and `breakageReportData`, in the config that release matches.

### Payloads

- Every `fireEvent` payload field has `buckets`. A `breakageReportData` field may leave them out.
- Every payload key follows the rule in [Payload spec](payloads.md#payload-spec).

### Names

Group and detector names fully match `^[a-zA-Z][a-zA-Z0-9_]*$`. C-S-S doesn't check them, and uses each name exactly as it appears in config, in breakage reports and in `this.` names.

A `ref` to a run name has a `define` binding it earlier in evaluation order, and a `ref` to a detector name has a `define` in the detector binding it. A name bound earlier on only some paths (inside one `if` branch) passes, and reads `undefined` where it isn't bound.

### `root` guards

Every scoped expression has the guard described in [`root`](sources.md#root), either as an operand of the top-level `all` of the condition or `define` value that reads it, or in the condition of an enclosing `if`. The exceptions are:

- An expression read only in boolean position, with no `none` above it.
- A root of `{"self": {}}`.

In `match`, CI matches the guard to the root by comparing the expressions.

### Sources in `where` and `field`

A source inside a `where` or `field` must read `self` or a `ref`. A source that reads neither gives every item the same value, so CI rejects it. Instead, `define` the value before the source and read it through `ref`.

CI warns (without failing) on a `text` source rooted at a `where` or `field` item, such as through `"root": {"self": {}}`, with no `if` above it inside that `where` or `field`. A text read walks each item's subtree, so an `if` on a cheaper test can skip items ([Rendered text](recipes.md#rendered-text)).

### Element allowlist

Each name a detector reads on an element (through a property path, `field`, a `where` key, or `using` or `self`) must be on an allowlist of element properties and methods in this repository's CI. The allowlist is keyed by element interface, such as `HTMLImageElement` for `img`. Every element shares the `Element` and `HTMLElement` entries, and each property is listed with its type. A detector that reads a name not on the list needs to add it in the same change, and names that read user data or URLs must stay off it. CI rejects a read on a value whose interface isn't listed.

### Types

CI rejects:

- A type the [element allowlist](#element-allowlist) gives that's wrong for its position, such as a numeric `element` property under `all`.
- A type that the config shows is wrong for its position ([Positions](expressions.md#positions)): a literal or operator of the wrong type, an `if` without `else` outside value position, `expr` over an array in number or boolean position, `is` outside boolean and value position, `"using": "length"` outside value and number position, and an action outside value position. C-S-S runs these, and they fail when they're read.
- `element` with `field`, and `api` or `self` with `where`, as a condition, either directly or through a `ref` to a name bound to one. They hold when they have an item, which looks like a test of their values. Use `only` to get the one item, or `"using": "length"` to count them. CI allows a `ref` to a name bound to `element` without `field`, or to `text`, as a condition.
- An empty sequence, `define`, `root`, or `element` or `text` body list. C-S-S runs them, but they don't read or bind anything.
- An empty string as a `pattern`, `selector`, `xpath`, `root`, `path` or bucket name.
- An argument whose type the config shows is wrong for its method.

CI rejects a property path on a value it types as a number or a boolean, and any path on a string other than `length` and an index. It also rejects these predicates, which either never hold for a value that's read, or coerce a value that the config types as something other than a number:

- `"fails": true` beside any other key: the key reads the failed value, and the detector aborts.
- Beside `type`, a comparison on a listed type other than `number`, such as `gt` beside `"type": ["string", "null"]`.
- `Number.isFinite` or `Number.isNaN` called on the value and required to hold, beside a `type` that leaves out `number`.
- A comparison on a value that the config shows can be something other than a number, such as an element property that can be `null` (where `null >= 0` holds), unless `type`, or `Number.isFinite` called on the value and required to hold, comes before it.

A string literal that converts to `NaN`, such as `"unsupported"` from an `if` branch, doesn't need a guard, since a comparison on it is `false`.

When the value can be `NaN`, CI requires `Number.isFinite` or `Number.isNaN` called on the value beside a comparison under `none`. A value can be `NaN` when it's a `div`, an operator over such a value, a builtin that returns a number (such as `Math.max` or `Math.max.apply`), or an element property the allowlist types as a number that can be `NaN`. A comparison on `NaN` is `false`, so `none` over it holds.

### Method calls

- A method call on `element` items, in `using`, `self` or `field`, must be on the [element allowlist](#element-allowlist), whose methods leave the page unchanged.
- The list passed to `apply` must be one the config shows is a list: a selected list, an `api` with `field`, `{"expr": [...]}`, or one of these with `"using": {"path": "concat", …}`, which joins lists. CI rejects `Array.from`, `Array.of` and `Array.prototype.concat.call` there.

### Allowed names

An `api` only passes when every name it reads is on the allowlist in this repository's CI. A detector that reads a name not on the list needs to add it in the same change. The list only has names, without types, so use `type`, or `Number.isFinite` called on the value ([Calls](predicates.md#calls)), to guard the value a name reads ([Failure and type](predicates.md#failure-and-type)).

| Read | Name |
|---|---|
| `path` | The path: `document.readyState`, `performance.getEntriesByType` |
| Each name a `field` path reads, and a method it calls | The path, `.` and the field's names up to it: `document.title`, `document.title.length` |
| Each name a predicate reads on `api` items or values, through a property path or `field` | The path, `.` and the predicate's names up to it: `document.fonts.status`, `performance.getEntriesByType.duration`, `document.title.length` |
| `using`, and `self` under it | The name of the expression beside `using`, `.` and the path: `performance.getEntriesByType.loadEventEnd` |
| `self` in `where` or `field` | The name of the items or value it reads, `.` and the path, as a property path there names it: `performance.getEntriesByType.startTime` |
| An `api` in `args` | Its own names. A builtin from [Arguments](sources.md#arguments) is named by its path: `Math.max.apply`, `JSON.parse` |

The name of the expression beside `using` works like this:

- An `api` read, directly or through `ref` or `only`, is named by its own names.
- `at` and an index add no name, on a selected list or an `api` value: `at` on the `navigation` entries then `loadEventEnd` is `performance.getEntriesByType.loadEventEnd`. `length` adds no name on a selected list, and on an `api` value it's a name: `performance.getEntriesByType.length`.
- `concat` joins lists, and each item keeps the name of its list.
- An expression with several possible names, such as an `if` whose branches read different `api` names, is checked under each name. CI rejects one that gives none of an `api` read, an element or a selected list.

On an element, in `using`, `self` or `field`, names are checked against the [element allowlist](#element-allowlist) instead.

Some methods are read without being called:

- Before `apply`, `call` or `bind`: `Math.max.apply` reads `Math.max` and calls `Math.max.apply`, and both are listed as methods.
- As the last name of an `api` that's an `args` entry, passed to a method that calls a function it receives, such as `Reflect.apply`, `Function.prototype.call` or `Array.prototype.map`. CI checks it as a call of its own name, and rejects one it can't name. A method like this is only added to the list after reviewing which functions config can pass to it.

### Buckets

`buckets` is a non-empty array of objects, each with `name` and `is` and no other keys. Buckets are tested in array order, and the value is named by the first bucket whose `is` holds ([Buckets](payloads.md#buckets)). CI rejects:

- A bucket that can never be chosen, since the buckets before it cover all its values.
- Two numeric ranges that both include an endpoint they share, such as `{"gte": 1, "lte": 2}` then `{"gte": 2, "lte": 3}`. `gt` or `lt` on one side puts the endpoint in one range only.

CI warns (without failing) on any other overlap between buckets with different names. Overlap is only checked where predicates are literals, `in` over literals, or comparisons against literals. A literal is converted the same way a comparison converts it: `null` and `""` to 0, and `"7"` to 7.
