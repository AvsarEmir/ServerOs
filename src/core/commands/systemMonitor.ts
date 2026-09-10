import { ButtonStyle } from "discord.js";
import type { CoreCommandContext } from "../runtime/types.js";

export async function showSystemMonitor(ctx: CoreCommandContext): Promise<void> {
  await ctx.installations.ensureGuild(ctx.guildId, ctx.interaction.guild?.name);

  const installedIds = await ctx.installations.installedAppIds(ctx.guildId);
  const healthRows = await ctx.health.list(ctx.guildId);
  const logs = await ctx.prisma.systemLog.findMany({
    where: { guildId: ctx.guildId },
    orderBy: { createdAt: "desc" },
    take: 5
  });

  const knownApps = ctx.registry.all();
  const appLines = knownApps.map((app) => {
    const installed = installedIds.includes(app.metadata.id);
    const health = healthRows.find((row: any) => row.appId === app.metadata.id);
    const status = app.metadata.system ? "🟣 System" : installed ? ctx.health.label(health?.status) : "⚪ Not installed";
    return `${app.metadata.icon} **${app.metadata.name}** — ${status}`;
  });

  const logLines = logs.length
    ? logs.map((log: any) => `• **${log.level.toUpperCase()}** ${log.appId ? `[${log.appId}] ` : ""}${log.message}`.slice(0, 180)).join("\n")
    : ctx.ui.empty("No logs yet.");

  await ctx.reply({
    embeds: [
      ctx.ui.embed({
        title: "📊 ServerOS System Monitor",
        description: "Runtime health for your Discord operating layer.",
        fields: [
          {
            name: "System",
            value: [
              "Status: **Running**",
              `Installed Apps: **${installedIds.length}**`,
              `Loaded Apps: **${knownApps.length}**`,
              `Permission Mode: **${ctx.permissions.isRoot() ? "Root" : "User"}**`
            ].join("\n"),
            inline: true
          },
          {
            name: "App Health",
            value: appLines.length ? appLines.join("\n") : ctx.ui.empty("No apps loaded."),
            inline: false
          },
          {
            name: "Recent Logs",
            value: logLines,
            inline: false
          }
        ],
        footer: "ServerOS v0.1.1 Runtime Health"
      })
    ],
    components: [
      ctx.ui.row(
        ctx.ui.button({ id: "sos:core:apps", label: "App Store", emoji: "📦", style: ButtonStyle.Primary }),
        ctx.ui.button({ id: "sos:core:refresh-monitor", label: "Refresh", emoji: "🔄" })
      )
    ]
  });
}

export async function showSystemLogs(ctx: CoreCommandContext, appId?: string | null): Promise<void> {
  if (!(await ctx.permissions.require("logs:view"))) {
    return;
  }

  const logs = await ctx.prisma.systemLog.findMany({
    where: {
      guildId: ctx.guildId,
      appId: appId || undefined
    },
    orderBy: { createdAt: "desc" },
    take: 10
  });

  await ctx.reply({
    embeds: [
      ctx.ui.embed({
        title: appId ? `🧾 Logs — ${appId}` : "🧾 ServerOS Logs",
        description: logs.length
          ? logs
              .map((log: any) => {
                const scope = log.appId ? `[${log.appId}] ` : "[core] ";
                return `• **${log.level.toUpperCase()}** ${scope}${log.message}`.slice(0, 220);
              })
              .join("\n")
          : ctx.ui.empty("No logs found."),
        footer: "Only root users can view logs."
      })
    ]
  });
}
