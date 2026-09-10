import { SlashCommandBuilder } from "discord.js";
import type { ServerOSApp } from "../../core/runtime/types.js";

const TerminalApp: ServerOSApp = {
  metadata: {
    id: "terminal",
    name: "Terminal",
    icon: "⌨️",
    version: "1.0.0",
    author: "ServerOS Contributors",
    description: "Run OS-style commands inside ServerOS.",
    category: "System",
    permissions: ["ui:reply", "apps:open", "system:read"],
    system: true
  },

  commands: [
    new SlashCommandBuilder()
      .setName("terminal")
      .setDescription("Run a ServerOS terminal command.")
      .addStringOption((option) =>
        option
          .setName("input")
          .setDescription("Try: help, status, apps, open notes")
          .setRequired(false)
      )
  ],

  async open(ctx) {
    await ctx.reply({
      embeds: [
        ctx.ui.embed({
          title: "⌨️ ServerOS Terminal",
          description: [
            "```txt",
            "ServerOS Terminal v0.1.2",
            "> help",
            "> status",
            "> apps",
            "> open notes",
            "```"
          ].join("\n")
        })
      ]
    });
  },

  async onCommand(ctx, interaction) {
    const input = interaction.options.getString("input")?.trim().toLowerCase();

    if (!input) {
      await this.open(ctx);
      return;
    }

    if (input === "help") {
      await ctx.reply({
        embeds: [
          ctx.ui.embed({
            title: "⌨️ Terminal Help",
            description: [
              "```txt",
              "help          Show terminal help",
              "status        Show ServerOS status",
              "apps          List installed apps",
              "open <app>    Open an installed app",
              "os           Open ServerOS Desktop",
              "```"
            ].join("\n")
          })
        ]
      });
      return;
    }

    if (input === "status") {
      const installed = await ctx.installations.installedAppIds(ctx.guildId);
      await ctx.reply({
        embeds: [
          ctx.ui.embed({
            title: "🟢 System Status",
            description: [
              "```txt",
              "ServerOS: Running",
              `Installed Apps: ${installed.length}`,
              `Guild: ${interaction.guild?.name ?? ctx.guildId}`,
              "```"
            ].join("\n")
          })
        ]
      });
      return;
    }

    if (input === "os") {
      await ctx.reply({
        embeds: [
          ctx.ui.embed({
            title: "🖥️ ServerOS",
            description: "Use `/os` as the central control command for Desktop, App Store, Monitor, Logs and app opening."
          })
        ]
      });
      return;
    }

    if (input === "apps") {
      const installed = await ctx.installations.installedAppIds(ctx.guildId);
      const apps = installed.map((id) => ctx.registry.get(id)).filter(Boolean);
      await ctx.reply({
        embeds: [
          ctx.ui.embed({
            title: "📦 Installed Apps",
            description: apps.length
              ? apps.map((app) => `${app!.metadata.icon} ${app!.metadata.name}`).join("\n")
              : ctx.ui.empty("No apps installed.")
          })
        ]
      });
      return;
    }

    if (input.startsWith("open ")) {
      const appId = input.replace("open ", "").trim();
      const app = ctx.registry.get(appId);

      if (!app) {
        await ctx.reply({ content: `Unknown app: ${appId}`, ephemeral: true });
        return;
      }

      const installed = await ctx.installations.isInstalled(ctx.guildId, appId);
      if (!installed) {
        await ctx.reply({ content: `${app.metadata.name} is not installed.`, ephemeral: true });
        return;
      }

      await app.open(ctx.switchApp(app));
      return;
    }

    await ctx.reply({
      content: `Unknown terminal command: \`${input}\`. Try \`/terminal input:help\`.`,
      ephemeral: true
    });
  }
};

export default TerminalApp;
