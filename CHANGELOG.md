# Changelog

## v0.2.0 — App Factory and Packaging in progress

### Added

- Canonical `serveros.app.json` manifest and published JSON schema
- `npm run app:validate` for manifest, runtime metadata, command and dependency validation
- `npm run app:test` for isolated app tests
- `npm run app:doctor` for project-wide diagnostics without exposing environment values
- `npm run app:package` for deterministic `.serveros-app` ZIP artifacts and SHA-256 sidecars
- Safe ZIP reader and package verifier with path, CRC, checksum, file-count and size validation
- Optional Ed25519 package signing and trusted-public-key verification
- Reusable GitHub Actions app release workflow
- A generated `app.test.ts` file in every app template
- Runtime-contract tests for every existing app
- Compiled runtime validation through `npm run test:dist`

### Improved

- The App Registry requires the canonical manifest and validates it against exported runtime metadata
- App creation and duplication validate generated code before reporting success
- Production builds remove stale output and copy manifests and non-TypeScript app assets into `dist`
- The complete quality command runs core tests, app tests, manifest validation, compiled-runtime validation and project diagnostics

### Security

- App packages never run install scripts or install dependencies during packaging
- Package paths cannot escape the archive root
- Package payloads are limited to 500 files and 25 MiB unpacked by default
- Unsigned development packages are identified honestly and signed packages require an explicit trusted public key
- `deepmerge-ts` is pinned to the patched 8.0.1 release until Prisma updates its exact transitive dependency

## v0.1.5 — Runtime Hardening

### Added

- Automated tests for the app registry, storage, health, installations, command sync, templates and maintenance tools
- GitHub Actions continuous integration for clean installation, build and tests
- Safe Mode through `SERVEROS_SAFE_MODE` and `SERVEROS_SAFE_APPS`
- Configurable automatic app disable threshold through `APP_CRASH_THRESHOLD`
- Startup command reconciliation for connected guilds
- `npm run app:orphans` for non-destructive orphaned-data inspection
- Explicit orphaned-data deletion through `--delete --yes`

### Improved

- App registration is atomic when ids or slash commands conflict
- App Registry can combine multiple application directories
- Missing and circular dependencies are rejected before activation
- Successful app execution resets the consecutive crash counter
- Repeated crashes disable the affected app and its installed dependents
- Guild command synchronization continues when one guild fails
- Interaction, process shutdown and fatal error handling are more resilient

### Verification

- `npm run check` builds the project and runs the complete automated test suite
- Every generated app template is compiled during tests
- Orphaned-data deletion is rejected when data still belongs to a registered app

## v0.1.4 — App Factory Workflow Update

### Added

- `npm run app:duplicate` for copying an existing app into a new app folder
- `npm run app:delete` for removing custom app source folders
- `scripts/app-utils.ts` shared helper utilities for app tooling
- `docs/APP_DEVELOPMENT.md` with create/duplicate/delete workflow
- Built-in app delete protection unless `--force` is passed

### Improved

- `app:create`, `app:duplicate` and `app:delete` now share app id normalization rules
- Duplicate workflow updates common identifiers, command name suggestions and `serveros.app.json`
- App SDK docs now explain app folder ownership and sandbox limits
- Generated CRUD and moderation templates now pass storage fallbacks correctly

### Notes

App code runs in the same Node.js process as ServerOS. The runtime boundary is meant for organization, storage isolation and crash handling; it is not a secure container for untrusted code.

After duplicating or deleting apps, run:

```bash
npm run deploy:commands
npm run dev
```

## v0.1.3 — Developer SDK & App Store Rebuild

### Added

- `createApp()` SDK helper
- `ctx.ui.screen()` View / Screen helper
- Interactive `npm run app:create` flow
- App templates:
  - `simple`
  - `crud`
  - `dashboard`
  - `moderation`
- Moderation-style template with report/case workflow starter
- App category metadata expansion
- App dependency metadata
- Dependency-aware install flow
- Dependency protection when disabling apps
- App detail screen in App Store
- App Store category screen
- App load issue reporting in App Store
- `serveros.app.json` generated for new apps

### Improved

- App Store rebuilt around **Installed Apps** and **Downloadable Apps**
- App Store now shows dependencies, permissions, settings schema and install status
- App generator now supports direct and interactive usage
- App Registry now validates required metadata and collects load errors without killing the whole runtime
- App creation is easier for custom apps, dashboard apps, CRUD apps and moderation-style apps

### Notes

Example generator usage:

```bash
npm run app:create
npm run app:create wiki -- --template crud --author Emir
npm run app:create mod-tools -- --template moderation
```

After applying this patch, run:

```bash
npm run deploy:commands
```

## v0.1.2 — OS Control & Vault Patch

### Added

- Central `/os` control command with action options
- `/os action:open app:<id>` for opening installed apps
- `/os action:install app:<id>` for installing downloadable apps
- `/os action:uninstall app:<id>` for disabling installed apps
- `/os action:monitor`, `/os action:logs` and `/os action:terminal`
- App autocomplete for `/os` and `/logs`
- `CommandSyncer` for per-guild slash command syncing
- New Vault app for user-friendly file-system style storage
- Desktop quick-open buttons for installed apps
- App Store refresh button

### Improved

- App Store now separates **Installed Apps** and **Downloadable Apps**
- App install/disable now syncs slash commands for that guild
- Uninstalled app commands are removed from the guild command list after sync
- Desktop explains that `/os` is the central control command
- Default command deployment now registers only core commands and system app commands

### Notes

After applying this patch, run:

```bash
npm run deploy:commands
```

Then install apps from `/os action:apps` or `/os action:install app:<id>`. App commands such as `/note`, `/task` and `/vault` become visible only after their app is installed and command sync completes.

## v0.1.1 — Runtime Health Update

### Added

- App health tracker with `running`, `disabled`, `crashed` and `unknown` states
- `/monitor` command for runtime health overview
- `/logs` command for root-only system log viewing
- App Store log buttons per app
- App metadata permission labels
- `PermissionManager` for root/user action checks
- `AppHealth` service for crash tracking
- Architecture and permissions docs

### Improved

- Desktop now shows crashed app count and current permission mode
- App Store now shows app status, version, category and requested permissions
- App runtime marks apps as crashed without stopping ServerOS core
- Custom app scaffold now includes default permissions

### Notes

Run `npm run db:push` after updating because v0.1.1 adds the `AppHealth` table.
