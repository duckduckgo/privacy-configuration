# Privacy Remote Configuration

Privacy configuration files used by DuckDuckGo's Apps and Browser Extensions to control which privacy protections are enabled or disabled.

## Key Concepts

- **Features**: Files in `features/` control privacy protection enable/disable
- **Overrides**: Platform-specific configurations in `overrides/`
- **Exceptions**: Site-specific exceptions to disable features when they break functionality
- **Unprotected entries**: Disable all protections (use only for severe breakage)

## Critical: config update requirements

When updating config, you **MUST** bump both `version` and `hash` — clients silently ignore updates without these changes. The `unprotectedTemporary` field is required by ContentScopeScripts and Autofill.

## Commands

| Command | Purpose |
|---------|---------|
| `npm test` | Validate config and run tests |
| `npm run lint` | Check formatting |

## Documentation

See `README.md` for full documentation including config maintainer docs, feature implementer guides, schema writing guides, and incremental rollout implementation.

## Reference documentation

| When you need… | Read |
|----------------|------|
| Debugging config issues | [docs/debugging.md](docs/debugging.md) |
| Adding C-S-S experiments | [docs/content-scope-experiments.md](docs/content-scope-experiments.md) |
| Adding autofill site-specific fixes | [docs/autofill-site-specific-settings.md](docs/autofill-site-specific-settings.md) |
| Creating feature schemas | [docs/feature-schema.md](docs/feature-schema.md) |
| Tracker allowlist rules | [docs/tracker-allowlist.md](docs/tracker-allowlist.md) |
| Element hiding rules | [docs/element-hiding.md](docs/element-hiding.md) |
| Request blocklist rules | [docs/request-blocklist.md](docs/request-blocklist.md) |
