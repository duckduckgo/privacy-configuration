# Web Detection Overview

A web detector looks for a pattern on a page, such as an adwall, a CAPTCHA or a sign of breakage, and reports what it finds. Detectors are defined in the remote config of the `webDetection` C-S-S feature, so adding or changing one doesn't need a client release.

A detector says *when* it runs (`triggers`), optionally when it has detected something (`match`), and *what each run does* (`actions`). Its results go to breakage reports through the `breakageReportData` action, and to the [EventHub](https://github.com/duckduckgo/ddg-workflow/blob/main/docs/event-hub/core-design.md) through the `fireEvent` action, where telemetry config can turn them into pixels.

> This framework is distinct from the on-demand `webInterferenceDetection` utilities, which other features call directly (see the [C-S-S detectors README](https://github.com/duckduckgo/content-scope-scripts/blob/main/injected/src/detectors/README.md)).

## How a detector runs

In each frame, each trigger runs the detector like this (see [`match`](#match) for what each result means):

```mermaid
flowchart TD
    trigger["A trigger fires:<br>an auto offset, or a breakage report"] --> gate{"Detector and trigger enabled,<br>detector not done,<br>runConditions met?"}
    gate -->|no| skip["No run"]
    gate -->|yes| hasMatch{"match present?"}
    hasMatch -->|no| everyRun["Run actions"] --> next["Wait for the next trigger"]
    hasMatch -->|yes| match{"Evaluate match"}
    match -->|"false, aborted or error"| next
    match -->|holds| onceRun["Run actions"] --> done["Done: remaining timers cancelled,<br>later triggers do not run it"]
```

## Configuration

Detectors are configured under `webDetection.settings.detectors`, in named groups. Keys in `[brackets]` are optional:

```json
"webDetection": {
  "settings": {
    "detectors": {
      "<group_name>": {
        "<detector_id>": {
          ["state"]: "<enabled|disabled>",
          ["triggers"]: {
            ["breakageReport"]: {["state"]: "<enabled|disabled>", ["runConditions"]: <COND>},
            ["auto"]: {["state"]: "<enabled|disabled>", ["runConditions"]: <COND>, "when": {"intervalMs": [<int>]}}
          },
          ["match"]: <EXPR>,
          "actions": <EXPR> | [<EXPR>, ...]
        }
      }
    },
    ["readCacheMaxAgeMs"]: <int>
  }
}
```

- `detectors` contains detector *groups*
- each *group* maps detector names to their configs, and namespaces them
  - Detector and group names must fully match the regex `^[a-zA-Z][a-zA-Z0-9_]*$` ([Detector names](#detector-names))
- each detector has four parts:
  - `state` - a `disabled` detector doesn't run
  - `triggers` - *when* the detector runs ([Triggers](#triggers))
  - `match` - optional. The condition for the detector having *detected*, after which it's done ([`match`](#match))
  - `actions` - what each run does: an expression, or a sequence of them ([Actions](#actions))

### Example

```json
"detectors": {
  "adwallDetectors": {
    "genericAdblockMessage": {
      "match": {
        "text": {"pattern": "adblocker detected"}
      },
      "triggers": {
        "auto": {"state": "enabled", "when": {"intervalMs": [1000, 5000]}}
      },
      "actions": {"fireEvent": {"type": "<event type>"}, "breakageReportData": {}}
    }
  },
  "breakageInfoDetectors": {
    // using the trigger defaults, this runs when a breakage report is filed
    "videoPlayerUnavailable": {
      "match": {
        "text": {
          "pattern": "video unavailable",
          "selector": [".video-player", ".video-overlay"]
        }
      },
      "actions": {"breakageReportData": {}}
    }
  }
}
```

### Defaults

When fields are omitted from config, detectors take these defaults:

```json
{
  "state": "enabled",
  "triggers": {
    "breakageReport": { "state": "enabled", "runConditions": {"context": {"top": true}} },
    "auto": { "state": "disabled", "runConditions": {"context": {"top": true}}, "when": {"intervalMs": []} }
  }
}
```

`actions` has no default, and a detector without it doesn't parse ([Parse errors](failures.md#parse-errors)).

So by default a new detector:

- is enabled
- runs only when building data for the breakage report (the `auto` trigger is opt-in)
- runs only in the top frame
- writes a breakage report entry only through a `breakageReportData` action, and fires events only through a `fireEvent` action

### Feature settings

These sit beside `detectors` in `webDetection.settings`, and apply to every detector in the frame:

| Setting | Meaning | Absent |
|---|---|---|
| `readCacheMaxAgeMs` | How long, in ms, the XPath selections and element text one run of the detectors reads are kept for later runs while the page is unchanged. The first change to the DOM under a node that was read clears them, as does this age | Reads are shared only by the detectors that run at the same time, as is `0` |

## Triggers

| Trigger | Runs the detector | Default |
|---|---|---|
| `breakageReport` | During the breakage report flow, before the report is submitted | Enabled |
| `auto` | On page load, at each offset in `when.intervalMs` | Disabled |

Every trigger takes `state` and `runConditions`. A `disabled` trigger doesn't run the detector, whatever its other keys say.

### `auto`

`when.intervalMs` is a set of delays in milliseconds, measured from when the feature initialises in the frame, and the detector runs at each one. Timers can fire late, so each run happens at or after its offset. Once a detector is [done](#match), it doesn't run at any later offset. See [Tuning `auto` intervals](authoring/writing-detectors.md#tuning-auto-intervals) for how to choose them.

Here the detector runs on every site when a breakage report is filed, but runs automatically only on `.fr` sites, 100ms, 500ms and 1s after load:

```json
"frenchAdblockMessage": {
  "match": {"text": {"pattern": ["bloc publicitaire détecté"]}},
  "triggers": {
    "breakageReport": {"state": "enabled"},
    "auto": {
      "state": "enabled",
      "runConditions": {"context": {"top": true}, "urlPattern": "https://*.fr/*"},
      "when": {"intervalMs": [100, 500, 1000]}
    }
  },
  "actions": {"breakageReportData": {}}
}
```

### runConditions

`runConditions` narrows when a triggered detector runs, e.g., only on sites matching a given pattern. It uses the same conditions as [ConditionalChanges](https://github.com/duckduckgo/content-scope-scripts/blob/main/injected/docs/coding-guidelines.md#conditional-changes). Translations and other per-site changes go in `runConditions`, or in `conditionalChanges` where more flexibility is needed.

Each trigger's `runConditions` defaults to the top frame only:

```json
"runConditions": {
  "context": {"top": true}
}
```

A `runConditions` value replaces this default instead of merging with it, so setting it to `{}` lets a detector run in iframes too.

## `match`

Each run evaluates `match` first. `match` is an expression that gives a boolean ([Positions](expressions.md#positions)), built from the `text` and `element` conditions ([Conditions](conditions.md)) and the values and tests in [Expressions](expressions.md), combined with `any`, `all` and `none`.

| `match` | Effect on the run | The detector |
|---|---|---|
| Holds | `actions` runs once | Done when the run ends, whether `actions` ran to its end or failed |
| Doesn't hold, aborts or errors | `actions` doesn't run. A failure is recorded ([Failures](failures.md)) | Runs again on its next trigger |
| Absent | `actions` runs | Runs again on its next trigger, and is never done |

Once a detector is done, it doesn't run again in that frame, whatever the trigger: its timers are cancelled and a breakage report doesn't run it. Each frame tracks this separately, and the detector's breakage entry keeps whatever its runs wrote.

`match` only reads the page, and a detector with `match` runs its `actions` once, so it doesn't use detector names ([`match` and detector names](#match-and-detector-names)). If a payload sends a value that `match` tested, `actions` reads it again.

| Use | Config |
|---|---|
| Detect once | `"match": D`, with the detection's `fireEvent` and `breakageReportData` in `actions` |
| Detect once, after a precondition `P` holds | `"match": {"all": [P, D]}`, or `{"if": P, "then": D, "else": false}` where `D` fails before `P` holds |
| Measure on every run | No `match`. A `breakageReportData` on every run, and each event inside a [once guard](recipes.md#doing-something-once) |

In a detector with no `match`, a `fireEvent` outside a once guard sends its event on every run ([Events](#events)). See [Detector shapes](recipes.md#detector-shapes) for weak and strong signals, finishing early and other patterns.

## Actions

`actions` is an expression, or an array of them run in order ([Sequences](expressions.md#sequences)). Actions are expressions with an effect: `fireEvent` sends an event, `breakageReportData` writes the detector's breakage-report entry, and `define` binds names that later expressions read.

```json
"<detector>": {
  "triggers": {"auto": {"state": "enabled", "when": {"intervalMs": [1000, 5000]}}},
  "match": {"text": {"pattern": "ad ?block(er)? detected"}},
  "actions": {"fireEvent": {"type": "<event type>"}, "breakageReportData": {}}
}
```

### Action keys

| Key | Value | Effect |
|---|---|---|
| `fireEvent` | `{"type": <string>, "data"?: <payload spec>}` | Sends a `webEvent` of that type, with the payload ([EventHub](#eventhub)) |
| `breakageReportData` | `{}`, or `{"data": <payload spec>}` | Writes the detector's entry in breakage reports ([Breakage reports](#breakage-reports)) |
| `define` | `{<name>: <expression>}` | Binds each name to its expression's value ([Names](expressions.md#names)) |

An action computes every value its payload names, then sends or writes. If any of those values fails, the action sends and writes nothing, and the failure propagates like any other ([Failures](failures.md)). The action's own value is `undefined`.

An object can have expression keys (with their modifiers) or action keys, but not both. Action keys in one object run in the order they're listed in config, so `{"fireEvent": A, "breakageReportData": B}` is `[{"fireEvent": A}, {"breakageReportData": B}]`. Note that on Apple, an object with only `fireEvent` and `breakageReportData` stays one object, so those two run in no guaranteed order ([Apple releases before C-S-S 19.0.0](#apple-releases-before-c-s-s-1900)).

`define` binds a run name (`"x"`), which lasts for the rest of the run, or a detector name (`"this.x"`), which lasts across every run and trigger in the frame. `{"ref": "x"}` reads it. Detector names are how a detector keeps state between runs, such as a count of reads, the previous read or a flag that an action has run ([Names](expressions.md#names)).

## Results

### Breakage reports

A `breakageReportData` action writes the detector's entry in the `breakageData` parameter of breakage reports, with any values its payload names. The entry also records the detector's failures. See [`breakageData` parameter](breakageData-parameter.md#webdetection) for the format.

### EventHub

A `fireEvent` action sends a `webEvent`, `{type, data}`, from C-S-S to the native client, where EventHub handles it:

```mermaid
sequenceDiagram
    participant W as webDetection (C-S-S)
    participant H as EventHub (native client)
    participant P as Pixels
    W->>H: webEvent {type, data}
    Note over H: De-duplicate on type, payload and tab
    H->>P: immediate pixel, payload keys as parameters
    H->>P: period pixel, a counter per event type
```

EventHub de-duplicates events on type, payload and tab ([De-duplication](https://github.com/duckduckgo/ddg-workflow/blob/main/docs/event-hub/deduplication.md)), and its telemetry config turns them into pixels ([Telemetry handler](https://github.com/duckduckgo/ddg-workflow/blob/main/docs/event-hub/handlers/telemetry.md)). A detector's event type needs a consumer in that config ([Shipping a detector](authoring/shipping-a-detector.md)).

### Payloads

Both actions take an optional `data` map of the values to send. Each field's `value` is an expression computed when the action runs, or a name bound with `define`. An optional `when` tests the value before it's sent, and `buckets` send a bucket name in place of the value. CI requires `buckets` on every `fireEvent` field ([Buckets on `fireEvent`](payloads.md#buckets-on-fireevent)), and they're optional in `breakageReportData`:

```json
"fireEvent": {"type": "brokenImages", "data": {"brokenImages": {"value": {"ref": "brokenImages"}, "buckets": [{"name": "one", "is": 1}, {"name": "2-4", "is": {"gte": 2, "lt": 5}}, {"name": "5+", "is": {"gte": 5}}]}}}
```

With 3 broken images, this sends `{"type": "brokenImages", "data": {"brokenImages": "2-4"}}`. See [Payloads](payloads.md) for the full rules and how to shape events for period pixels.

## Authoring rules

### Detector names

Group and detector names fully match `^[a-zA-Z][a-zA-Z0-9_]*$`, since each name appears as written in breakage reports.

### `match` and detector names

`match` doesn't contain an action or a `ref`, and a detector with `match` doesn't use detector names, since its `actions` only runs once.

### Events

- An enabled detector whose `breakageReport` trigger is enabled has a `breakageReportData` action somewhere in its `actions`. So a detector that only fires events needs `triggers.breakageReport.state` set to `"disabled"`.
- A `fireEvent` in a detector with no `match` warns, unless an `if` around it tests a detector name that a `define` within that `if`'s branch binds ([Doing something once](recipes.md#doing-something-once)).
- Every `fireEvent` type has a consumer in the same platform's config, unless it starts `temp_`, and no type starts `detectorPerf_`, which is reserved ([The consumer cross-check](authoring/shipping-a-detector.md#the-consumer-cross-check)).

### Apple releases before C-S-S 19.0.0

Each detector enabled on an Apple release older than the first to ship C-S-S 19.0.0 has `actions` as an object with only `fireEvent` and `breakageReportData`, in the config that release matches.
