# ServerOS Permissions

ServerOS has two permission layers:

1. User permissions — what a Discord member can do inside ServerOS
2. App permissions — what an app declares in its metadata

## User permissions

ServerOS currently uses a simple model:

- **Root**: Discord Administrator or Manage Server permission
- **User**: everyone else

Root can:

- Install apps
- Disable apps
- View logs
- Manage system-level actions

Users can:

- Open installed apps
- Use installed app commands according to the app behavior
- View normal UI panels

## App permissions

Apps declare requested capabilities in metadata:

```ts
permissions: ["storage:read", "storage:write", "ui:reply"]
```

Supported app permission labels include:

- `storage:read`
- `storage:write`
- `ui:reply`
- `apps:open`
- `logs:write`
- `system:read`
- `moderation:case:create`
- `automation:write`

These are currently metadata labels shown in the App Store. v0.2.0 is planned to add a stronger approval screen before install.

## Command visibility

App slash commands are synced per guild.

- Core commands are always visible
- System app commands are always visible
- Installed app commands are visible
- Disabled app commands are removed after sync

This means yüklü olmayan app komutları Discord command listesinde kalmaz.
