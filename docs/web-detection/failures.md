# Failures

Every expression either gives a value or fails. A failure propagates up through the expressions that contain it until a `fails` test handles it. If it reaches the top of `match` or of an element of `actions`, it ends the run and is recorded in the detector's breakage entry ([Reporting](#reporting)).

## Kinds

| Kind | Cause | Recorded as | `fails` handles it |
|---|---|---|---|
| Failure | Anything that goes wrong on the page at run time: a getter or method throws, a call is made on a name whose value isn't a function, or a value doesn't fit the config ([Values that do not fit](#values-that-do-not-fit)). For example, `document.cookie` in a sandboxed frame, `cssRules` on a cross-origin stylesheet, `document.hasStorageAccess()` on an engine without it | `"aborted"`, under the failing expression's path | Yes |
| Error | Invalid config that reaches the page: an invalid CSS selector or XPath expression. CI checks XPath grammar, but selectors need testing on the page | `"error"`, under the failing expression's path | No |
| Parse error | Config that doesn't parse. The detector never runs ([Parse errors](#parse-errors)) | `{"parse": "error"}` | No |
| Run error | An error outside any expression | `{"run": "error"}` | No |

These aren't failures:

| Case | Value |
|---|---|
| A name that isn't on the object or its prototype chain | `undefined` ([Property reads](predicates.md#property-reads)) |
| A comparison on `undefined`, such as a field an engine lacks | `false` |
| An item that `where` excludes, or that the `api` call doesn't return | Never read |
| An `if` condition that doesn't hold | `else`, or `undefined` with no `else` |
| A payload key whose `when` doesn't hold, whose value isn't in any bucket, or whose value JSON writes nothing for | The key is omitted ([Payload spec](payloads.md#payload-spec)) |

### Values that do not fit

A value the config can't use fails. Each of these depends on the page:

| Value | Guard |
|---|---|
| A value of the wrong type for its position ([Positions](expressions.md#positions)) | `type`, or `Number.isFinite` called on the value ([Calls](predicates.md#calls)), in the predicate, or in `where` before the value is read ([Failure and type](predicates.md#failure-and-type)) |
| A list unwrapped, or read by `only`, with no items | [`if`](expressions.md#if) over the list's `length` |
| A list unwrapped, or read by `only`, with several items | `at` through `using`, or a type argument excluding a page's own marks ([Performance timeline](sources.md#performance-timeline)) |
| `where` on an `api` value that isn't a list | A path that reads a list |
| A root that isn't a selector, a node or a list of nodes | A guard testing its `type` ([`root`](sources.md#root)) |

## Parse errors

C-S-S parses each detector when it loads its config. A detector parses when every key and value has the shape these docs give it, so C-S-S can give it one meaning. Otherwise it doesn't parse, and it never runs:

| Config | Examples |
|---|---|
| An unknown key or name | A key beside an operator key, an unknown `visibility`, an unknown type name in `type` |
| A value of the wrong JSON type | A `define` that isn't an object, `buckets` that isn't an array, an array in an expression or predicate position ([Arrays](expressions.md#arrays)) |
| A missing key | A detector without `actions`, an `if` without `then`, a payload field without `value`, an object with no expression key (`{}` included) |
| Keys that conflict | Several expression keys in one object, an action key beside an expression key or a modifier, `field` without `is` |
| A key where it can't apply | `self` outside every `using`, `where` and `field`, `then` or `else` without `if` |

An unknown key is a parse error so that a client from before a key was added doesn't run the detector with a different meaning ([Versions](versions.md)).

A payload key is also checked when the detector parses: it matches `^[a-zA-Z][a-zA-Z0-9_]*$` and isn't `nativeData` ([Payload spec](payloads.md#payload-spec)).

Config that parses runs. What a detector may read, how it guards its values and how it buckets its payloads are authoring rules that CI checks before config ships ([Meaning and authoring rules](README.md#meaning-and-authoring-rules)).

## Propagation

An operator fails when any operand, or any value an operand contributes, fails, and evaluation stops where the failure happens ([Evaluation](expressions.md#evaluation)). Errors propagate the same way, but nothing can handle them.

| Inside | A failure |
|---|---|
| A predicate | Fails the predicate. In `where`, the source fails, and under `is`, the test fails ([Failures](predicates.md#failures)) |
| `none` | Fails `none`, so a value that couldn't be read is never inverted into a condition that holds |
| A `define` value | Fails the `define`, which doesn't bind anything. The name keeps its earlier binding, so a name is never bound to a failure |
| A payload `value`, `when` or bucket, or a value that throws while it's serialised to JSON, such as from a cycle or a page getter | Fails the action, which sends and writes nothing |

When a failure reaches the top:

| Reaches | Effect |
|---|---|
| `match` | `actions` does not run, and the detector runs again on its next trigger ([`match`](overview.md#match)) |
| An element of `actions` | The run ends there. The elements before it keep what they sent, wrote and bound |

As a result, a chain doesn't fall through to its last bucket on a failed value, a detecting `if` doesn't fall through to its `else`, and no action sends or writes a payload with a missing value.

## Reporting

Each failure or error that ends a run is recorded in the detector's breakage entry under `errors`, keyed by the config path to the expression where it happened (see [`webDetection` entries](breakageData-parameter.md#webdetection) for the format). The latest failure for each key is kept for the lifetime of the frame's injection.

| Failure | `errors` |
|---|---|
| The fourth leaf of a `match` `all` throws | `{"match.all.3.api": "aborted"}` |
| An invalid XPath expression in the condition of the third action's `if` | `{"actions.2.if.text": "error"}` |
| A `where` reads `cssRules` on a cross-origin stylesheet | `{"actions.0.define.emptySheets.api.where.cssRules.length": "aborted"}` |
| The detector does not parse | `{"parse": "error"}` |

In a debug build, each `auto` run whose `match` holds or fails, and each `auto` run of a detector without `match`, sends a `webDetectionAutoRun` notification. It includes the `match` result (`true`, `aborted` or `error`), the outcome of each action evaluated, the `errors` key of the failure that ended the run as `failedAt`, the thrown value's constructor name or the value that didn't fit, and the detector names when the run ended.

## Handling

| To | Use |
|---|---|
| Test whether a value failed | `fails` in the predicate: `{"fails": true}` ([Failure and type](predicates.md#failure-and-type)) |
| Read a property only where reading it succeeds | `{"cssRules": {"fails": false, "length": 0}}`. `fails` and `type` are tested before the other keys of their object ([Order](predicates.md#order)) |
| Exclude the items whose read fails | `fails` in `where`, which is tested on each item ([Failures](predicates.md#failures)) |
| Give a value in place of a failed read | `if` with `fails` in its condition ([A value in place of a throwing read](recipes.md#a-value-in-place-of-a-throwing-read)) |
| Act on a failed read | `if` with `{"fails": true}` in its condition ([Counting unreadable pages](recipes.md#counting-unreadable-pages)) |
| Fall back to another signal when one read fails | `{"fails": false, …}` on the read that may fail ([Either of two signals](recipes.md#either-of-two-signals-one-of-which-may-throw)) |
| Omit or name a failed payload value | `"when": {"fails": false}`, or a first bucket testing `{"fails": true}` |
| Carry on past an action that fails | `fails` on an expression wrapping it: `{"if": true, "then": <action>, "is": {"fails": true}}` |
| Avoid a value that does not fit | The guards in [Values that do not fit](#values-that-do-not-fit) |
| Tell apart a property an engine doesn't have and one set to `undefined` | `Reflect.has` ([Presence](predicates.md#presence)) |
| Skip a read until a precondition holds | `if`, which only evaluates the branch taken. `all` evaluates every operand, so it can't act as a guard ([Evaluation](expressions.md#evaluation)) |

In a payload, `fails` only applies to a value the payload reads itself. A `ref` never reads a failure, since a `define` whose value fails doesn't bind anything. Put a bucket testing `fails` first, since a comparison on a failed value fails:

```json
{"failedFontFaces": {"value": {"api": {"path": "document.fonts", "where": {"status": "error"}}, "using": "length"}, "when": {"fails": false}}}
{"failedFontFaces": {"value": {"api": {"path": "document.fonts", "where": {"status": "error"}}, "using": "length"}, "buckets": [{"name": "unreadable", "is": {"fails": true}}, {"name": "none", "is": 0}, {"name": "some", "is": {"gte": 1}}]}}
```

The first leaves the key out on a failed read, and the second sends `unreadable`.
