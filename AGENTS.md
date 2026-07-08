# Privacy Remote Configuration

This repository contains the privacy configuration files used by DuckDuckGo's Apps and Browser Extensions to control which privacy protections are enabled or disabled.

## Debugging

**Debugging guide:** `.cursor/rules/debugging.mdc` - Comprehensive debugging steps for remote config, including:
- Config version and hash validation (critical: clients ignore updates without version/hash bumps)
- Required fields (unprotectedTemporary, etc.)
- Config structure validation
- Using tooling to build and validate config
- PR automation for test links

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

## Cursor Cloud specific instructions

This is a Node.js build-tooling repo (no long-running services). Standard commands live in `README.md` and `package.json` scripts:
- Build: `npm run build` (compact JSON) / `npm run build:debug` (pretty-printed)
- Test: `npm test` (runs build + `unit-tests` + `lint` + `tsc`)
- Lint: `npm run lint` / autofix `npm run lint-fix`

Non-obvious notes:
- `npm run build` (`node index.js`) fetches remote TDS over the network at build time, so builds require outbound network access.
- Build output goes to `generated/` (v3/v4/v5 per-platform config JSON), which is git-ignored — don't commit it.
- `.nvmrc` pins Node 20, but the environment's default `node` (from `/exec-daemon`, currently v22) takes PATH precedence over nvm; the full `npm test` suite passes on Node 22, so overriding the version is not required.
