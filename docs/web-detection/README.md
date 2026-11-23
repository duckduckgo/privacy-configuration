# Web Detection Framework

The web detection framework (the `webDetection` C-S-S feature) detects patterns in page content, such as adwalls, CAPTCHAs and signs of breakage. Detectors are defined entirely in remote config, so a new pattern doesn't need a code change. Each detector says *when* it runs (`triggers`), optionally *when it has detected* something (`match`), and *what each run does* (`actions`). With `match`, the actions run once, on the run where `match` holds. Without it, they run on every run.

A detector can send its results to breakage reports, the EventHub, or both. The `breakageReportData` action writes the detector's entry to breakage reports, with any values its payload names. The `fireEvent` action sends a `webEvent`, with an optional payload, to the [EventHub](https://github.com/duckduckgo/ddg-workflow/blob/main/docs/event-hub/README.md), where telemetry config can turn it into pixels.

> This is separate from the on-demand `webInterferenceDetection` utilities (see the [overview](overview.md)).

## End-to-end flow

```mermaid
flowchart LR
    config["webDetection config\n(detectors)"] --> run["Run detector\n(breakageReport / auto / observe trigger)"]
    run --> match["Evaluate match\n(conditions)"]
    match --> actions["Run actions\n(expressions)"]
    actions -->|"breakageReportData"| report["Breakage report\n(breakageData param)"]
    actions -->|"fireEvent"| hub["webEvents -> EventHub"]
```

## Documents

| Document | Purpose |
|---|---|
| [overview.md](overview.md) | Start here. How a detector runs, its config and defaults, triggers (`breakageReport`, `auto`, `observe`), `match` and when a detector is done, actions (`fireEvent`, `breakageReportData`, `define`, `done`), and where results go. |
| [authoring/](authoring/README.md) | Writing a new detector or changing an existing one: the steps from config change to verified rollout, the decisions along the way, and when a change needs a privacy triage. |
| [conditions.md](conditions.md) | The `text` and `element` conditions in full: operators, every key, and what each one costs on the page. |
| [expressions.md](expressions.md) | Values, positions, operators, modifiers, `is`, `if`, sequences, names and evaluation order. |
| [sources.md](sources.md) | The `element`, `text`, `api`, `observed` and `trigger` sources, `where` and `field` on items, XPath, arguments and JS builtins, the performance timeline, recorded entries and events, and `root`. |
| [predicates.md](predicates.md) | The predicate syntax shared by `is` and `where`: forms, keys and the long form, failure and type, and property reads. |
| [payloads.md](payloads.md) | What `fireEvent` and `breakageReportData` send: the payload spec, `when`, buckets, and how events become EventHub pixels. |
| [failures.md](failures.md) | Failures, errors, parse errors and run errors: what each does to a run, how it's reported, and how to handle it. |
| [validation.md](validation.md) | Parse errors on device, and the checks CI runs on every detector, including the `api` allowlist. |
| [recipes.md](recipes.md) | Configs for common measurements: counts, ratios, rendered text, load state, computed style, the performance timeline, missing fields and throwing reads, JS builtins, and detector shapes. |
| [breakageData-parameter.md](breakageData-parameter.md) | The format of detection results in breakage reports (the `breakageData` parameter): per-detector entries, their `data` and recorded `errors`. |
| [versions.md](versions.md) | Which C-S-S release each capability arrived in, and the earliest app version on each platform that includes it, for version gates. |

## Sources of truth

| For | Source |
|---|---|
| What config means and what a detector does | These docs |
| Implementation detail | C-S-S [`injected/src/features/web-detection/`](https://github.com/duckduckgo/content-scope-scripts/tree/main/injected/src/features/web-detection/) and [`web-detection.js`](https://github.com/duckduckgo/content-scope-scripts/blob/main/injected/src/features/web-detection.js) beside it |
| Config schema | [`schema/features/web-detection.ts`](../../schema/features/web-detection.ts) |
| `webEvents` schema, used by `fireEvent` | [`schema/features/web-events.ts`](../../schema/features/web-events.ts) |
| Shipped detectors | [`features/web-detection.json`](../../features/web-detection.json) |

Where C-S-S and these docs differ on what config means, the docs describe the intended behaviour.
