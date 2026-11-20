# Failures

An expression gives a value or fails. A failure propagates up through the expressions holding it until a `fails` test handles it. One that reaches the top of `match` or of an element of `actions` ends the run, and the detector's breakage entry records it ([Reporting](#reporting)).

## Kinds

| Kind | Cause | Recorded as | `fails` handles it |
|---|---|---|---|
| Failure | Anything that goes wrong on the page at run time: a getter or method throws, a call is made on a name whose value is not a function, or a value does not fit the config ([Values that do not fit](#values-that-do-not-fit)). `document.cookie` in a sandboxed frame, `cssRules` on a cross-origin stylesheet, `document.hasStorageAccess()` on an engine without it | `"aborted"`, under the failing expression's path | Yes |
| Error | Config that CI rejects, reaching the page: an invalid CSS selector or XPath expression. CI checks XPath grammar ([Text and element conditions](validation.md#text-and-element-conditions)); test a selector on the page | `"error"`, under the failing expression's path | No |
| Parse error | Config that does not parse. The detector never runs ([On device](validation.md#on-device)) | `{"parse": "error"}` | No |
| Run error | An error outside any expression | `{"run": "error"}` | No |

These are not failures:

| Case | Value |
|---|---|
| A name present nowhere on the object or its prototype chain | `undefined` ([Property reads](predicates.md#property-reads)) |
| A comparison on `undefined`, such as a field an engine lacks | `false` |
| An item that `where` excludes, or that the `api` call does not return | Never read |
| An `if` condition that does not hold | `else`, or `undefined` with no `else` |
| A payload key whose `when` does not hold, whose value is in no bucket, or is one JSON writes nothing for | The key is omitted ([Payload spec](payloads.md#payload-spec)) |

### Values that do not fit

A value the config cannot use fails. Each depends on the page:

| Value | Guard |
|---|---|
| A value of the wrong type for its position ([Positions](expressions.md#positions)) | `type`, or `Number.isFinite` called on the value ([Calls](predicates.md#calls)), in the predicate, or in `where` before the value is read ([Failure and type](predicates.md#failure-and-type)) |
| A list unwrapped, or read by `only`, with no items | [`if`](expressions.md#if) over the list's `length` |
| A list unwrapped, or read by `only`, with several items | `at` through `using`, or a type argument excluding a page's own marks ([Performance timeline](sources.md#performance-timeline)) |
| `where` on an `api` value that is not a list | A path that reads a list |
| A root that is not a selector, a node or a list of nodes | A guard testing its `type` ([`root`](sources.md#root)) |

## Propagation

An operator fails when any operand, or any value an operand contributes, fails, and evaluation stops where the failure arises ([Evaluation](expressions.md#evaluation)). An error propagates the same way, and nothing handles it.

| Inside | A failure |
|---|---|
| A predicate | Fails the predicate. In `where`, the failure is the source's, and under `is`, the test's ([Failures](predicates.md#failures)) |
| `none` | Fails `none`, so an unread value never inverts to a condition that holds |
| A `define` value | Fails the `define`, which binds nothing. The name keeps its earlier binding, so a name never holds a failure |
| A payload `value`, `when` or bucket, or a value that throws while JSON writes it, such as from a cycle or a page getter | Fails the action, which sends and writes nothing |

Where it reaches the top:

| Reaches | Effect |
|---|---|
| `match` | `actions` does not run, and the detector runs again on its next trigger ([`match`](overview.md#match)) |
| An element of `actions` | The run ends there. The elements before it keep what they sent, wrote and bound |

So a chain does not reach its last bucket on a failed value, a detecting `if` does not fall through to its `else`, and no action sends or writes a payload missing a value.

## Reporting

Each failure or error that ends a run is recorded in the detector's breakage entry under `errors`, keyed by the config path to the expression where it arose ([`webDetection` entries](breakageData-parameter.md#webdetection) has the format). The latest per key is kept for the frame's injection.

| Failure | `errors` |
|---|---|
| The fourth leaf of a `match` `all` throws | `{"match.all.3.api": "aborted"}` |
| An invalid XPath expression in the condition of the third action's `if` | `{"actions.2.if.text": "error"}` |
| A `where` reads `cssRules` on a cross-origin stylesheet | `{"actions.0.define.emptySheets.api.where.cssRules.length": "aborted"}` |
| The detector does not parse | `{"parse": "error"}` |

In a debug build, each `auto` run whose `match` holds or fails, and each `auto` run of a detector without `match`, sends a `webDetectionAutoRun` notification. It includes the `match` result, `true`, `aborted` or `error`, the outcome of each action evaluated, the `errors` key of the failure that ended the run as `failedAt`, the thrown value's constructor name or the value that did not fit, and the detector names when the run ended.

## Handling

| To | Use |
|---|---|
| Test whether a value failed | `fails` in the predicate: `{"fails": true}` ([Failure and type](predicates.md#failure-and-type)) |
| Read a property only where reading it succeeds | `{"cssRules": {"fails": false, "length": 0}}`. `fails` and `type` are tested before the other keys of their object ([Order](predicates.md#order)) |
| Exclude the items whose read fails | `fails` in `where`, which is tested on each item ([Failures](predicates.md#failures)) |
| Give a value in place of a failed read | `if` with `fails` in its condition ([A value in place of a throwing read](recipes.md#a-value-in-place-of-a-throwing-read)) |
| Act on a failed read | `if` with `{"fails": true}` in its condition ([Counting unreadable pages](recipes.md#counting-unreadable-pages)) |
| Let another signal decide when one read fails | `{"fails": false, …}` on the read that may fail ([Either of two signals](recipes.md#either-of-two-signals-one-of-which-may-throw)) |
| Omit or name a failed payload value | `"when": {"fails": false}`, or a first bucket testing `{"fails": true}` |
| Carry on past an action that fails | `fails` on an expression holding it: `{"if": true, "then": <action>, "is": {"fails": true}}` |
| Avoid a value that does not fit | The guards in [Values that do not fit](#values-that-do-not-fit) |
| Tell a property an engine lacks from one holding `undefined` | `Reflect.has` ([Presence](predicates.md#presence)) |
| Skip a read until a precondition holds | `if`, which evaluates the branch taken only. `all` evaluates every operand, so it guards nothing ([Evaluation](expressions.md#evaluation)) |

In a payload, `fails` applies to a value the payload reads itself. A `ref` never reads a failure, since a `define` whose value fails binds nothing. A bucket testing `fails` comes first, since a comparison on a failed value fails:

```json
{"failedFontFaces": {"value": {"api": {"path": "document.fonts", "where": {"status": "error"}}, "using": "length"}, "when": {"fails": false}}}
{"failedFontFaces": {"value": {"api": {"path": "document.fonts", "where": {"status": "error"}}, "using": "length"}, "buckets": [{"name": "unreadable", "is": {"fails": true}}, {"name": "none", "is": 0}, {"name": "some", "is": {"gte": 1}}]}}
```

The first omits the key on a failed read, and the second sends `unreadable`.
