# Detection results in breakage reports: the `breakageData` parameter

How detection results from the [web detection framework](overview.md) are conveyed in breakage reports. Detection results travel as a **URL-encoded JSON payload** under a single `breakageData` parameter. Content Scope Scripts (C-S-S) builds and encodes the payload; native clients pass it through untouched.

## Payload format

The payload is a JSON object. Each key is contributed by a different feature:

| Key | Contributed by | Contents |
|---|---|---|
| `webDetection` | `webDetection` | Array of entries, one per detector that has written or recorded a failure |
| `detectorData` | `breakageReporting` | Results of the on-demand detectors configured by `webInterferenceDetection`'s `interferenceTypes` |
| `detectorPerf` | `detectorPerf` | Exact detector timings accumulated in this frame |

A key is present only when its feature returned something. With no keys the `breakageData` parameter is omitted entirely.

### `webDetection`

Each frame keeps one entry per detector, written by its `breakageReportData` actions and by the failures that end its runs:

| Rule | Detail |
|---|---|
| A write | Creates the entry, or merges its `data` keys into it. A key takes the value of its most recent write, and a key a later write omits keeps its value |
| Who writes | Every run that reaches a `breakageReportData` action: `auto` runs and the breakage report's own run, until the detector is [done](overview.md#match) |
| When it is read | When a breakage report is filed, after the `breakageReport` trigger's run |
| Lifetime | The frame's injection |

```json
"webDetection": [
  { "detectorId": "<group>.<detector>", "detected": true, "data": { "<key>": <value> }, "errors": { "<path>": "aborted" } }
]
```

| Field | Value |
|---|---|
| `detectorId` | The detector's group and name joined by a dot, e.g. `exampleGroup.exampleDetector` |
| `detected` | `true` once `match` has held and a `breakageReportData` action has written. Omitted otherwise, so a detector without `match` never includes it |
| `data` | The merged `data`, when a write carried any. Each write sends its [payload spec](payloads.md#payload-spec) |
| `errors` | Each failure that ended a run, keyed by where it arose: `"aborted"` or `"error"`. The latest failure per key, kept for the frame's injection. Omitted when empty |

A write whose payload fails does not happen, and the entry keeps the values of earlier writes ([Failures](failures.md#propagation)).

An `errors` key is the config path to the expression where the failure arose: `match` or `actions`, then each key and array index down to it, joined by `.`. That expression is the leaf whose read failed, the expression whose value had the wrong type, or in a predicate, the key that failed. An operand or body written without an array adds no index. A detector that failed to parse has the key `"parse"`, and a run that ended in an error outside any expression has the key `"run"`.

| Failure in | Key |
|---|---|
| A leaf of `match` | `match.all.3.api` |
| A source in a single-operand `any` | `match.any.text` |
| A payload value | `actions.1.then.0.breakageReportData.data.mykey.value.only.api` |
| A payload `when` | `actions.fireEvent.data.status.when.gt.api` |
| A bucket | `actions.0.fireEvent.data.loadTime.buckets.2.is.field.api` |
| A `define` value | `actions.0.define.ratio.div.1.api` |
| An `if` condition | `actions.2.if.text` |
| A property a `where` reads | `actions.0.define.emptySheets.api.where.cssRules.length` |

```json
[
  {"detectorId": "exampleGroup.exampleDetector", "detected": true, "data": {"loadTime": "3s+"}},
  {"detectorId": "exampleGroup.otherDetector", "errors": {"match.any.1.api": "aborted"}},
  {"detectorId": "exampleGroup.thirdDetector", "detected": true, "data": {"brokenImages": "2-4"}, "errors": {"actions.1.fireEvent.data.brokenShare.value.div.1.api": "aborted"}}
]
```

A detector has an entry once it has written or recorded a failure, whether or not it has a `breakageReportData` action. A detector whose `breakageReportData` runs on every run has an entry in every report, carrying the values of its latest run. A detector that calls a method one engine lacks, without `fails`, has an entry in every report from that engine.

### Encoded example

The JSON payload:

```json
{"webDetection":[{"detectorId":"exampleGroup.exampleDetector","detected":true},{"detectorId":"exampleGroup.otherDetector","errors":{"match.text":"error"}}]}
```

is URL-encoded and appended to the breakage report as:

```
&breakageData=%7B%22webDetection%22%3A%5B%7B%22detectorId%22%3A%22exampleGroup.exampleDetector%22%2C%22detected%22%3Atrue%7D%2C%7B%22detectorId%22%3A%22exampleGroup.otherDetector%22%2C%22errors%22%3A%7B%22match.text%22%3A%22error%22%7D%7D%5D%7D
```

One URL-encoded JSON parameter holds the whole payload, so new fields need no transport change.

### Encoding failure

If the payload cannot be serialised, C-S-S sends an indicator in its place:

```json
{"error":"encoding_failed"}
```

## End-to-end flow

### C-S-S responsibilities

1. Run the detectors registered for the `breakageReport` trigger, and read each detector's entry, which earlier `auto` runs may also have written.
2. Assemble the payload from whichever of the three features returned results.
3. `JSON.stringify` then `encodeURIComponent` the payload.
4. Pass the encoded string to the client under the `breakageData` key of the `breakageReportResult` notification:

```json
{
  "<existing key/value pairs>",
  "breakageData": "%7B%22webDetection%22%3A%5B%7B%22detectorId%22%3A%22exampleGroup.exampleDetector%22%2C%22detected%22%3Atrue%7D%5D%7D"
}
```

`breakageReporting` also sets `detectorData` as its own top-level field of the breakage report result, alongside the copy inside `breakageData`.

### Native client responsibilities

The `breakageData` value arrives **already encoded** by C-S-S. Native clients must:

1. **Pass the value through as-is** — append it to the breakage report without modification.
2. **Not inspect or parse** the contents of `breakageData`.
3. **Exempt `breakageData` from any additional URL-encoding** the client applies to other parameters, to avoid double-encoding.

C-S-S therefore owns the format: changes to the detection payload (new fields, restructuring) ship via C-S-S updates with **no native client changes required**.

```
┌──────────────────────┐
│   Content Scope       │
│   Scripts (C-S-S)     │
│                       │
│  1. Run detectors     │
│  2. Build JSON        │
│  3. URL-encode        │
│  4. Set breakageData  │
└──────────┬───────────┘
           │  breakageData = "<encoded>"
           ▼
┌──────────────────────┐
│   Native Client       │
│                       │
│  Pass breakageData    │
│  as-is (no re-encode) │
└──────────┬───────────┘
           │  &breakageData=<encoded>
           ▼
┌──────────────────────┐
│   Breakage Report     │
│                       │
│  Decode & parse JSON  │
│  for analysis         │
└──────────────────────┘
```

## Relationship to detector config

A detector writes to `breakageData` through its `breakageReportData` actions, and records its failures there whatever its actions. [Overview](overview.md#actions) has the action's config shape.

## Implementation

C-S-S assembles the payload in [`breakage-reporting.js`](https://github.com/duckduckgo/content-scope-scripts/blob/main/injected/src/features/breakage-reporting.js), from the detector entries web detection keeps ([Sources of truth](README.md#sources-of-truth)).
