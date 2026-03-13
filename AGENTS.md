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

- **Node.js version**: This project requires Node.js 20 (per `.nvmrc`). Run `nvm use` to activate.
- **Package manager**: npm (lockfile: `package-lock.json`). Run `npm install` to refresh deps.
- **No running services**: This is a static config generator, not a long-running service. There are no databases, Docker, or background processes.
- **Build fetches remote data**: `npm run build` fetches the live Tracker Data Set from `https://staticcdn.duckduckgo.com/trackerblocking/v3/tds.json` — requires internet access.
- **Standard commands** (see `README.md` and `package.json` scripts):
  - Build: `npm run build` (or `npm run build:debug` for pretty-printed output)
  - Test: `npm run test` (runs build + mocha + eslint + prettier + tsc)
  - Lint: `npm run lint` / `npm run lint-fix`
  - Type-check: `npm run tsc`
  - Unit tests only: `npm run unit-tests`
- **Test suite**: 502 mocha tests covering schema validation, build output, file size limits, feature analysis, and auto-approval logic.
- **Generated output**: Build produces config files in `generated/` (v3, v4, v5 directories). These are not committed; they are generated at build time.
