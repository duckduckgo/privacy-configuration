# Shipping a detector

The process from "this page is broken in a way we cannot measure" to a detector running in production. A detector is a JSON object in remote config: defining one needs no Content Scope Scripts (C-S-S) change, no app release and no native work. [Versions](../versions.md) records which capability arrived in which C-S-S release, and the app versions carrying it. Only a new *condition type* or *action* requires code, covered in [When C-S-S changes are needed](#when-c-s-s-changes-are-needed).

| For | Read |
|---|---|
| What to put in the detector config, why, and how to test it | [writing-detectors.md](writing-detectors.md) |
| Whether your change needs a privacy triage | [privacy-triage.md](privacy-triage.md) |
| Turning a detector's events into pixels | [EventHub telemetry](https://github.com/duckduckgo/ddg-workflow/blob/main/docs/event-hub/handlers/telemetry.md) |
| Match conditions in full (keys, operators, limits) | [conditions.md](../conditions.md) |
| How a detector runs: the config model, triggers and actions | [overview.md](../overview.md) |
| What `fireEvent` and `breakageReportData` send, and buckets | [payloads.md](../payloads.md) |

## 1. Decide what to detect

Name the class of problem and the evidence of it on the page. That decides whether the detector joins an existing group or starts a new one — see [Choosing a group](writing-detectors.md#choosing-a-group).

## 2. Write the detector

[writing-detectors.md](writing-detectors.md) covers where the detector goes, what to match on, and which triggers and actions to give it.

Test the match conditions against a real page in a debug build before relying on their numbers — see [Testing](writing-detectors.md#testing).

## 3. Choose where the detection goes

A detection can go to two places, independently, and the choice decides how much of the rest of this list applies.

| Action | Destination | Use for |
|---|---|---|
| `breakageReportData` | The `breakageData` parameter of a breakage report | Context on pages users report as broken |
| `fireEvent` | A `webEvent` consumed by the EventHub | Measuring how often the pattern occurs across the population |

`fireEvent` is the only route to a pixel, and a detector that fires one is collecting data from every page load rather than from reports users chose to send.

## 4. Configure the pixels

Where the detector fires an event, C-S-S emits it and stops there. Counting, de-duplication and pixel firing belong to the EventHub, configured in `event-hub.json` and specified in [EventHub telemetry](https://github.com/duckduckgo/ddg-workflow/blob/main/docs/event-hub/handlers/telemetry.md). The event name is the join key between the two configs — pick it from [Naming events](writing-detectors.md#naming-events) and reuse it exactly.

### The consumer cross-check

CI fails when a `fireEvent.type` has no consumer, which is an `eventHub` telemetry parameter `source`, the `trigger.source` of an immediate telemetry entry, or an experiment metric `event` ([`tests/web-detection/config-tests.js`](../../../tests/web-detection/config-tests.js)). Add the consumer in the same change as the detector. Event types starting `temp_` are exempt, and the `detectorPerf_` prefix is reserved.

The check resolves against each platform's *generated* config, so a consumer declared in one platform's override file satisfies it only for that platform's generated config. An event fired on several platforms needs a consumer in each one's config.

## 5. Check whether you need a privacy triage

As detectors can add data to breakage reports and can be configured to fire pixels, it is important to ensure we don't inadvertently compromise user privacy when introducing or modifying them. Refer to [privacy-triage.md](privacy-triage.md) for guidance on when a privacy triage is required. If a privacy triage is required, it must be approved before shipping the associated config changes.

## 6. Gate it

Set `triggers` and `actions` on the detector itself when it can run everywhere the feature is enabled.

Patch them in through `settings.conditionalChanges` when they need gating. Each entry is a `condition` plus JSON-Patch operations applied when the condition matches. Any condition supported by `settings.conditionalChanges` can be used here. Some common patterns are listed below:

| Purpose | Condition | Operations |
|---|---|---|
| Require a platform version | `[{"injectName": "android", "minSupportedVersion": <versionCode>}, {"injectName": "windows", "minSupportedVersion": "<version>"}]` | `add` the `auto` trigger and `fireEvent` action to each detector needing them |
| Gate on experiment membership | `{"experiment": {"experimentName": "<experimentName>", "cohort": "control"}}` and the same for `treatment` | `add` the trigger and action to each detector in the arm |
| Vary a detector between cohorts | `{"experiment": {"experimentName": "<experimentName>", "cohort": "treatment"}}` | `add` the rendered-text `xpath` to the detector's match |
| Disable on one site | `{"domain": "example.com"}` | `replace` `/detectors/yourDetectorGroup` with `{}` (or set the detector's `state` to `"disabled"`: `replace` `/detectors/yourDetectorGroup/yourDetectorName/state` with `"disabled"`) |

A detector needs a version gate when it uses a capability only some builds have. Detectors ship to every platform regardless of release, so the gate is what restricts one to builds whose C-S-S release can serve it. Check the capability's arrival in [versions](../versions.md).

The third pattern is how a change to an existing detector is A/B tested — control and treatment both get the trigger, and only treatment gets the new match. The fourth is the fix for a detector producing false positives on one site while staying correct elsewhere.

## 7. Roll out

Without a `rollouts` block on the feature, a merged detector reaches everyone on a supported version at once. Stage it with an experiment instead.

1. Set up a `contentScopeExperiment` with control and treatment arms, the detector enabled in one and not the other.
2. Start at 25% and hold for a few days to a week, depending on the risk of the change.
3. If nothing goes wrong, run the experiment at 100% for a week.
4. Send new experiments through Data Science (experiments inbox).

Rolling out one detector can change what *other* detectors report, where both respond to the same page state. Detector metrics through the EventHub measure this within the experiment, on the platforms recorded in [versions](../versions.md). See [EventHub metrics](https://github.com/duckduckgo/ddg-workflow/blob/main/docs/event-hub/handlers/metrics.md).

## 8. Verify

Detections surface in two places: the `webDetection` array inside the [`breakageData` parameter](../breakageData-parameter.md) of breakage reports, and whatever pixels the EventHub is configured to derive from the detector's events.

Check the rate against a detector already running on the same pages. A pattern that also matches healthy pages shows up as a rate far above its neighbours.

## When C-S-S changes are needed

If a new source or action is needed, then code changes will be required:

1. Extend the types in [`schema/features/web-detection.ts`](../../../schema/features/web-detection.ts).
2. For a source, add its key to [`model/core.js`](https://github.com/duckduckgo/content-scope-scripts/blob/main/injected/src/features/web-detection/model/core.js), its compile step to [`compile/compile.js`](https://github.com/duckduckgo/content-scope-scripts/blob/main/injected/src/features/web-detection/compile/compile.js), and its reader under [`sources/`](https://github.com/duckduckgo/content-scope-scripts/tree/main/injected/src/features/web-detection/sources/).
3. For an action, add its key to [`model/core.js`](https://github.com/duckduckgo/content-scope-scripts/blob/main/injected/src/features/web-detection/model/core.js), its compile step to [`compile/compile.js`](https://github.com/duckduckgo/content-scope-scripts/blob/main/injected/src/features/web-detection/compile/compile.js), and its effect to [`evaluate/evaluate.js`](https://github.com/duckduckgo/content-scope-scripts/blob/main/injected/src/features/web-detection/evaluate/evaluate.js).

Either lands in a C-S-S release, so detectors depending on it must be gated on the platform versions carrying that release (step 6). See [versions](../versions.md).
