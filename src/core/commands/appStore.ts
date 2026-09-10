import { ButtonStyle } from "discord.js";
import type { CoreCommandContext, ServerOSApp } from "../runtime/types.js";
import { createAppContext } from "../context/createContext.js";
import { showSystemLogs } from "./systemMonitor.js";
import type { CommandSyncer } from "../system/CommandSyncer.js";

type StoreView = "home" | "installed" | "downloadable" | "categories" | "category";

function statusLabel(app: ServerOSApp, installed: Set<string>): string {
  if (app.metadata.system) return "🛡️ System";
  return installed.has(app.metadata.id) ? "📥 Installed" : "⬇️ Downloadable";
}

function compactAppLine(ctx: CoreCommandContext, app: ServerOSApp, installed: Set<string>): string {
  const deps = ctx.registry.dependencyLabel(app);
  return [
    `${app.metadata.icon} **${app.metadata.name}** \`${app.metadata.id}\``,
    `↳ ${app.metadata.description}`,
    `↳ v${app.metadata.version} • ${app.metadata.category} • ${statusLabel(app, installed)}`,
    deps !== "None" ? `↳ Dependencies: \`${deps}\`` : undefined
  ].filter(Boolean).join("\n");
}

function groupByCategory(apps: ServerOSApp[]): string {
  if (!apps.length) return "_No apps in this section._";

  const categories = [...new Set(apps.map((app) => app.metadata.category || "Custom"))].sort();
  return categories
    .map((category) => {
      const items = apps
        .filter((app) => app.metadata.category === category)
        .map((app) => `${app.metadata.icon} ${app.metadata.name} \`${app.metadata.id}\``)
        .join("\n");
      return `**${category}**\n${items}`;
    })
    .join("\n\n")
    .slice(0, 1024);
}

function encodeCategory(category: string): string {
  return category.replaceAll(" ", "_");
}

function decodeCategory(category: string): string {
  return category.replaceAll("_", " ");
}

async function activateApp(
  ctx: CoreCommandContext,
  appId: string,
  commandSyncer?: CommandSyncer
): Promise<{
  activatedAppIds: string[];
  firstInstallAppIds: string[];
  commandCount?: number;
  error?: string;
}> {
  let activatedAppIds: string[] = [];
  let firstInstallAppIds: string[] = [];

  try {
    const result = await ctx.installations.installWithDependencies(ctx.guildId, appId);
    activatedAppIds = result.activatedAppIds;
    firstInstallAppIds = result.firstInstallAppIds;

    for (const activatedAppId of activatedAppIds) {
      await ctx.health.reset(ctx.guildId, activatedAppId);
    }

    for (const installedAppId of firstInstallAppIds) {
      const installedApp = ctx.registry.get(installedAppId);
      if (!installedApp) {
        throw new Error(`Installed app disappeared from the registry: ${installedAppId}`);
      }

      await ctx.health.markRunning(ctx.guildId, installedAppId);
      const appCtx = createAppContext({
        app: installedApp,
        client: ctx.client,
        prisma: ctx.prisma,
        registry: ctx.registry,
        installations: ctx.installations,
        interaction: ctx.interaction
      });

      await installedApp.install?.(appCtx);
      await ctx.health.markHealthy(ctx.guildId, installedAppId);
      await ctx.logger.child(installedAppId, ctx.guildId).info("App installed");
    }
  } catch (error) {
    await ctx.installations.disableAppIds(ctx.guildId, activatedAppIds).catch((rollbackError) => ctx.logger.error("App activation rollback failed", rollbackError));
    for (const activatedAppId of activatedAppIds) {
      await ctx.health.markDisabled(ctx.guildId, activatedAppId).catch((healthError) => ctx.logger.error("Rolled back app health could not be updated", healthError));
    }
    await ctx.logger.error("App activation failed", error);
    return {
      activatedAppIds,
      firstInstallAppIds,
      error: error instanceof Error ? error.message : String(error)
    };
  }

  let commandCount: number | undefined;
  if (commandSyncer) {
    try {
      commandCount = await commandSyncer.syncGuild(ctx.guildId);
    } catch (error) {
      await ctx.logger.error("Command sync failed after app activation", error);
    }
  }

  return { activatedAppIds, firstInstallAppIds, commandCount };
}

function baseRows(ctx: CoreCommandContext) {
  return [
    ctx.ui.row(
      ctx.ui.button({ id: "sos:core:refresh-desktop", label: "Desktop", emoji: "🖥️", style: ButtonStyle.Secondary }),
      ctx.ui.button({ id: "sos:apps:view:home", label: "Store Home", emoji: "📦", style: ButtonStyle.Secondary }),
      ctx.ui.button({ id: "sos:apps:view:installed", label: "Installed", emoji: "📥", style: ButtonStyle.Primary }),
      ctx.ui.button({ id: "sos:apps:view:downloadable", label: "Downloadable", emoji: "⬇️", style: ButtonStyle.Success })
    )
  ];
}

function appActionRows(ctx: CoreCommandContext, apps: ServerOSApp[], installed: Set<string>) {
  const rows = [];

  for (const app of apps.slice(0, 4)) {
    const isInstalled = installed.has(app.metadata.id) || app.metadata.system;
    rows.push(
      ctx.ui.row(
        ctx.ui.button({
          id: `sos:apps:open:${app.metadata.id}`,
          label: `Open ${app.metadata.name}`.slice(0, 80),
          emoji: "🚀",
          style: ButtonStyle.Primary,
          disabled: !isInstalled
        }),
        ctx.ui.button({
          id: isInstalled ? `sos:apps:uninstall:${app.metadata.id}` : `sos:apps:install:${app.metadata.id}`,
          label: app.metadata.system ? "System" : isInstalled ? "Disable" : "Install",
          emoji: app.metadata.system ? "🛡️" : isInstalled ? "⏸️" : "⬇️",
          style: isInstalled ? ButtonStyle.Secondary : ButtonStyle.Success,
          disabled: app.metadata.system
        }),
        ctx.ui.button({
          id: `sos:apps:details:${app.metadata.id}`,
          label: "Details",
          emoji: "ℹ️",
          style: ButtonStyle.Secondary
        }),
        ctx.ui.button({
          id: `sos:apps:logs:${app.metadata.id}`,
          label: "Logs",
          emoji: "🧾",
          style: ButtonStyle.Secondary
        })
      )
    );
  }

  return rows;
}

export async function showAppStore(
  ctx: CoreCommandContext,
  options: { view?: StoreView; category?: string; appId?: string } = {}
): Promise<void> {
  await ctx.installations.ensureGuild(ctx.guildId, ctx.interaction.guild?.name);

  const installedIds = await ctx.installations.installedAppIds(ctx.guildId);
  const installed = new Set(installedIds);
  const allApps = ctx.registry.all();
  const installedApps = allApps.filter((app) => app.metadata.system || installed.has(app.metadata.id));
  const downloadableApps = allApps.filter((app) => !app.metadata.system && !installed.has(app.metadata.id));
  const loadIssues = ctx.registry.loadIssueDetails();

  const view = options.view ?? "home";

  if (options.appId) {
    const app = ctx.registry.get(options.appId);
    if (!app) {
      await ctx.reply({ content: "Unknown app.", ephemeral: true });
      return;
    }

    const missingDependencies = await ctx.installations.missingDependencyIds(ctx.guildId, app.metadata.id);
    const permissions = app.metadata.permissions?.length ? app.metadata.permissions.join(", ") : "No extra permissions";
    const settings = app.settings ? Object.keys(app.settings).join(", ") : "None";

    await ctx.reply({
      embeds: [
        ctx.ui.embed({
          title: `${app.metadata.icon} ${app.metadata.name}`,
          description: app.metadata.description,
          fields: [
            { name: "Status", value: statusLabel(app, installed), inline: true },
            { name: "Category", value: String(app.metadata.category), inline: true },
            { name: "Version", value: `v${app.metadata.version}`, inline: true },
            { name: "Dependencies", value: ctx.registry.dependencyLabel(app), inline: false },
            { name: "Missing Dependencies", value: missingDependencies.length ? missingDependencies.join(", ") : "None", inline: false },
            { name: "Permissions", value: permissions.slice(0, 1024), inline: false },
            { name: "Settings Schema", value: settings.slice(0, 1024), inline: false }
          ],
          footer: "Installable apps can automatically install required dependencies."
        })
      ],
      components: [
        ...baseRows(ctx),
        ...appActionRows(ctx, [app], installed)
      ].slice(0, 5)
    });
    return;
  }

  if (view === "installed") {
    const list = installedApps.length
      ? installedApps.map((app) => compactAppLine(ctx, app, installed)).join("\n\n")
      : ctx.ui.empty("No downloaded apps yet.");

    await ctx.reply({
      embeds: [
        ctx.ui.embed({
          title: "📥 Installed Apps",
          description: "These apps are downloaded/enabled for this server and their slash commands are synced.",
          fields: [{ name: "Apps", value: list.slice(0, 1024), inline: false }],
          footer: "Use /os action:open app:<id> to open any installed app."
        })
      ],
      components: [...baseRows(ctx), ...appActionRows(ctx, installedApps, installed)].slice(0, 5)
    });
    return;
  }

  if (view === "downloadable") {
    const list = downloadableApps.length
      ? downloadableApps.map((app) => compactAppLine(ctx, app, installed)).join("\n\n")
      : ctx.ui.empty("No downloadable apps found. Add a new app inside src/apps/.");

    await ctx.reply({
      embeds: [
        ctx.ui.embed({
          title: "⬇️ Downloadable Apps",
          description: "These apps exist in the apps folder but are not installed in this server yet.",
          fields: [{ name: "Apps", value: list.slice(0, 1024), inline: false }],
          footer: "Installing an app also syncs its slash commands for this guild."
        })
      ],
      components: [...baseRows(ctx), ...appActionRows(ctx, downloadableApps, installed)].slice(0, 5)
    });
    return;
  }

  if (view === "categories") {
    const categories = ctx.registry.categories(allApps);
    const rows = baseRows(ctx);
    if (categories.length) {
      rows.push(
        ctx.ui.row(
          ...categories.slice(0, 5).map((category) =>
            ctx.ui.button({
              id: `sos:apps:category:${encodeCategory(category)}`,
              label: category.slice(0, 80),
              emoji: "🗂️",
              style: ButtonStyle.Secondary
            })
          )
        )
      );
    }

    await ctx.reply({
      embeds: [
        ctx.ui.embed({
          title: "🗂️ App Categories",
          description: categories.length ? categories.map((category) => `• **${category}** — ${ctx.registry.appsByCategory(category).length} apps`).join("\n") : "No categories found.",
          footer: "Categories come from each app manifest."
        })
      ],
      components: rows.slice(0, 5)
    });
    return;
  }

  if (view === "category" && options.category) {
    const category = decodeCategory(options.category);
    const apps = ctx.registry.appsByCategory(category, allApps);
    const list = apps.length ? apps.map((app) => compactAppLine(ctx, app, installed)).join("\n\n") : ctx.ui.empty("No apps in this category.");

    await ctx.reply({
      embeds: [
        ctx.ui.embed({
          title: `🗂️ ${category}`,
          description: "Apps in this category.",
          fields: [{ name: "Apps", value: list.slice(0, 1024), inline: false }]
        })
      ],
      components: [...baseRows(ctx), ...appActionRows(ctx, apps, installed)].slice(0, 5)
    });
    return;
  }

  const fields = [
    { name: "📥 Installed Apps", value: groupByCategory(installedApps), inline: false },
    { name: "⬇️ Downloadable Apps", value: groupByCategory(downloadableApps), inline: false }
  ];

  if (loadIssues.length) {
    fields.push({
      name: "🔴 Broken Apps",
      value: loadIssues.slice(0, 5).map((issue) => `• **${issue.appId}** — ${issue.message}`).join("\n").slice(0, 1024),
      inline: false
    });
  }

  await ctx.reply({
    embeds: [
      ctx.ui.embed({
        title: "📦 ServerOS App Store",
        description: "A rebuilt App Store for ServerOS apps. Installed apps are active in this server; downloadable apps are available from the `apps/` folder and can be installed into the operating layer.",
        fields,
        footer: `Use /os action:install app:<id> • Mode: ${ctx.permissions.isRoot() ? "Root" : "User"}`
      })
    ],
    components: [
      ...baseRows(ctx),
      ctx.ui.row(
        ctx.ui.button({ id: "sos:apps:view:categories", label: "Categories", emoji: "🗂️", style: ButtonStyle.Secondary }),
        ctx.ui.button({ id: "sos:apps:refresh", label: "Refresh", emoji: "🔄", style: ButtonStyle.Secondary })
      )
    ].slice(0, 5)
  });
}

export async function handleAppStoreButton(
  ctx: CoreCommandContext,
  action: string,
  appId?: string,
  commandSyncer?: CommandSyncer,
  executeApp?: (appId: string, action: () => Promise<void>) => Promise<void>
): Promise<void> {
  if (action === "refresh") {
    await showAppStore(ctx);
    return;
  }

  if (action === "view") {
    const view = (appId ?? "home") as StoreView;
    await showAppStore(ctx, { view });
    return;
  }

  if (action === "category") {
    await showAppStore(ctx, { view: "category", category: appId });
    return;
  }

  if (!appId) {
    await ctx.reply({ content: "Missing app id.", ephemeral: true });
    return;
  }

  const app = ctx.registry.get(appId);

  if (!app) {
    await ctx.reply({ content: "Unknown app.", ephemeral: true });
    return;
  }

  if (action === "details") {
    await showAppStore(ctx, { appId });
    return;
  }

  if (action === "logs") {
    await showSystemLogs(ctx, appId);
    return;
  }

  if (action === "install") {
    if (!(await ctx.permissions.require("apps:install"))) {
      return;
    }

    const activation = await activateApp(ctx, appId, commandSyncer);
    if (activation.error) {
      await ctx.reply({ content: `⚠️ ${app.metadata.name} could not be installed: ${activation.error}`, ephemeral: true });
      return;
    }

    const dependenciesInstalled = activation.activatedAppIds.filter((id) => id !== appId);
    await ctx.update({
      content: [
        `✅ ${app.metadata.name} installed.`,
        dependenciesInstalled.length ? `Dependencies installed: ${dependenciesInstalled.join(", ")}.` : undefined,
        activation.commandCount ? `${activation.commandCount} slash commands synced for this server.` : "Slash command sync will retry later."
      ].filter(Boolean).join(" "),
      embeds: [],
      components: []
    });
    return;
  }

  if (action === "repair") {
    if (!(await ctx.permissions.require("system:manage"))) {
      return;
    }

    if (app.metadata.system) {
      await ctx.reply({ content: "System apps do not use the repair flow.", ephemeral: true });
      return;
    }

    if (!(await ctx.installations.hasInstallation(ctx.guildId, appId))) {
      await ctx.reply({ content: "Install this app before using repair.", ephemeral: true });
      return;
    }

    await ctx.health.reset(ctx.guildId, appId);
    const activation = await activateApp(ctx, appId, commandSyncer);
    if (activation.error) {
      await ctx.reply({ content: `⚠️ ${app.metadata.name} repair failed: ${activation.error}`, ephemeral: true });
      return;
    }

    await ctx.logger.child(appId, ctx.guildId).info("App repair started");
    const appCtx = createAppContext({
      app,
      client: ctx.client,
      prisma: ctx.prisma,
      registry: ctx.registry,
      installations: ctx.installations,
      interaction: ctx.interaction
    });

    if (executeApp) {
      await executeApp(appId, () => app.open(appCtx));
    } else {
      await app.open(appCtx);
    }
    return;
  }

  if (action === "uninstall") {
    if (!(await ctx.permissions.require("apps:uninstall"))) {
      return;
    }

    const appCtx = createAppContext({
      app,
      client: ctx.client,
      prisma: ctx.prisma,
      registry: ctx.registry,
      installations: ctx.installations,
      interaction: ctx.interaction
    });

    await app.uninstall?.(appCtx);
    try {
      await ctx.installations.uninstall(ctx.guildId, appId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await ctx.reply({ content: `⚠️ ${app.metadata.name} could not be disabled: ${message}`, ephemeral: true });
      return;
    }
    await ctx.health.markDisabled(ctx.guildId, appId);
    await ctx.logger.child(appId, ctx.guildId).info("App disabled");
    let commandCount: number | undefined;
    if (commandSyncer) {
      try {
        commandCount = await commandSyncer.syncGuild(ctx.guildId);
      } catch (error) {
        await ctx.logger.error("Command sync failed after app disable", error);
      }
    }

    await ctx.update({
      content: `🟡 ${app.metadata.name} disabled.${commandCount ? ` ${commandCount} slash commands synced for this server.` : " Slash command sync will retry later."}`,
      embeds: [],
      components: []
    });
    return;
  }

  if (action === "open") {
    if (!(await ctx.permissions.require("apps:open"))) {
      return;
    }

    const installed = await ctx.installations.isInstalled(ctx.guildId, appId);
    if (!installed && !app.metadata.system) {
      await ctx.reply({ content: "Install this app before opening it.", ephemeral: true });
      return;
    }

    const appCtx = createAppContext({
      app,
      client: ctx.client,
      prisma: ctx.prisma,
      registry: ctx.registry,
      installations: ctx.installations,
      interaction: ctx.interaction
    });
    if (executeApp) {
      await executeApp(appId, () => app.open(appCtx));
    } else {
      await app.open(appCtx);
    }
  }
}
