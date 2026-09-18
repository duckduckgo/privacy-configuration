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

- **Node.js version**: This project requires Node.js 20 (see `.nvmrc`). The update script handles `nvm use` automatically.
- **Package manager**: npm (lockfile: `package-lock.json`). Run `npm install` to install dependencies.
- **No services to start**: This is a build-tool repo, not a web application. There is no dev server or background service.
- **Build**: `npm run build` generates platform config files into `generated/`. Requires internet access (fetches TDS from `staticcdn.duckduckgo.com`).
- **Full test suite**: `npm test` runs build + unit tests (mocha) + lint (eslint + prettier) + TypeScript type-checking (`tsc`). See `package.json` scripts for individual commands.
- **Lint auto-fix**: `npm run lint-fix` to auto-fix ESLint and Prettier issues.
- **Schema validation**: TypeScript types in `schema/` are used to generate JSON schemas validated with `ajv`. Run `npm run tsc` to type-check.
