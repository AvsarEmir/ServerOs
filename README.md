<div align="center">
  <img src="assets/serveros-logo.png" alt="ServerOS Logo" width="180">
  <h1>ServerOS</h1>
  <p>Turn a Discord server into a modular operating layer.</p>
  <p>
    <strong>Creator:</strong> <a href="https://www.phantomstorme.com">www.phantomstorme.com</a>
    &nbsp;&bull;&nbsp;
    <strong>Contact:</strong> <a href="https://discord.gg/bn5jRSApN7">Discord</a>
  </p>
</div>

ServerOS is an experimental Discord application runtime for building, installing, enabling and operating server-specific apps from one consistent interface. It combines a small core, an App Store, per-server app state, isolated storage namespaces, health monitoring, developer tooling and a package format designed for future GitHub-based distribution.

ServerOS is not intended to become one large multipurpose bot. The core provides the operating layer; features such as notes, tasks, dashboards, moderation workflows and automations are separate apps.

## Project status

ServerOS is under active development and is not yet a stable production platform.

The current source includes the hardened v0.1.5 runtime and the in-progress v0.2.0 app factory and packaging work. Local app creation, validation, testing, deterministic packaging, checksums and optional Ed25519 signatures are available. Remote installation from GitHub Releases is planned for v0.3.0 and is not active yet.

## Table of contents

- [What ServerOS does](#what-serveros-does)
- [How it works](#how-it-works)
- [Current features](#current-features)
- [Included apps](#included-apps)
- [Requirements](#requirements)
- [Discord application setup](#discord-application-setup)
- [Local installation](#local-installation)
- [Running ServerOS](#running-serveros)
- [Environment variables](#environment-variables)
- [Using ServerOS in Discord](#using-serveros-in-discord)
- [Creating apps](#creating-apps)
- [App manifests](#app-manifests)
- [Testing and diagnostics](#testing-and-diagnostics)
- [Packaging and signing apps](#packaging-and-signing-apps)
- [Safe Mode and recovery](#safe-mode-and-recovery)
- [What to upload to GitHub](#what-to-upload-to-github)
- [Security model](#security-model)
- [Project structure](#project-structure)
- [Troubleshooting](#troubleshooting)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [Attribution](#attribution)
- [License](#license)

## What ServerOS does

ServerOS treats a Discord server as a modular workspace:

- The core starts the Discord client and routes interactions.
- The App Registry discovers and validates local apps.
- The App Store lets administrators enable or disable apps per server.
- App commands are synchronized according to the server's installed apps.
- Each app receives a scoped runtime context for storage, logs, health and UI helpers.
- Broken apps are isolated from healthy apps and reported instead of stopping the entire bot.
- Repeated app crashes can automatically disable the app and its installed dependants.
- Developers can generate, duplicate, validate, test and package apps without editing the core.

## How it works

```txt
Discord
  ↓
Slash commands, autocomplete and buttons
  ↓
Interaction Router
  ↓
ServerOS Core
  ├─ App Registry
  ├─ App Installations
  ├─ Command Sync
  ├─ Permissions
  ├─ App Health
  ├─ Logs
  └─ App Storage
       ↓
Installed ServerOS Apps
```

At startup, ServerOS performs the following sequence:

1. Reads configuration from `.env`.
2. Loads every app manifest from the configured app directory.
3. Validates the manifest, entry file, exported runtime metadata, commands, permissions and dependencies.
4. Rejects missing dependencies, circular dependencies and command conflicts.
5. Starts the Discord client with the `Guilds` gateway intent.
6. Reconciles commands for connected servers.
7. Routes each interaction through a core or app-level error boundary.

App availability has two separate meanings:

- Available: the app exists on the ServerOS host and passes registry validation.
- Installed: the app is enabled for a particular Discord server.

One host can therefore make an app available while individual Discord servers decide whether to enable it.

## Current features

### Runtime

- Dynamic app discovery
- Canonical `serveros.app.json` manifests
- Atomic app registration
- Slash-command ownership and conflict detection
- Required and optional app dependencies
- Missing and circular dependency detection
- Per-server app enablement
- Dynamic guild command synchronization
- System apps that cannot be disabled
- Graceful shutdown and fatal-error handling

### Reliability

- App-level error boundaries
- Healthy, degraded, broken, disabled, running, crashed and unknown states
- Consecutive crash counters
- Configurable crash thresholds
- Automatic safety disable after repeated failures
- Dependant-app safety disable
- Installation rollback when an app install hook fails
- Repair and retry flow
- Safe Mode startup

### Data and permissions

- Prisma ORM with SQLite for local development
- Per-server and per-app storage namespaces
- Installation history
- Structured app and system logs
- Administrator and member permission layers
- App capability declarations
- Orphaned app-data preview and explicit cleanup

### Developer experience

- TypeScript and ESM
- `createApp()` SDK helper
- Shared screen, embed, button and ID utilities
- Simple, CRUD, dashboard and moderation templates
- Interactive and non-interactive app generation
- App duplication and protected deletion
- Manifest and runtime validation
- Isolated app tests
- Project diagnostics
- Deterministic `.serveros-app` packages
- Internal and external SHA-256 verification
- Optional Ed25519 publisher signatures
- GitHub Actions CI and app release workflows

## Included apps

| App | ID | Purpose |
|---|---|---|
| Notes | `notes` | Create, search and pin server notes |
| Tasks | `tasks` | Track server tasks and completion state |
| Vault | `vault` | Store links, decisions, documents and reusable information |
| Terminal | `terminal` | System-style commands and recovery access |
| My App | `my-app` | Example custom app created from the simple template |

Terminal is a system app. The other apps can be enabled or disabled independently for each Discord server.

## Requirements

Install these on the machine that will run ServerOS:

- Node.js 20 or newer
- npm, included with Node.js
- Git, recommended for cloning and version control
- A Discord account
- A Discord application and bot token
- A Discord server where you can install applications

Optional tools:

- OpenSSL for generating Ed25519 publisher keys
- A process manager such as systemd, Docker or PM2 for a later production deployment

You do not need to install TypeScript, Prisma, discord.js, esbuild or tsx globally. They are project dependencies and are installed by npm.

Do not install dependencies inside downloaded `.serveros-app` packages. ServerOS packages are designed to run without package install scripts or an installation-time `npm install`.

## Discord application setup

1. Open the [Discord Developer Portal](https://discord.com/developers/applications).
2. Create a new application.
3. Open the **Bot** page and create the bot user if Discord has not created one.
4. Copy or reset the bot token and store it only in your local `.env` file.
5. Copy the Application ID from **General Information**. This becomes `DISCORD_CLIENT_ID`.
6. Open **Installation** and enable Guild Install.
7. Add the `applications.commands` and `bot` scopes.
8. Give the bot the minimum permissions needed for your deployment. A typical ServerOS setup needs View Channels, Send Messages and Embed Links.
9. Use the generated installation link to add the app to a test server.

ServerOS currently uses only the `Guilds` gateway intent, so privileged Message Content, Guild Members and Presence intents are not required.

For local development, enable Developer Mode in Discord, right-click your test server, copy its server ID and use it as `DISCORD_GUILD_ID`. Guild-scoped commands update quickly and are the recommended development mode. Discord documents guild and global application commands in its [Application Commands guide](https://docs.discord.com/developers/interactions/application-commands).

## Local installation

### 1. Clone the repository

```bash
git clone <your-repository-url>
cd serveros
```

If you downloaded a ZIP from GitHub, extract it and open a terminal inside the project directory instead.

### 2. Install project dependencies

For a clean checkout with the committed lockfile:

```bash
npm ci
```

Use `npm install` when intentionally changing dependencies during development.

### 3. Create the environment file

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

macOS or Linux:

```bash
cp .env.example .env
```

Open `.env` and replace the placeholder Discord values. Never commit this file.

### 4. Generate the Prisma client

```bash
npm run db:generate
```

### 5. Create or update the local database

```bash
npm run db:push
```

The default development database is `prisma/dev.db`. It is ignored by Git and must not be uploaded to a public repository.

### 6. Register Discord commands

```bash
npm run deploy:commands
```

When `DISCORD_GUILD_ID` is set, commands are registered only in that test server. Without it, the default core and system commands are registered globally.

### 7. Start development mode

```bash
npm run dev
```

The development process watches TypeScript files and restarts when source code changes.

## Running ServerOS

### Development

```bash
npm run dev
```

### Production-style local run

```bash
npm ci
npm run db:generate
npm run db:push
npm run build
npm run deploy:commands
npm start
```

`npm run build` performs a clean TypeScript build, removes stale `dist` output and copies app manifests and runtime assets. `npm start` runs `dist/main.js`.

Command deployment is normally required after adding, deleting or renaming core/system commands. ServerOS also synchronizes installed app commands per guild while it is running.

Stop the process with `Ctrl+C`. ServerOS handles `SIGINT` and `SIGTERM`, disconnects Prisma and destroys the Discord client before exiting.

SQLite and `prisma db push` are suitable for the current local and experimental stage. A formal production migration and deployment contract has not been finalized yet.

## Environment variables

| Variable | Required | Default | Description |
|---|---:|---|---|
| `DISCORD_TOKEN` | Yes | None | Secret bot token from the Discord Developer Portal |
| `DISCORD_CLIENT_ID` | Yes | None | Discord Application ID used for command registration |
| `DISCORD_GUILD_ID` | No | Global commands | Test server ID for fast guild-scoped command updates |
| `DATABASE_URL` | Yes for Prisma | `file:./dev.db` in the example | Prisma database connection string, resolved relative to `prisma/schema.prisma` |
| `APP_CRASH_THRESHOLD` | No | `3` | Consecutive app failures before safety disable |
| `SERVEROS_SAFE_MODE` | No | `false` | Loads only explicitly allowed recovery apps when enabled |
| `SERVEROS_SAFE_APPS` | No | `terminal` | Comma-separated app IDs allowed in Safe Mode |

Example:

```env
DISCORD_TOKEN="YOUR_BOT_TOKEN"
DISCORD_CLIENT_ID="YOUR_APPLICATION_ID"
DISCORD_GUILD_ID="YOUR_TEST_GUILD_ID"
DATABASE_URL="file:./dev.db"
APP_CRASH_THRESHOLD="3"
SERVEROS_SAFE_MODE="false"
SERVEROS_SAFE_APPS="terminal"
```

`DISCORD_TOKEN` is a secret. If it is ever committed or shared, reset it immediately in the Discord Developer Portal and replace the local value.

## Using ServerOS in Discord

The main entry point is `/os`.

```txt
/os
/os action:apps
/os action:open app:notes
/os action:install app:vault
/os action:uninstall app:tasks
/os action:repair app:tasks
/os action:monitor
/os action:logs app:notes
/os action:settings threshold:5
/os action:terminal input:help
```

Core commands:

| Command | Purpose |
|---|---|
| `/os` | Open the Desktop or perform a ServerOS action |
| `/apps` | Open the App Store |
| `/monitor` | View runtime and app health |
| `/logs` | View recent logs; optionally filter by app |
| `/terminal` | Open the system Terminal app |

Members can open and use installed apps. Installing, disabling, repairing, managing settings and viewing protected logs require Discord Administrator or Manage Server permission.

When an app is installed, ServerOS enables its required dependencies first and synchronizes the guild command list. Disabling an app removes its commands. An app cannot be disabled while another installed app requires it.

## Creating apps

Interactive generator:

```bash
npm run app:create
```

Non-interactive examples:

```bash
npm run app:create -- wiki --template crud --author "Your Name"
npm run app:create -- analytics-panel --template dashboard --author "Your Name"
npm run app:create -- mod-tools --template moderation --author "Your Name"
```

Available templates:

| Template | Purpose |
|---|---|
| `simple` | One screen and one slash command |
| `crud` | Create, list and delete records with app storage |
| `dashboard` | Read-only metrics and widget layout |
| `moderation` | Report and case workflow starter without automatic punishments |

Every generated app contains:

```txt
src/apps/example/
├─ index.ts
├─ app.test.ts
├─ README.md
└─ serveros.app.json
```

Duplicate an app:

```bash
npm run app:duplicate -- notes team-notes --name "Team Notes" --author "Your Name"
```

Delete a custom app source folder:

```bash
npm run app:delete -- team-notes --yes
```

Built-in apps are protected unless `--force` is explicitly supplied. Source deletion does not delete database rows belonging to the app.

Validate and test an app before running it:

```bash
npm run app:validate -- team-notes
npm run app:test -- team-notes
```

Apps should use the runtime context instead of importing core internals:

- `ctx.storage` for per-guild, per-app data
- `ctx.logger` for structured app logs
- `ctx.health` for health state
- `ctx.permissions` for user action checks
- `ctx.ui` for embeds, buttons and screens
- `ctx.installations` for installation state
- `ctx.registry` for app metadata and dependencies

See [App SDK](docs/APP_SDK.md) and [App Development Workflow](docs/APP_DEVELOPMENT.md) for detailed examples.

## App manifests

Every app requires a canonical `serveros.app.json` file. The folder name, manifest ID and exported runtime metadata must agree.

```json
{
  "$schema": "../../../schemas/serveros.app.schema.json",
  "schemaVersion": 1,
  "id": "weather",
  "name": "Weather",
  "version": "1.0.0",
  "description": "Weather information for the server.",
  "icon": "🌦️",
  "category": "Utility",
  "entry": "index.ts",
  "serveros": {
    "minVersion": "0.1.5"
  },
  "publisher": {
    "name": "Your Name",
    "github": "your-github-name"
  },
  "permissions": ["storage:read", "storage:write", "ui:reply"],
  "dependencies": [],
  "commands": ["weather"],
  "resources": {
    "storage": {
      "maxBytes": 5242880
    }
  },
  "license": "MIT",
  "releaseChannel": "development"
}
```

The schema validates IDs, semantic versions, compatibility ranges, commands, supported permissions, dependencies, settings, resources, URLs, release channels and optional signature metadata. Runtime loading additionally verifies the entry module and compares manifest values with the exported app.

The complete schema is available at [schemas/serveros.app.schema.json](schemas/serveros.app.schema.json).

## Testing and diagnostics

Run the complete quality pipeline:

```bash
npm run check
```

It performs:

1. Prisma client generation
2. Clean production build
3. Tooling type checks
4. Core automated tests
5. Per-app tests
6. Manifest and runtime validation
7. Compiled `dist` registry validation
8. Deterministic package build verification
9. Project diagnostics

Individual commands:

```bash
npm test
npm run app:test
npm run app:test -- notes
npm run app:validate
npm run app:validate -- notes
npm run app:validate -- --json
npm run app:doctor
npm run app:doctor -- --json
npm audit
```

The doctor checks Node.js, package and lockfile versions, schemas, environment key names, Prisma, app loading, app tests, compiled manifests and Git metadata. It checks only environment key names and never prints secret values.

## Packaging and signing apps

Create an unsigned development package:

```bash
npm run app:package -- my-app
```

Choose an output directory:

```bash
npm run app:package -- my-app --out releases
```

The command produces:

```txt
releases/
├─ my-app-1.0.0.serveros-app
└─ my-app-1.0.0.serveros-app.sha256
```

The `.serveros-app` file is a deterministic ZIP-compatible archive containing a compiled ESM bundle, canonical manifest, optional assets and migrations, and an internal checksum list.

Generate Ed25519 publisher keys with OpenSSL:

```bash
openssl genpkey -algorithm Ed25519 -out publisher.private.pem
openssl pkey -in publisher.private.pem -pubout -out publisher.public.pem
```

Create a signed package:

```bash
npm run app:package -- my-app --sign-key publisher.private.pem
```

Verify a downloaded or locally built package:

```bash
npm run app:verify-package -- releases/my-app-1.0.0.serveros-app
npm run app:verify-package -- releases/my-app-1.0.0.serveros-app --public-key publisher.public.pem --require-signature
```

Never upload `publisher.private.pem`. A public key may be committed and distributed, but trust must come from the ServerOS instance or official catalog rather than from a public key included beside an untrusted package.

The reusable [app release workflow](.github/workflows/app-release.yml) validates, tests, signs, verifies and optionally publishes release artifacts. See [GitHub App Publishing](docs/GITHUB_PUBLISHING.md).

## Safe Mode and recovery

ServerOS counts consecutive failures for each app and guild. A successful execution resets the counter. When the configured threshold is reached, the failing app and installed apps that require it are disabled, while the core and healthy apps continue running.

Set a server-specific threshold from Discord:

```txt
/os action:settings threshold:5
```

Repair a disabled app:

```txt
/os action:repair app:notes
```

Repair re-enables an existing installation without running the first-install hook again, which preserves existing app data.

If a custom app prevents normal operation, stop ServerOS and enable Safe Mode:

```env
SERVEROS_SAFE_MODE="true"
SERVEROS_SAFE_APPS="terminal"
```

Restart ServerOS, inspect the failing app and return `SERVEROS_SAFE_MODE` to `false` after recovery.

Inspect data left by removed source apps:

```bash
npm run app:orphans
npm run app:orphans -- --app removed-app
```

Permanent cleanup requires both explicit flags:

```bash
npm run app:orphans -- --app removed-app --delete --yes
```

Stop ServerOS and back up `prisma/dev.db` before deleting data. Deleted rows are recoverable only from a backup.

## What to upload to GitHub

Commit and upload these files:

- `.github/`
- `.gitignore`
- `.env.example`
- `src/`
- `scripts/`
- `schemas/`
- `tests/`
- `docs/`
- `prisma/schema.prisma`
- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `tsconfig.tools.json`
- `README.md`
- `CHANGELOG.md`
- `LICENSE`
- `publisher.public.pem` only when you intentionally establish a publisher key

Do not upload these files:

- `.env`
- Discord bot tokens, client secrets or signing secrets
- `node_modules/`
- `dist/`
- `prisma/dev.db`
- Any `*.db` or `*.db-journal` file
- `.prisma/`
- `packages/`
- Local `.serveros-app` build artifacts
- `*.private.pem`
- `.serveros-package-test/`
- `coverage/`
- Debug logs

These paths are covered by the included `.gitignore`. Check the staged files before the first push:

```bash
git status
git diff --cached
```

A typical first publication flow is:

```bash
git init
git add .
git status
git commit -m "Initial ServerOS release"
git branch -M main
git remote add origin <your-repository-url>
git push -u origin main
```

Do not run `git add -f` on ignored secrets or generated directories.

## Security model

ServerOS currently provides logical isolation, not a hard sandbox.

Available protections:

- Per-app storage namespaces
- Per-guild installation state
- Manifest and runtime contract validation
- Command and dependency conflict detection
- App-level failure boundaries
- Crash thresholds and automatic disable
- Package path traversal protection
- ZIP CRC and SHA-256 verification
- Package file-count and unpacked-size limits
- Optional Ed25519 publisher signatures
- No installation-time package scripts or dependency installation

Current limitations:

- App permission names are declarations shown to administrators; they are not yet fully enforced capabilities.
- Trusted local app code runs in the main Node.js process.
- A malicious local app can potentially access process and host resources.
- Remote GitHub package installation, trust storage and atomic activation are not implemented yet.
- Shared hosting should not execute arbitrary community apps until process or container isolation is available.

Only run apps from developers you trust. A valid checksum proves that files did not change; it does not prove that the code is safe. A valid signature proves which trusted publisher key signed the checksum; it does not replace code review or sandboxing.

## Project structure

```txt
serveros/
├─ .github/workflows/
│  ├─ ci.yml
│  └─ app-release.yml
├─ docs/
├─ prisma/
│  └─ schema.prisma
├─ schemas/
│  └─ serveros.app.schema.json
├─ scripts/
├─ src/
│  ├─ apps/
│  ├─ core/
│  │  ├─ commands/
│  │  ├─ context/
│  │  ├─ database/
│  │  ├─ packages/
│  │  ├─ router/
│  │  ├─ runtime/
│  │  ├─ sdk/
│  │  ├─ system/
│  │  ├─ ui/
│  │  └─ utils/
│  ├─ deploy-commands.ts
│  └─ main.ts
├─ tests/
├─ .env.example
├─ .gitignore
├─ package.json
├─ package-lock.json
├─ tsconfig.json
└─ tsconfig.tools.json
```

## Troubleshooting

### Missing required environment variable

Copy `.env.example` to `.env` and fill `DISCORD_TOKEN` and `DISCORD_CLIENT_ID`. Prisma also requires `DATABASE_URL`.

### Discord login failed

The bot token is missing, invalid or revoked. Reset it in the Discord Developer Portal, update `.env` and never paste it into an issue or commit.

### Commands do not appear

- Confirm the bot is installed in the server.
- Confirm the application was installed with application-command support.
- Set `DISCORD_GUILD_ID` during development.
- Run `npm run deploy:commands`.
- Restart ServerOS.
- Install the requested app from `/os action:apps` so its guild command is synchronized.

### Prisma client errors

```bash
npm run db:generate
npm run db:push
```

### An app appears as broken

```bash
npm run app:validate -- <app-id>
npm run app:test -- <app-id>
npm run app:doctor
```

Check that the folder name, manifest ID, runtime metadata, commands, publisher name, dependencies and entry file agree.

### Production build contains old apps

Run a fresh build:

```bash
npm run build
```

The build preparation script safely removes only the project `dist` directory before compiling.

### An app repeatedly crashes

Use `/monitor` and `/logs`, repair the app with `/os action:repair`, or restart in Safe Mode.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [App SDK](docs/APP_SDK.md)
- [App Development Workflow](docs/APP_DEVELOPMENT.md)
- [Permissions](docs/PERMISSIONS.md)
- [GitHub App Publishing](docs/GITHUB_PUBLISHING.md)
- [Changelog](CHANGELOG.md)

## Contributing

Before opening a pull request:

1. Keep changes scoped and preserve existing app data.
2. Add or update tests for behavior changes.
3. Keep manifest and runtime metadata synchronized.
4. Run `npm run check`.
5. Run `npm audit`.
6. Do not commit secrets, databases, generated packages or private signing keys.

## Attribution

When using, modifying or redistributing ServerOS or a substantial portion of its source code, retain the original copyright and MIT License notice. Include the following attribution in your project README, documentation, About page or credits:

> ServerOS by [Phantom Storm](https://www.phantomstorme.com) — [GitHub](https://github.com/AvsarEmir/ServerOs)

Do not remove or misrepresent the original authorship of ServerOS.

## License

ServerOS is released under the [MIT License](LICENSE).
