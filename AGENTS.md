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
