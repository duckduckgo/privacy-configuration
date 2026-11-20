# Privacy triage for detectors

As detectors can add data to breakage reports and can be configured to fire pixels, it is important to ensure we don't inadvertently compromise user privacy when introducing or modifying them.

Ultimately, it is the responsibility of the one authoring the changes to ensure that any privacy implications are considered and addressed before releasing a new/changed detector, and one should Use Good  Judgment. Some guidance on when and how to conduct a privacy triage is provided below.

## When a triage is required

| Change | Requirement |
|---|---|
| A novel detection pattern — no established pattern exists for this class of issue | Privacy triage |
| A change that reduces privacy — an existing detector starting to fire pixels, or becoming site-specific | Privacy triage |
| A new pattern or translation on an existing detector, privacy properties unchanged | No triage. Review instead |

Adding a phrase or a language variant to an adwall detector falls in the third row. Detecting a class of problem the framework has no pattern for falls in the first, and so does giving an existing detector a `fireEvent` action for the first time.

For the third row, the reviewer depends on who is making the change: if you are not the detector's author, ask the author to review; if you are, ask the AOR DRIs to help review.

Open a triage in the [privacy triage project](https://app.asana.com/1/137249556945/project/69071770703008/list/1204991435799460).

## What a triage proposal states

- What is being measured, and why it is not already measurable.
- Whether the detection pattern is novel, or follows one already approved.
- Whether the detector is global or restricted to a domain list.
- When it runs — the `auto` trigger intervals, or report submission only.
- Which platforms it reaches.
- Each route the detection reports through: the breakage report, periodic counters, immediate pixels.
- Each payload key the detector sends on each route, and its buckets or that it is sent unbucketed ([Payloads](../payloads.md)).

## Risks a triage addresses

A detector with an `auto` trigger runs on every page load, not only when a user submits a breakage report. That is the change in exposure most proposals turn on.

Pixel type follows from it. A periodic counter fires once per period as a bucketed count. An immediate pixel fires on every detection, an unbounded number of times per user. Counters are the default; an immediate pixel needs a reason, usually that a KPI needs per-detection counts rather than a daily bucket.

The remaining question is what a detection says. A detector that fires on our own protections breaking a page says something about the browser. A detector that fires on a message the site chose to show says something about the user — a rights or region-lock notice reveals roughly where they are, and what they tried to watch. A detection of that kind can be restricted to counters with no immediate pixel, keeping the aggregate signal without the per-event stream.

Decide the pixel type before opening the triage. It is the substance of the review, not a detail to settle afterwards.

## Pixel schema

Every new pixel gets a schema definition. It does not have to land first — a detector and its pixels can ship while the schema change is in flight — but the schema PR must be created and tracked for each platform receiving the new pixels.

Pixel configuration itself is the EventHub's, in [its telemetry handler](https://github.com/duckduckgo/ddg-workflow/blob/main/docs/event-hub/handlers/telemetry.md).
