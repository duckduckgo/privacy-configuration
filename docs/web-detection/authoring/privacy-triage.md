# Privacy triage for detectors

Detectors can add data to breakage reports and fire pixels, so we need to make sure a new or changed detector doesn't compromise user privacy.

Whoever authors the change is responsible for making sure its privacy implications are considered and addressed before the new or changed detector ships. Use your judgement, with the guidance below on when a privacy triage is needed and what it should include.

## When a triage is required

| Change | Requirement |
|---|---|
| A novel detection pattern (no established pattern exists for this class of issue) | Privacy triage |
| A change that reduces privacy, such as an existing detector starting to fire pixels or becoming site-specific | Privacy triage |
| A new pattern or translation on an existing detector, with privacy properties unchanged | No triage. Review instead |

Adding a phrase or a language variant to an adwall detector falls in the third row. Detecting a class of problem the framework has no pattern for falls in the first, and so does giving an existing detector a `fireEvent` action for the first time.

For the third row, who reviews depends on who's making the change. If you aren't the detector's author, ask the author to review. If you are, ask the AOR DRIs to help review.

Open a triage in the [privacy triage project](https://app.asana.com/1/137249556945/project/69071770703008/list/1204991435799460).

## What a triage proposal states

- What's being measured, and why it can't already be measured.
- Whether the detection pattern is novel, or follows one already approved.
- Whether the detector is global or restricted to a domain list.
- When it runs: the `auto` trigger intervals, or report submission only.
- Which platforms it reaches.
- Each route the detection is reported through: the breakage report, periodic counters, immediate pixels.
- Each payload key the detector sends on each route, and its buckets or that it's sent unbucketed ([Payloads](../payloads.md)).

## Risks a triage addresses

A detector with an `auto` trigger runs on every page load, instead of only when a user submits a breakage report. Most proposals hinge on this change in exposure.

The pixel type follows from it. A periodic counter fires once per period as a bucketed count. An immediate pixel fires on every detection, an unbounded number of times per user. Counters are the default, and an immediate pixel needs a reason, usually that a KPI needs per-detection counts instead of a daily bucket.

We also need to think about what a detection reveals. A detector that fires when our own protections break a page tells us something about the browser. A detector that fires on a message the site chose to show tells us something about the user. For example, a rights or region-lock notice reveals roughly where they are and what they tried to watch. A detection like that can be restricted to counters with no immediate pixel, so we keep the aggregate signal without a per-event stream.

Decide the pixel type before opening the triage, since it's the main thing the triage reviews.

## Pixel schema

Every new pixel needs a schema definition. The schema change doesn't have to merge first (a detector and its pixels can ship while it's in review), but the schema PR must be created and tracked for each platform receiving the new pixels.

Pixel configuration itself is part of the EventHub, in [its telemetry handler](https://github.com/duckduckgo/ddg-workflow/blob/main/docs/event-hub/handlers/telemetry.md).
