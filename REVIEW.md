# Review instructions

This repository is remote config read by four clients (Apple, Android, Windows, extensions). Most PRs are JSON edits under `features/` and `overrides/`. Files there are JSONC (JSON with comments).

An Important finding stops `auto-respond-pr.yml` from auto-approving the PR, so a human has to review it. Use Important only for the classes listed under "What Important means here". Everything else is Nit at most.

## What Important means here

Reserve Important for changes that clients will silently ignore or misapply, or that send conflicting signals to sites:

- A feature or subfeature `state` moves between `internal` and `enabled` without a `minSupportedVersion` bump. Clients detect config changes by version, so the transition is ignored.
- A subfeature's `state` changes without its own gating (`state`, `minSupportedVersion`, rollout) being set explicitly. Subfeatures are evaluated independently of their parent and do not inherit its gating.
- A rollout percentage change edits or removes an existing entry in `rollout.steps[]` instead of appending a new one. Clients persist each step, so editing a `percent` is ignored for users already enrolled. See `docs/rollouts-and-experiments.md`.
- New keys are added to `settings.metrics` (or a whole `metrics` object is added) on an experiment subfeature that already has `state: enabled` and `cohorts` on the base branch, unless this PR is the one enabling the experiment. Clients anchor metric state at enrolment, so the metric will not fire for users already enrolled.
- A user agent or client hint change makes HTTP headers and JS-visible values disagree, unless the PR description explains the intended behaviour. Follow the per-platform rules in `.cursor/rules/user-agent-client-hints.mdc`.

## Nit at most

- A new transform in `index.js` or `util.js` that fills in or rewrites data for one feature (a default for an omitted key, a shorthand expansion, a shape the author could have written directly). Ask whether the schema can require the value instead, or the client can interpret what is authored. Transforms that derive data from an external source (such as `addCnameEntriesToAllowlist`) or reconcile a base feature with a platform override (such as `mergeEventHubTelemetry`, `mergeInterferenceTypes`) are fine.
- A change to a `webDetection` detector (`match`, `triggers` or `actions.fireEvent`) whose `fireEvent.type` is the `event` of a metric in an experiment that is currently enabled with cohorts. Both cohorts are affected equally, but the metric's meaning changes mid-experiment. Ask the author to confirm the experiment owner knows the date.
- Duplicate or overly granular Windows `uaChBrands` conditions, when header and JS coverage still match.

Report at most five Nits per review.

## Site mitigations

Before judging a site breakage mitigation, read the matching guide in the repository. Each one holds the decision tree and the mistakes to look for:

- Tracker allowlist: `.cursor/rules/tracker-allowlist.mdc`. Client matching is subdomain-aware, not a plain string prefix: a subdomain rule does not match its parent domain.
- Element hiding: `.cursor/rules/element-hiding.mdc`
- Request blocklist: `.cursor/rules/request-blocklist.mdc`
- User agent and client hints: `.cursor/rules/user-agent-client-hints.mdc`

## Do not report

- Anything CI already enforces: schema validation, JSON syntax, TypeScript types, eslint and prettier formatting, tracker allowlist ordering and duplicate tests, experiment metric shape tests
- Files under `generated/` and `package-lock.json`
- Removal of a metric from an experiment. Deleting a metric is the kill switch.
- Missing documentation, a missing `.cursor/rules` file or a missing section in this file
