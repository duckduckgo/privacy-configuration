# Privacy Remote Configuration

This repository contains the privacy configuration files used by DuckDuckGo's Apps and Browser Extensions to control which privacy protections are enabled or disabled.

## Debugging

**Debugging guide:** `.cursor/rules/debugging.mdc` - Comprehensive debugging steps for remote config, including:
- Config version and hash validation (critical: clients ignore updates without version/hash bumps)
- Required fields (unprotectedTemporary, etc.)
- Config structure validation
- Using tooling to build and validate config
- PR automation for test links

## Choosing a fix

Before proposing a site fix, read the matching rule in `.cursor/rules/`:

| Fix | Rule |
|-----|------|
| Tracker allowlist | `tracker-allowlist.mdc` |
| Element hiding | `element-hiding.mdc` |
| Request blocklist | `request-blocklist.mdc` |
| User agent or client hints | `user-agent-client-hints.mdc` |

Files in `features/` and `overrides/` are JSONC (JSON with comments). Read them with `readJsoncFile` from `util.js`, not `JSON.parse`.

## Experiments and rollouts

Change rollouts and run content scope experiments with `scripts/experiment.mjs`; split web detection detectors across cohorts with `scripts/web-detection-experiment.mjs`. Read [Rollouts and Experiments](docs/rollouts-and-experiments.md) first.

## Web detection

Read the [web detection docs](docs/web-detection/README.md) before adding or changing a detector in `features/web-detection.json`. They cover how a detector runs, the config language, recipes and what CI checks.

Before changing the web detection validator in `tests/web-detection/`, read [Meaning and authoring rules](docs/web-detection/README.md#meaning-and-authoring-rules). C-S-S only checks what stops a detector running, so the validator checks anything that can be known before run time. Document each authoring rule you add or change on the page it restricts, in the same change.

## Key Concepts

- **Features**: Files in `features/` directory control privacy protection enable/disable
- **Overrides**: Platform-specific configurations in `overrides/` directory
- **Exceptions**: Site-specific exceptions to disable features when they break site functionality
- **Unprotected entries**: Disable all protections (use only for severe breakage)

## Documentation

See `README.md` for full documentation including:
- Config maintainer documentation
- Feature implementer guides
- Schema writing guides
- Incremental rollout implementation
