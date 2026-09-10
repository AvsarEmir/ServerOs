# ServerOS App SDK

ServerOS apps are small modules inside `src/apps/<app-id>`.

Each app exports a default ServerOS app. The easiest way is to use `createApp()` from the SDK.

## Create an app

Interactive mode:

```bash
npm run app:create
```

Direct mode:

```bash
npm run app:create weather -- --template simple
npm run app:create wiki -- --template crud --author Emir
npm run app:create mod-tools -- --template moderation
```

This creates:

```txt
src/apps/weather/
  index.ts
  README.md
  serveros.app.json
```

After restart, the app appears in the App Store as a downloadable app.

## Duplicate an app

Use duplicate when you want to branch an existing app into a new app folder:

```bash
npm run app:duplicate notes team-notes -- --name "Team Notes"
npm run app:duplicate weather weather-pro
```

The duplicate tool copies the source folder and updates common generated identifiers such as app id, app name, command name and `serveros.app.json` metadata.

Review the copied code afterwards. If the source app has custom hardcoded names, you may still want to clean them manually.

## Delete an app

```bash
npm run app:delete weather -- --yes
```

This removes `src/apps/weather` from the source tree. It does not automatically delete old app storage from the database.

Built-in apps are protected unless you pass `--force`.

## Templates

| Template | Purpose |
|---|---|
| `simple` | Single-screen app with one command |
| `crud` | Create/list/delete app backed by app storage |
| `dashboard` | Read-only metric/widget panel |
| `moderation` | Moderation-style report/case workflow starter |

The moderation template is intentionally a workflow starter. It creates reports/cases but does not ban, kick or mute users by default.

## App lifecycle

An app can implement:

- `install(ctx)` — called when installed into a guild
- `uninstall(ctx)` — called when disabled in a guild
- `open(ctx)` — called when opened from `/os`, Desktop or App Store
- `onCommand(ctx, interaction)` — called when the app slash command is used
- `onButton(ctx, interaction)` — called when the app button is clicked

If an app defines `screens.home` but no custom `open()`, `createApp()` opens the home screen automatically.

## Command visibility

App commands are not always registered globally.

ServerOS syncs guild commands based on installed apps:

- Uninstalled app → command hidden after sync
- Installed app → command visible after sync
- System app → command always visible

This keeps the Discord command list clean.

## Minimal app with createApp()

```ts
import { SlashCommandBuilder } from "discord.js";
import { createApp } from "../../core/sdk/index.js";

const WeatherApp = createApp({
  metadata: {
    id: "weather",
    name: "Weather",
    icon: "🌦️",
    version: "1.0.0",
    description: "A tiny custom ServerOS app.",
    category: "Utility",
    permissions: ["ui:reply"]
  },

  commands: [
    new SlashCommandBuilder()
      .setName("weather")
      .setDescription("Open Weather app")
  ],

  screens: {
    home: async (ctx) => ctx.ui.screen({
      app: "Weather",
      screen: "Home",
      title: "🌦️ Weather",
      description: "Hello from Weather app."
    })
  },

  async onCommand(ctx) {
    await ctx.app.open(ctx);
  }
});

export default WeatherApp;
```

## View / Screen system

Use `ctx.ui.screen()` for app screens instead of manually building embeds every time.

```ts
screens: {
  home: async (ctx) => ctx.ui.screen({
    app: "Notes",
    screen: "Home",
    title: "📝 Notes",
    description: "Your notes.",
    fields: [
      { name: "Pinned", value: "No pinned notes yet.", inline: false }
    ]
  })
}
```

This gives apps a consistent ServerOS look and makes multi-screen apps easier to grow later.

## App categories

Recommended categories:

```txt
System
Productivity
Project Management
Knowledge
Automation
Moderation
Utility
Developer
Community
Analytics
Custom
```

Categories power App Store grouping and category filters.

## App dependencies

Apps can require other apps:

```ts
metadata: {
  id: "automation",
  name: "Automation",
  dependencies: [
    "tasks",
    { id: "vault", reason: "Knowledge base integration" }
  ]
}
```

When installing an app, ServerOS installs required dependencies first. If another installed app depends on an app, ServerOS prevents disabling it until the dependent app is disabled first.

## Runtime API

Use `ctx` instead of touching the core directly:

- `ctx.storage` — per-guild, per-app storage
- `ctx.logger` — app logs
- `ctx.health` — app health state
- `ctx.permissions` — root/user checks
- `ctx.ui` — embed/button/screen helpers
- `ctx.installations` — app installation state
- `ctx.registry` — app metadata lookup

## App folder ownership

`src/apps/<app-id>` belongs to the app author. The app can contain any local files it needs: handlers, helpers, views, storage utilities, tests, README and manifest files.

The safe convention is to communicate with ServerOS through `ctx` and the SDK. ServerOS provides app-level error boundaries and storage namespaces, but it is not a hard security sandbox for untrusted code. Only run apps you trust.

## Recommended design

Apps should fail safely:

- Validate user input
- Keep storage inside `ctx.storage`
- Use app-specific custom ids: `sos:<app-id>:<action>`
- Avoid importing core internals directly
- Let ServerOS handle install state, logs, dependencies and health
