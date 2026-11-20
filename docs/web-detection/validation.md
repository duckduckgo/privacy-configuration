# Validation

A detector's config is checked in two places: on device, where C-S-S parses it, and in this repository's CI, before it ships.

## On device

A detector with a parse error does not run. It is listed in breakage reports with `"errors": {"parse": "error"}` ([`webDetection` entries](breakageData-parameter.md#webdetection)).

### Detectors and actions

- A detector without `actions`.
- An object holding an action key beside an expression key or a modifier.
- An unknown key in `fireEvent` or `breakageReportData`, and a `fireEvent` without a string `type`.
- A `define` that is not an object, a name that does not match the [name pattern](expressions.md#names), and a value that is not an expression in value position.
- `buckets` that is not an array.

### Expressions

- An array in an expression position, an `args` entry included ([Arrays](expressions.md#arrays)).
- An object with no expression key, or with several, in any position: `{}`, and `is` or `using` with no expression key beside it, included. `{"all": [...]}` ANDs several conditions.
- `using` other than a path, an object or an expression. A `using` body of `{}`, or with a key other than `path`, `args`, `where` and `field`.
- `self` outside every `using`, `where` and `field`. A `self` body with `args` and no `path`.
- An unknown expression key, an unknown key in a source body, an unknown key beside an operator key, or an unknown `visibility`. At item level in `where`, an object holding an expression key beside a property path.
- An `if` without `then`, or with a key other than `then`, `else`, `using` and `is`. `then` or `else` without `if`.

### Predicates

- An array as a predicate, at any level. `in` tests for one of several values, and `any` for one of several predicates.
- An object holding one of `field` and `is` without the other.
- An unknown type name.

## In CI

CI ([`tests/web-detection/config-tests.js`](../../tests/web-detection/config-tests.js)) checks every config the repository generates. Run it with `npm test`.

### Text and element conditions

- Every `pattern` compiles as a RegExp.
- Every `xpath` parses under the XPath 1.0 grammar, including XPath expressions reachable only through `patchSettings`.
- With `root`, every `xpath` starts `.//` ([`root`](sources.md#root)). A `text` whose `root` reads a shadow root, such as through `"using": "shadowRoot"`, takes no `xpath`.
- Every body of one `element` source has `field`, or none does.
- `chunkSize` is 0 or at least 1024, `chunkTail` is at most `chunkSize / 4`, and every `xpathConfig` value is a non-negative integer.

The XPath check is a grammar check. An XPath expression that parses can still select nothing on a real page, so validate it against the page before shipping.

### Detectors

- An enabled detector whose `breakageReport` trigger is enabled has a `breakageReportData` action somewhere in its `actions`, in any platform's config once `conditionalChanges` apply. A detector that fires events only sets `triggers.breakageReport.state` to `"disabled"`.
- `match` holds no action and no `ref`, and a detector with `match` uses no detector name, since its `actions` runs once.
- A `fireEvent` in a detector with no `match` warns, unless an `if` around it tests a detector name that a `define` within that `if`'s branch binds ([Doing something once](recipes.md#doing-something-once)).
- Every `fireEvent` type has a consumer in the same platform's config ([The consumer cross-check](authoring/shipping-a-detector.md#the-consumer-cross-check)), unless it starts `temp_`. No type starts `detectorPerf_`, which is reserved.
- Every `conditionalChanges` patch a client matches applies, and every path it replaces, removes or tests exists.
- Each detector enabled on an Apple release older than the first to ship C-S-S 19.0.0 has `actions` as an object with only `fireEvent` and `breakageReportData`, in the config that release matches.

### Payloads

- Every `fireEvent` payload field has `buckets`. A `breakageReportData` field may leave them out.
- Every payload key follows the rule in [Payload spec](payloads.md#payload-spec).

### Names

Group and detector names wholly match `^[a-zA-Z][a-zA-Z0-9_]*$`. C-S-S doesn't check them, and uses each name as config gives it, in breakage reports and in `this.` names.

A `ref` to a run name has a `define` binding it earlier in evaluation order, and a `ref` to a detector name has a `define` in the detector binding it. A name bound earlier only on some paths, inside one `if` branch, passes, and reads `undefined` where it is unbound.

### `root` guards

Every scoped expression has the guard of [`root`](sources.md#root), as an operand of the top-level `all` of the condition or `define` value reading it, or in the condition of an enclosing `if`. Exceptions:

- An expression read only in boolean position, with no `none` above it.
- A root of `{"self": {}}`.

In `match`, CI matches the guard to the root by equal expressions.

### Sources in `where` and `field`

A source inside a `where` or `field` reads `self` or a `ref`. A source reading neither gives every item the same value, so CI refuses it: `define` the value before the source and read it through `ref`.

CI warns, which fails no check, on a `text` source rooted at a `where` or `field` item, such as through `"root": {"self": {}}`, with no `if` above it inside that `where` or `field`. A text read walks each item's subtree, so an `if` on a cheaper test can skip items ([Rendered text](recipes.md#rendered-text)).

### Element allowlist

Each name a detector reads on an element, through a property path, `field`, a `where` key, or `using` or `self`, is on an allowlist of element properties and methods in this repository's CI. The allowlist is keyed by element interface, such as `HTMLImageElement` for `img`, every element shares the `Element` and `HTMLElement` entries, and each property is listed with its type. A detector reading a name not on it adds it in the same change, and names that read user data or URLs stay off it. CI refuses a read on a value whose interface isn't listed.

### Types

CI refuses:

- A type the [element allowlist](#element-allowlist) gives that is wrong for its position, such as a numeric `element` property under `all`.
- A type config shows is wrong for its position ([Positions](expressions.md#positions)): a literal or operator of the wrong type, an `if` without `else` outside value position, `expr` over an array in number or boolean position, `is` outside boolean and value position, `"using": "length"` outside value and number position, and an action outside value position. C-S-S runs these, and they fail as they are read.
- `element` with `field`, and `api` or `self` with `where`, as a condition, directly or through a `ref` to a name bound to one. They hold when they have an item, which reads like a test of their values: `only` gives the one item, and `"using": "length"` counts them. CI allows a `ref` to a name bound to `element` without `field`, or to `text`, as a condition.
- An empty sequence, `define`, `root`, or `element` or `text` body list. C-S-S runs them as reading or binding nothing.
- An empty string as a `pattern`, `selector`, `xpath`, `root`, `path` or bucket name.
- An argument whose type config shows is wrong for its method.

CI rejects a property path on a value it types as a number or a boolean, and on a string, any path other than `length` and an index. It also rejects these predicates, which never hold for a read value or coerce a value config types as other than a number:

- `"fails": true` beside any other key: the key reads the failed value, and the detector aborts.
- Beside `type`, a comparison on a listed type other than `number`, such as `gt` beside `"type": ["string", "null"]`.
- `Number.isFinite` or `Number.isNaN` called on the value and required to hold, beside a `type` that leaves out `number`.
- A comparison on a value whose type config shows can be other than a number, such as an element property that can be `null`, where `null >= 0` holds, unless `type`, or `Number.isFinite` called on the value and required to hold, comes before it.

A string literal that converts to `NaN`, such as `"unsupported"` from an `if` branch, needs no guard: a comparison on it is `false`.

CI requires `Number.isFinite` or `Number.isNaN` called on the value beside a comparison under `none` when the value can be `NaN`: a `div`, an operator over such a value, a builtin returning a number, such as `Math.max` or `Math.max.apply`, or an element property the allowlist types as a number that can be `NaN`. A comparison on `NaN` is `false`, so `none` over it holds.

### Method calls

- A method call on `element` items, in `using`, `self` or `field`, is on the [element allowlist](#element-allowlist), whose methods leave the page unchanged.
- `apply`'s list is one config shows is a list: a selected list, an `api` with `field`, `{"expr": [...]}`, or one of these with `"using": {"path": "concat", …}`, which joins lists. CI rejects `Array.from`, `Array.of` and `Array.prototype.concat.call` there.

### Allowed names

An `api` passes only when every name it reads is on the allowlist in this repository's CI. A detector reading a name not on the list adds it in the same change. The list holds names only, with no types: `type`, and `Number.isFinite` called on the value ([Calls](predicates.md#calls)), guard the value a name reads ([Failure and type](predicates.md#failure-and-type)).

| Read | Name |
|---|---|
| `path` | The path: `document.readyState`, `performance.getEntriesByType` |
| Each name a `field` path reads, and a method it calls | The path, `.` and the field's names up to it: `document.title`, `document.title.length` |
| Each name a predicate reads on `api` items or values, through a property path or `field` | The path, `.` and the predicate's names up to it: `document.fonts.status`, `performance.getEntriesByType.duration`, `document.title.length` |
| `using`, and `self` under it | The name of the expression beside `using`, `.` and the path: `performance.getEntriesByType.loadEventEnd` |
| `self` in `where` or `field` | The name of the items or value it reads, `.` and the path, as a property path there names it: `performance.getEntriesByType.startTime` |
| An `api` in `args` | Its own names. A builtin from [Arguments](sources.md#arguments) is named by its path: `Math.max.apply`, `JSON.parse` |

Naming the expression beside `using`:

- An `api` read, directly or through `ref` or `only`, is named by its own names.
- `at` and an index add no name, on a selected list or an `api` value: `at` on the `navigation` entries then `loadEventEnd` is `performance.getEntriesByType.loadEventEnd`. `length` adds no name on a selected list, and on an `api` value it's a name: `performance.getEntriesByType.length`.
- `concat` joins lists, and each item keeps the name of its list.
- An expression with several possible names, such as an `if` whose branches read different `api` names, is checked under each. CI rejects one giving neither an `api` read, an element nor a selected list.

On an element, in `using`, `self` or `field`, names are checked against the [element allowlist](#element-allowlist) instead.

Methods read without a call:

- Before `apply`, `call` or `bind`: `Math.max.apply` reads `Math.max` and calls `Math.max.apply`, and both are listed as methods.
- As the last name of an `api` that is an `args` entry, passed to a method that calls a function it receives, such as `Reflect.apply`, `Function.prototype.call` or `Array.prototype.map`. CI checks it as a call of its own name, and rejects one it cannot name. Such a method is listed after review of the functions config can pass it.

### Buckets

`buckets` is a non-empty array of objects, each holding `name` and `is` and no other key. Buckets are tested in array order, and the first whose `is` holds names the value ([Buckets](payloads.md#buckets)). CI rejects:

- A bucket that can never be chosen, since the buckets before it cover all its values.
- Two numeric ranges that both include an endpoint they share, such as `{"gte": 1, "lte": 2}` then `{"gte": 2, "lte": 3}`. `gt` or `lt` on one side puts the endpoint in one range only.

CI warns on any other overlap between buckets with different names, which fails no check. Overlap is judged only where predicates are literals, `in` over literals and comparisons against literals. A literal converts as a comparison converts it: `null` and `""` to 0, and `"7"` to 7.
