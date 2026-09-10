# App Development Workflow

ServerOS apps live inside `src/apps/<app-id>` and use `serveros.app.json` as their canonical manifest.

The folder is the app author's workspace. Put the app's commands, screens, handlers, local helpers, README and manifest there. ServerOS discovers the app by loading its entry file, usually `index.ts`.

## Important boundary

ServerOS gives apps a friendly runtime boundary, not a hard security sandbox.

Recommended app code should use the SDK/context:

- `ctx.storage` for per-guild, per-app data
- `ctx.logger` for logs
- `ctx.ui` for embeds, buttons and screens
- `ctx.permissions` for action checks
- `ctx.registry` for reading app metadata
- `ctx.installations` for install state

Avoid importing core internals directly unless you are intentionally contributing to ServerOS itself.

Because app code runs in the same Node.js process as the bot, only install or run apps from trusted developers. The app-level error boundary prevents normal app errors from crashing ServerOS, but it is not a security container for untrusted code.

## Create apps

Interactive:

```bash
npm run app:create
```

Direct:

```bash
npm run app:create wiki -- --template crud --author Emir
npm run app:create mod-tools -- --template moderation
```

Templates:

- `simple` — single-screen app
- `crud` — create/list/delete app backed by app storage
- `dashboard` — read-only dashboard app
- `moderation` — report/case workflow starter

Every template creates:

- `index.ts`
- `serveros.app.json`
- `app.test.ts`
- `README.md`

The generator validates both the manifest and exported runtime app before reporting success. If validation fails, it removes only the folder it just generated.

## Validate and test apps

Validate every app:

```bash
npm run app:validate
```

Validate or test one app:

```bash
npm run app:validate notes
npm run app:test notes
```

Machine-readable validation is available with:

```bash
npm run app:validate -- --json
```

Run project diagnostics:

```bash
npm run app:doctor
npm run app:doctor -- --json
```

The doctor checks project versions, Node.js, the lockfile, environment key names, Prisma, app manifests, app tests and compiled app manifests. It never prints environment values.

## Package apps

Create a release artifact:

```bash
npm run app:package my-app
npm run app:package my-app -- --out releases
```

The command validates and tests the app, creates a single ESM bundle, writes a deterministic ZIP-compatible `.serveros-app` artifact and creates a matching `.sha256` sidecar.

Package contents:

```txt
my-app-1.0.0.serveros-app
├─ serveros.app.json
├─ dist/index.js
├─ assets/
├─ migrations/
└─ CHECKSUM
```

`assets` and `migrations` appear only when the source app provides them. Packages are unsigned by default and can be signed with an Ed25519 publisher key.

Signed packages and downloaded artifacts can be handled with:

```bash
npm run app:package my-app -- --sign-key publisher.private.pem
npm run app:verify-package packages/my-app-1.0.0.serveros-app -- --public-key publisher.public.pem --require-signature
```

See `docs/GITHUB_PUBLISHING.md` for key handling, GitHub Secrets and the reusable release workflow.

Packaging does not execute app install scripts and does not run `npm install`. The verifier rejects path traversal, duplicate paths, bad CRC values, checksum mismatches, unsupported root files, excessive file counts and oversized extracted payloads.

## Duplicate apps

Duplicate is useful when you want to create a new app from an existing app's structure.

```bash
npm run app:duplicate <source-app-id> <new-app-id>
```

Examples:

```bash
npm run app:duplicate weather weather-pro
npm run app:duplicate notes team-notes -- --name "Team Notes"
```

The duplicate tool copies the folder and updates common identifiers:

- app id
- display name
- generated command name
- manifest metadata
- common class names from generated templates

After duplicating, review the copied code. Custom logic can still contain app-specific names that need manual cleanup.

## Delete apps

Delete removes the source folder from `src/apps`.

```bash
npm run app:delete weather -- --yes
```

Without `--yes`, ServerOS asks for confirmation.

Built-in apps are protected by default:

```bash
npm run app:delete notes -- --force --yes
```

Use `--force` only when you intentionally want to remove a built-in app from the source tree.

Deleting an app folder does not erase old database rows automatically. It only removes the app code from the registry after restart.

## Orphaned app data

Inspect installation, storage, health and log rows that belong to removed app folders:

```bash
npm run app:orphans
npm run app:orphans -- --app weather
```

These commands only display a preview. To permanently remove the displayed rows:

```bash
npm run app:orphans -- --app weather --delete --yes
```

Stop ServerOS and back up `prisma/dev.db` before permanent deletion. Deleted rows can only be recovered from a database backup.

The cleanup service checks the live app registry again before deletion and refuses to delete data that belongs to a registered app.

## After create / duplicate / delete

Run:

```bash
npm run deploy:commands
npm run dev
```

If an app is installed/disabled from the App Store, ServerOS also syncs guild commands from inside Discord.
