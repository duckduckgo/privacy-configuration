# Authoring detectors

Process and guidance for writing a new [web detection](../README.md) detector or changing an existing one.

| Document | Purpose |
|---|---|
| [shipping-a-detector.md](shipping-a-detector.md) | The process: decide what to detect, choose where the detection goes, configure pixels, triage, gate, roll out and verify. Start here. |
| [writing-detectors.md](writing-detectors.md) | What goes in the config and why: where a detector lives, what to match on, which triggers and actions to give it, what to call its event, and how to test it. |
| [privacy-triage.md](privacy-triage.md) | Which detector changes need a privacy triage, what the proposal states, and the pixel decisions the triage settles. |

How the framework behaves is documented independently of the process for using it: the config model, triggers, `match` and actions in [overview](../overview.md), every condition key and operator in [conditions](../conditions.md), values, sources and predicates in [expressions](../expressions.md), [sources](../sources.md) and [predicates](../predicates.md), and what CI checks in [validation](../validation.md).
