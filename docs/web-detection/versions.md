# Web detection versions

Which C-S-S release each web detection capability arrived in, the earliest app version on each platform that includes it, and what changed in each release. Use these to pick the version gate for a detector that needs a capability.

## Capabilities by C-S-S release

This table lists each web detection feature and the first C-S-S release that supports it as these docs describe it. To require a feature, use conditional changes to enable a detector only from the minimum version, or version-gate the whole web detection feature (see [Platform versions by C-S-S release](#platform-versions-by-c-s-s-release) for which version to use on each platform). These are the current capabilities. Older capabilities that are no longer supported are covered in the [Changelog](#changelog).

| Group | Capability | First C-S-S release |
|---|---|---|
| [Detector](overview.md#configuration) | Groups, `state`, `breakageReport` trigger, `runConditions` | [12.40.0](https://github.com/duckduckgo/content-scope-scripts/releases/tag/12.40.0) |
| | `auto` trigger, with `when.intervalMs` | [13.10.0](https://github.com/duckduckgo/content-scope-scripts/releases/tag/13.10.0) |
| | `auto` trigger without `when` | [13.25.0](https://github.com/duckduckgo/content-scope-scripts/releases/tag/13.25.0) |
| | No `match`, so `actions` runs on every run | [19.0.0](https://github.com/duckduckgo/content-scope-scripts/releases/tag/19.0.0) |
| [Conditions](conditions.md) | `text` (`pattern`, `selector`) | [12.40.0](https://github.com/duckduckgo/content-scope-scripts/releases/tag/12.40.0) |
| | `xpath` and `xpathConfig` on `text` | [16.5.0](https://github.com/duckduckgo/content-scope-scripts/releases/tag/16.5.0) |
| | `element` (`selector`) | [12.40.0](https://github.com/duckduckgo/content-scope-scripts/releases/tag/12.40.0) |
| | `element` `visibility`: `any`, `visible`, `hidden` | [12.40.0](https://github.com/duckduckgo/content-scope-scripts/releases/tag/12.40.0) |
| | `element` `visibility`: `content` | [15.16.0](https://github.com/duckduckgo/content-scope-scripts/releases/tag/15.16.0) |
| [Expressions](expressions.md) | `any`, `all`, `none` | [15.5.0](https://github.com/duckduckgo/content-scope-scripts/releases/tag/15.5.0) |
| | Number, string and `null` literals, `sum`, `mul`, `div`, `only` | [19.0.0](https://github.com/duckduckgo/content-scope-scripts/releases/tag/19.0.0) |
| | `if`, `then`, `else`, and sequences | [19.0.0](https://github.com/duckduckgo/content-scope-scripts/releases/tag/19.0.0) |
| | `using`, `is`, `self`, `expr` | [19.0.0](https://github.com/duckduckgo/content-scope-scripts/releases/tag/19.0.0) |
| | `define` and `ref`, with run names and detector names (`this.x`) | [19.0.0](https://github.com/duckduckgo/content-scope-scripts/releases/tag/19.0.0) |
| | A list from an `if` branch or a sequence's last element, contributing each item under `sum`, `mul`, `any`, `all` and `none` | [22.0.0](https://github.com/duckduckgo/content-scope-scripts/releases/tag/22.0.0) |
| [Sources](sources.md) | `api` (`path`, `args`, `where`, `field`) | [19.0.0](https://github.com/duckduckgo/content-scope-scripts/releases/tag/19.0.0) |
| | `where` and `field` on `element` | [19.0.0](https://github.com/duckduckgo/content-scope-scripts/releases/tag/19.0.0) |
| | `root` on `element` and `text` | [19.0.0](https://github.com/duckduckgo/content-scope-scripts/releases/tag/19.0.0) |
| | `where` on items that aren't objects, such as strings | [22.0.0](https://github.com/duckduckgo/content-scope-scripts/releases/tag/22.0.0) |
| [Predicates](predicates.md) | Comparisons, `eq`, `in`, property paths, `field`, `fails`, `type` | [19.0.0](https://github.com/duckduckgo/content-scope-scripts/releases/tag/19.0.0) |
| | `type` names `function`, `symbol` and `bigint` | [22.0.0](https://github.com/duckduckgo/content-scope-scripts/releases/tag/22.0.0) |
| | `fails` holding for a value that doesn't fit the config ([Values that do not fit](failures.md#values-that-do-not-fit)), or a selector or XPath expression the engine rejects ([Kinds](failures.md#kinds)) | Unreleased |
| [Actions](overview.md#actions) | `breakageReportData` | [12.40.0](https://github.com/duckduckgo/content-scope-scripts/releases/tag/12.40.0) |
| | `fireEvent` | [13.25.0](https://github.com/duckduckgo/content-scope-scripts/releases/tag/13.25.0) |
| | `actions` as an expression or a sequence | [19.0.0](https://github.com/duckduckgo/content-scope-scripts/releases/tag/19.0.0) |
| [Payloads](payloads.md) | `data` on `fireEvent` and `breakageReportData`, with `when` | [19.0.0](https://github.com/duckduckgo/content-scope-scripts/releases/tag/19.0.0) |
| | `buckets` as an array of `{"name", "is"}` | [20.0.0](https://github.com/duckduckgo/content-scope-scripts/releases/tag/20.0.0) |
| [Results](breakageData-parameter.md) | Breakage entries with `data` and `errors`, written by any run | [19.0.0](https://github.com/duckduckgo/content-scope-scripts/releases/tag/19.0.0) |
| Related feature | `detectorPerf` timing | [17.7.0](https://github.com/duckduckgo/content-scope-scripts/releases/tag/17.7.0) |

## Platform versions by C-S-S release

For each C-S-S release above, this is the earliest app version on each platform that ships that release or a later one. Use it to pick the `minSupportedVersion` for a version gate.

| C-S-S release | iOS | macOS | Android | Windows | Extension |
|---|---|---|---|---|---|
| [12.40.0](https://github.com/duckduckgo/content-scope-scripts/releases/tag/12.40.0) | 7.208.0 | 1.178.0 | 5.266.0 (`52660000`) | 0.147.0 | 2026.4.28 |
| [13.10.0](https://github.com/duckduckgo/content-scope-scripts/releases/tag/13.10.0) | 7.210.0 | 1.180.0 | 5.268.0 (`52680000`) | 0.149.0 | 2026.4.28 |
| [13.25.0](https://github.com/duckduckgo/content-scope-scripts/releases/tag/13.25.0) | 7.212.0 | 1.181.0 | 5.271.0 (`52710000`) | 0.151.0 | 2026.4.28 |
| [15.5.0](https://github.com/duckduckgo/content-scope-scripts/releases/tag/15.5.0) | 7.227.0 | 1.198.0 | 5.286.0 (`52860000`) | 0.166.0 | 2026.10.6 |
| [15.16.0](https://github.com/duckduckgo/content-scope-scripts/releases/tag/15.16.0) | 7.231.0 | 1.201.0 | 5.290.0 (`52900000`) | 0.168.0 | 2026.10.6 |
| [16.5.0](https://github.com/duckduckgo/content-scope-scripts/releases/tag/16.5.0) | 7.234.0 | 1.203.0 | 5.292.0 (`52920000`) | 0.171.0 | 2026.10.6 |
| [17.7.0](https://github.com/duckduckgo/content-scope-scripts/releases/tag/17.7.0) | 7.240.0 | 1.210.0 | 5.296.0 (`52960000`) | 0.175.0 | 2026.10.6 |
| [19.0.0](https://github.com/duckduckgo/content-scope-scripts/releases/tag/19.0.0) | 7.246.0 | 1.216.0 | 5.301.0 (`53010000`) | 0.180.0 | 2026.11.12 |
| [20.0.0](https://github.com/duckduckgo/content-scope-scripts/releases/tag/20.0.0) | 7.246.0 | 1.216.0 | 5.302.0 (`53020000`) | 0.180.0 | 2026.11.12 |
| [22.0.0](https://github.com/duckduckgo/content-scope-scripts/releases/tag/22.0.0) | not yet shipped | not yet shipped | 5.304.0 (`53040000`) | not yet shipped | not yet shipped |

Android is given in both forms: the release version, and the integer that remote config uses. Convert with major × 10,000,000 + minor × 10,000 + patch × 1,000, as Android's `versioning.gradle` does: 5.266.0 is `52660000`.

Reading the table:

- A cell is the first app release that ships that C-S-S version or a later one, so it may not ship that exact version. No platform pinned every C-S-S release, so the version actually shipped is usually higher (e.g., Windows 0.147.0 ships 13.1.0, and the extension's 2026.4.28 ships 13.34.0).
- **not yet shipped** means no released version of that platform includes a C-S-S release that new.
- The pinned C-S-S version doesn't always go up from one app release to the next. A hotfix cut from an older base can ship an older C-S-S than the release before it (e.g., Android 5.294.1 dropped back to 16.7.0 after 5.294.0 shipped 16.14.0). None of the rows above is affected, but a gate set from a neighbouring version can be. In that case, the table gives the _current_ minimum release that includes the C-S-S version, instead of the first release that ever shipped it.
- On iOS and macOS, a cell is the first release where both the C-S-S version in `BrowserServicesKit`'s `Package.swift` and the one in the app's `Package.resolved` are at least the row's release. The two sometimes differ at a release tag.

## Changelog

Each C-S-S release that changed what a detector can do or how it runs, newest first. Releases that only changed tests, refactored code or fixed internals aren't listed.

### Unreleased

- A value that doesn't fit the config fails as `"aborted"`, so `fails` can test it ([Values that do not fit](failures.md#values-that-do-not-fit)). This covers a value of the wrong type for its position or for `sum`, `mul`, `any`, `all` or `none`, `only` or an unwrapped list over no items or several, `where` on an `api` value that isn't a list, and a root that isn't a node.
- A CSS selector or XPath expression the engine rejects fails as `"aborted"`, whether it's in the config or a `root` read from the page, so `fails` can test it ([Kinds](failures.md#kinds)). An error is only a throw from C-S-S itself.
- C-S-S parses any `define` name, and a name starting `this.` is a detector name. CI checks the name pattern ([Bound names](expressions.md#bound-names)).
- A run that ends on a failure counts as a failed run for `detectorPerf`, as one that ends on an error does.

#### Breaking changes

Before this release, a value that doesn't fit the config, or a selector or XPath expression the engine rejects, ends the run as `"error"`, which `fails` can't handle. Gate a detector that relies on `fails` handling one on this release. A `define` name that doesn't match the name pattern doesn't parse before this release, so a CI change that allows other names needs the same gate.

### [22.0.0](https://github.com/duckduckgo/content-scope-scripts/releases/tag/22.0.0)

- Each object has one expression key. To AND several conditions, wrap them in `all`.
- `type` in predicates takes `function`, `symbol` and `bigint`, and `"type": "object"` doesn't hold for a function.
- C-S-S checks a value's type against its position when the value is read, so a value of the wrong type ends the run as `"error"`. CI rejects these where the config shows the type ([Types](expressions.md#types)).
- In boolean position, every list holds when it has an item, including `element` with `field` and `api` with `where`.
- An `if` branch or a sequence's last element that gives a list contributes each item under `sum`, `mul`, `any`, `all` and `none`, as an operand would.
- `where` tests items that aren't objects, reading properties through their prototype (e.g., a string's `length`).
- C-S-S parses a detector whose group or detector name doesn't match the name pattern, and a `define`, sequence or `root` array with no entries. CI checks these ([Meaning and authoring rules](README.md#meaning-and-authoring-rules)).
- An `auto` trigger whose `when` has no `intervalMs` array schedules no runs for its detector, and the frame's other detectors still run.

#### Breaking changes

A detector with several expression keys in one object, or an object with none (`{}`), doesn't parse. On 19.0.0 to 21.x, several keys are ANDed and `{}` holds in boolean position. A detector that names `function`, `symbol` or `bigint` in `type` doesn't parse before 22.0.0.

On 19.0.0 to 21.x:

- a type error the config shows is a parse error, including `element` with `field` or `api` with `where` in boolean position. Through a `ref`, such a list ends the run as `"error"` there
- an `if` branch or a sequence's last element that gives a list is one operand: under `sum` and `mul` it gives its one item, and under `any`, `all` and `none` it ends the run as `"error"` unless it's `element` without `field`, or `text`
- `where` on an item that isn't an object ends the run as `"error"`
- a detector whose group or detector name doesn't match the pattern is dropped
- an `auto` trigger whose `when` has no `intervalMs` array stops every detector in the frame from running automatically

### [20.0.0](https://github.com/duckduckgo/content-scope-scripts/releases/tag/20.0.0)

- `buckets` takes an array of `{"name", "is"}` objects, tested in order ([Buckets](payloads.md#buckets)).

#### Breaking changes

19.x takes `buckets` as an object of bucket names to predicates, and doesn't parse the array form, so gate any detector with `buckets` on 20.0.0. From 20.0.0, the object form doesn't parse.

### [19.0.0](https://github.com/duckduckgo/content-scope-scripts/releases/tag/19.0.0)

Web detection gained values, so a detector can measure the page as well as match it:

- expressions: number, string and `null` literals, `sum`, `mul`, `div`, `only`, `expr`, `if` and sequences, and the `using` and `is` modifiers with `self` ([Expressions](expressions.md))
- the `api` source, `where` and `field` on `element` and `api`, and `root` on `element` and `text` ([Sources](sources.md))
- predicates, for `is`, `where`, payload `when` and buckets ([Predicates](predicates.md))
- `actions` as an expression or a sequence, with `define` and `ref` for run names and detector names ([Names](expressions.md#names))
- `data` payloads on `fireEvent` and `breakageReportData`, with `when` and `buckets` (as an object, see 20.0.0)

How detectors run changed with it:

- `match` is optional. Without it, `actions` runs on every run and the detector is never done.
- Once `match` has held, the detector is done: its timers are cancelled and no later trigger runs it in that frame. Before, a match only stopped later `auto` runs, and the breakage report still ran the detector.
- A detector writes its breakage entry only through a `breakageReportData` action, from any run, `auto` runs included. Writes merge across runs, and the breakage report reads the entry after its own run. The entry has `data` and `errors`, and `detected` is only present as `true` ([`breakageData` parameter](breakageData-parameter.md#webdetection)).
- Failures are recorded as `"aborted"` or `"error"` under the config path where they arose, a detector that doesn't parse as `{"parse": "error"}`, and other run errors as `{"run": "error"}` ([Failures](failures.md)).
- An unknown key is a parse error ([Parse errors](failures.md#parse-errors)).
- An array is an expression only where its key gives it a meaning ([Arrays](expressions.md#arrays)). Use `any` for an OR.

#### Breaking changes

Before 19.0.0, unknown keys are ignored, so a `match` built only from keys added in 19.0.0 holds on every run, and `data` and `define` are dropped. Gate detectors that use any of them on 19.0.0.

From 19.0.0:

- a detector without `actions` doesn't parse. Before, `actions` was optional, and every detector that matched or errored on a breakage report wrote `{"detectorId", "detected"}` unless its `breakageReportData` had `"state": "disabled"`
- a `state` key in an action is a parse error
- an array as the whole `match`, or nested in an operand array, is a parse error, and so is an operator block inside a `text` or `element` body

### [17.7.0](https://github.com/duckduckgo/content-scope-scripts/releases/tag/17.7.0)

- The `detectorPerf` feature times detector runs when `webDetection` settings include `detectorPerf`. Breakage reports include the exact timings under `detectorPerf` ([`breakageData` parameter](breakageData-parameter.md#payload-format)), and crossings of the configured thresholds are sent as `detectorPerf_` events.

### [16.5.0](https://github.com/duckduckgo/content-scope-scripts/releases/tag/16.5.0)

- `xpath` and `xpathConfig` on `text` ([XPath](sources.md#xpath)). A `text` condition with `xpath` and no `selector` searches only the XPath results, not `body`.

### [15.16.0](https://github.com/duckduckgo/content-scope-scripts/releases/tag/15.16.0)

- `visibility: "content"` on `element`, a layout-free check that an element has content ([`element`](conditions.md#element)).

### [15.5.0](https://github.com/duckduckgo/content-scope-scripts/releases/tag/15.5.0)

- `any`, `all` and `none` blocks, which nest with arrays at any depth. An object that mixes an operator key with condition keys errors.

#### Breaking changes

Before 15.5.0, an array is an OR one level deep: as the whole `match`, or as the value of `text` or `element`. A detector relying on nesting needs 15.5.0.

### [13.25.0](https://github.com/duckduckgo/content-scope-scripts/releases/tag/13.25.0)

- The `fireEvent` action, `{"type"}`, sends a `webEvent` through the `webEvents` feature on a run whose `match` holds.
- `auto`'s `when` defaults to no intervals.

#### Breaking changes

On 13.10.0 to 13.24.0, an `auto` trigger without an explicit `when.intervalMs` throws.

### [13.10.0](https://github.com/duckduckgo/content-scope-scripts/releases/tag/13.10.0)

- The `auto` trigger runs a detector at each offset in `when.intervalMs`. Once an `auto` run matches, later `auto` runs of that detector in the frame are skipped. `auto` runs have no actions until 13.25.0, and don't write breakage entries until 19.0.0.

### [12.40.0](https://github.com/duckduckgo/content-scope-scripts/releases/tag/12.40.0)

- The first release of web detection: detector groups and `state`, the `breakageReport` trigger with `runConditions` (top frame by default), `match` with `text` (`pattern`, `selector`) and `element` (`selector`, `visibility` of `any`, `visible` or `hidden`), arrays as an OR, and the `breakageReportData` action, enabled by default.
- Breakage reports include `{"detectorId", "detected"}` for each detector that matched (`true`) or threw (`"error"`).
- A detector whose group or detector name doesn't match the name pattern is dropped.
