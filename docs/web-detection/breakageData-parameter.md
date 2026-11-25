# Detection results in breakage reports: the `breakageData` parameter

Detection results from the [web detection framework](overview.md) are sent in breakage reports as a URL-encoded JSON payload, under a single `breakageData` parameter. Content Scope Scripts (C-S-S) builds and encodes the payload, and native clients pass it through unchanged.

## Payload format

The payload is a JSON object, and each key comes from a different feature:

| Key | Added by | Contents |
|---|---|---|
| `webDetection` | `webDetection` | Array of entries, one per detector that has written or recorded a failure |
| `detectorData` | `breakageReporting` | Results of the on-demand detectors configured by `webInterferenceDetection`'s `interferenceTypes` |
| `detectorPerf` | `detectorPerf` | Exact detector timings accumulated in this frame |

A key is only present when its feature returned something, and with no keys, the `breakageData` parameter is left out entirely.

### `webDetection`

Each frame keeps one entry per detector, written by its `breakageReportData` actions and by the failures that end its runs:

| Rule | Detail |
|---|---|
| A write | Creates the entry, or merges its `data` keys into it. Each key has the value from its most recent write, and a key that a later write leaves out keeps its earlier value |
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
| `detectorId` | The detector's group and name joined by a dot, e.g., `exampleGroup.exampleDetector` |
| `detected` | `true` once `match` has held and a `breakageReportData` action has written. Omitted otherwise, so a detector without `match` never includes it |
| `data` | The merged `data`, when a write included any. Each write sends its [payload spec](payloads.md#payload-spec) |
| `errors` | Each failure that ended a run, keyed by where it arose: `"aborted"` or `"error"`. The latest failure per key, kept for the frame's injection. Omitted when empty |

If a write's payload fails, the write doesn't happen and the entry keeps the values from earlier writes ([Failures](failures.md#propagation)).

An `errors` key is the config path to the expression where the failure arose: `match` or `actions`, then each key and array index down to it, joined by `.`. That expression is the leaf whose read failed, the expression whose value had the wrong type, or, in a predicate, the key that failed. An operand or body written without an array doesn't add an index. A detector that failed to parse has the key `"parse"`, and a run that ended in an error outside any expression has the key `"run"`.

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

A detector has an entry once it has written or recorded a failure, whether or not it has a `breakageReportData` action. A detector whose `breakageReportData` runs on every run has an entry in every report, with the values from its latest run. A detector that calls a method one engine doesn't have, without guarding it with `fails`, has an entry in every report from that engine.

### `detectorPerf`

The timings of the detector runs in the frame, when the `detectorPerf` feature is enabled:

```json
"detectorPerf": {
  "combinedTotalMs": 41.2,
  "worstDispatch": {"totalMs": 6.3, "detectors": {"exampleGroup.exampleDetector": 4.9, "exampleGroup.otherDetector": 1.4}},
  "detectors": {"exampleGroup.exampleDetector": {"runs": 12, "totalMs": 9.8, "worstMs": 3.1, "worstSliceMs": 1.4, "waitMisses": 40, "waitMissMs": 2.2}}
}
```

| Field | Value |
|---|---|
| `combinedTotalMs` | The total time of every detector run in the frame |
| `worstDispatch.totalMs` | The longest dispatch in the frame: the detector work in one call into web detection, such as an `auto` timer or the breakage report's run |
| `worstDispatch.detectors` | Each detector's share of that dispatch, by detector ID |
| `detectors.<id>.runs` | The runs the detector started in the frame, abandoned runs included |
| `detectors.<id>.totalMs` | The detector's total time in the frame, wait misses included |
| `detectors.<id>.worstMs` | The detector's largest run total: the time of the slices that move a run forward |
| `detectors.<id>.worstSliceMs` | The detector's longest slice, wait misses included |
| `detectors.<id>.waitMisses` | The `where` tests of a [`wait`](sources.md#wait) on an arrival that no item passed, which leave the run suspended |
| `detectors.<id>.waitMissMs` | The total time of those wait misses, which is also in `totalMs` |

A slice is the part of a run that runs in one go: from its start to its first `wait`, from a `wait` resuming to the next `wait` or the end, or a `where` test that doesn't resume it. A run that reaches no `wait` is one slice.

Times are in ms, rounded to 0.1 ms. `worstDispatch` is left out when no run in the frame had a dispatch. `combinedTotalMs` and `totalMs` grow with how long the page has been open, so compare them across reports with the page's age at the report.

### Encoded example

The JSON payload:

```json
{"webDetection":[{"detectorId":"exampleGroup.exampleDetector","detected":true},{"detectorId":"exampleGroup.otherDetector","errors":{"match.text":"error"}}]}
```

is URL-encoded and appended to the breakage report as:

```
&breakageData=%7B%22webDetection%22%3A%5B%7B%22detectorId%22%3A%22exampleGroup.exampleDetector%22%2C%22detected%22%3Atrue%7D%2C%7B%22detectorId%22%3A%22exampleGroup.otherDetector%22%2C%22errors%22%3A%7B%22match.text%22%3A%22error%22%7D%7D%5D%7D
```

The whole payload goes in one URL-encoded JSON parameter, so new fields don't need a transport change.

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

The `breakageData` value arrives already encoded by C-S-S, so native clients must:

1. Pass the value through as-is, appending it to the breakage report without changing it.
2. Not inspect or parse the contents of `breakageData`.
3. Leave `breakageData` out of any extra URL-encoding the client applies to other parameters, so it isn't double-encoded.

This means the format is defined entirely by C-S-S, and changes to the detection payload (new fields or restructuring) ship in C-S-S updates without any native client changes.

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

A detector writes to `breakageData` through its `breakageReportData` actions, and its failures are recorded there whatever its actions are. See [Overview](overview.md#actions) for the action's config.

## Implementation

C-S-S assembles the payload in [`breakage-reporting.js`](https://github.com/duckduckgo/content-scope-scripts/blob/main/injected/src/features/breakage-reporting.js), from the detector entries web detection keeps ([Sources of truth](README.md#sources-of-truth)).
