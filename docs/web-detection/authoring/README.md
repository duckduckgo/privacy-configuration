# Authoring detectors

How to write a new [web detection](../README.md) detector or change an existing one.

| Document | Purpose |
|---|---|
| [shipping-a-detector.md](shipping-a-detector.md) | The process: decide what to detect, choose where the detection goes, configure pixels, triage, gate, roll out and verify. Start here. |
| [writing-detectors.md](writing-detectors.md) | What goes in the config and why: where a detector lives, what to match on, which triggers and actions to give it, what to call its event, and how to test it. |
| [privacy-triage.md](privacy-triage.md) | Which detector changes need a privacy triage, what the proposal includes, and the pixel decisions the triage settles. |

How the framework behaves is documented separately from the process: the config model, triggers, `match` and actions in [overview](../overview.md), every condition key and operator in [conditions](../conditions.md), values, sources and predicates in [expressions](../expressions.md), [sources](../sources.md) and [predicates](../predicates.md), and parse errors in [failures](../failures.md). Each of those pages ends with the authoring rules CI checks for it.
