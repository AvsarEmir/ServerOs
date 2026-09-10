# ServerOS Architecture

ServerOS is organized like a small operating layer for Discord servers.

```txt
Discord Client
  ↓
Interaction Router
  ↓
ServerOS Core
  ↓
App Runtime / SDK
  ↓
Installed Apps
```

## Core

The core owns shared runtime concerns:

- Discord client startup
- Slash command routing
- Button routing
- App registry
- Install state
- Health state
- Logs
- Permissions
- UI helpers
- Command sync

Apps should not modify core files directly.

## App Registry

`AppRegistry` loads apps from configured app directories. Source development uses `src/apps/<app-id>` and production uses compiled apps under `dist/apps/<app-id>`.

It requires a canonical `serveros.app.json`, validates it against the runtime export, collects load issues and maps slash commands back to app ids.

A valid app needs:

- `metadata.id`
- `metadata.name`
- `metadata.icon`
- `metadata.version`
- `metadata.description`
- `metadata.category`
- `open()` or `screens.home`

Invalid apps are skipped and shown as load issues in the App Store instead of crashing the full runtime.

## App SDK

The SDK gives custom apps a smaller public API:

- `createApp()` for app definitions
- `ctx.ui.screen()` for View / Screen panels
- `metadata.dependencies` for dependency-aware installs
- `metadata.category` for App Store grouping
- `metadata.permissions` for requested app capabilities

## Apps

Apps live under `src/apps` and communicate with ServerOS through `ctx`.

Recommended app folders:

```txt
src/apps/my-app/
  index.ts
  app.test.ts
  README.md
  serveros.app.json
```

Small apps can keep everything in `index.ts`. Bigger apps can split into views, handlers and storage helpers.

## App Store

The App Store reads from two states:

- **Installed Apps**: enabled for the current guild
- **Downloadable Apps**: detected in `src/apps`, but not enabled for the current guild

Installing an app can also install required dependencies. After install/disable, ServerOS syncs the guild slash command list so uninstalled app commands do not stay visible.

## Isolation

Current isolation layer:

- Per-app storage namespace
- Per-app logs
- Per-app health state
- App-level error boundary
- Dynamic command visibility
- Dependency protection when disabling apps

Runtime recovery layer:

- Safe mode
- Crash thresholds
- Automatic disable after repeated crashes
- Resource metadata

Package safety layer:

- Deterministic ZIP-compatible artifacts
- Compiled app bundles
- Path traversal and duplicate-path rejection
- CRC and SHA-256 payload verification
- File-count and unpacked-size limits
- No dependency installation or package install scripts

Publisher signatures, remote staging and hard process isolation remain future layers.
