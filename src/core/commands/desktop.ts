import { ButtonStyle } from "discord.js";
import type { CoreCommandContext } from "../runtime/types.js";

export async function showDesktop(ctx: CoreCommandContext): Promise<void> {
  await ctx.installations.ensureGuild(ctx.guildId, ctx.interaction.guild?.name);

  const installedIds = await ctx.installations.installedAppIds(ctx.guildId);
  const installedApps = installedIds
    .map((id) => ctx.registry.get(id))
    .filter(Boolean);

  const downloadableCount = ctx.registry
    .all()
    .filter((app) => !app.metadata.system && !installedIds.includes(app.metadata.id)).length;

  const appList = installedApps.length
    ? installedApps.map((app) => `${app!.metadata.icon} **${app!.metadata.name}** \`${app!.metadata.id}\``).join("\n")
    : ctx.ui.empty("No apps installed yet. Open the App Store to install apps.");

  const unhealthy = await ctx.prisma.appHealth.count({
    where: { guildId: ctx.guildId, status: { in: ["degraded", "broken", "crashed"] } }
  });

  const quickRows = [
    ctx.ui.row(
      ctx.ui.button({ id: "sos:core:apps", label: "App Store", emoji: "📦", style: ButtonStyle.Primary }),
      ctx.ui.button({ id: "sos:core:refresh-monitor", label: "Monitor", emoji: "📊" }),
      ctx.ui.button({ id: "sos:core:refresh-desktop", label: "Refresh", emoji: "🔄" })
    )
  ];

  const openableApps = installedApps.filter((app) => app?.metadata.id !== "terminal").slice(0, 4);
  if (openableApps.length) {
    quickRows.push(
      ctx.ui.row(
        ...openableApps.map((app) =>
          ctx.ui.button({
            id: `sos:core:open:${app!.metadata.id}`,
            label: app!.metadata.name.slice(0, 80),
            emoji: app!.metadata.icon,
            style: ButtonStyle.Secondary
          })
        )
      )
    );
  }

  await ctx.reply({
    embeds: [
      ctx.ui.embed({
        title: "🖥️ ServerOS Desktop",
        description: "Welcome to your Discord operating layer. Use `/os` as the central control command for desktop, apps, monitor, logs and opening installed apps.",
        fields: [
          {
            name: "Pinned / Installed Apps",
            value: appList,
            inline: true
          },
          {
            name: "System",
            value: [
              "Status: **Running**",
              `Installed Apps: **${installedApps.length}**`,
              `Downloadable Apps: **${downloadableCount}**`,
              `Unhealthy Apps: **${unhealthy}**`,
              `Mode: **${ctx.permissions.isRoot() ? "Root" : "User"}**`,
              `Guild: **${ctx.interaction.guild?.name ?? ctx.guildId}**`
            ].join("\n"),
            inline: true
          }
        ],
        footer: "ServerOS v0.1.2 OS Control"
      })
    ],
    components: quickRows.slice(0, 5)
  });
}
