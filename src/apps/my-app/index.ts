import { SlashCommandBuilder } from "discord.js";
import type { ServerOSApp } from "../../core/runtime/types.js";

const MyAppApp: ServerOSApp = {
  metadata: {
    id: "my-app",
    name: "My App",
    icon: "🧩",
    version: "1.0.0",
    author: "ServerOS Contributors",
    description: "A custom ServerOS app.",
    category: "Custom",
    template: "simple",
    permissions: ["storage:read", "storage:write", "ui:reply"]
  },

  commands: [
    new SlashCommandBuilder()
      .setName("myapp")
      .setDescription("Open My App.")
  ],

  async install(ctx) {
    await ctx.storage.set("settings", { installedAt: new Date().toISOString() });
  },

  async open(ctx) {
    await ctx.reply({
      embeds: [
        ctx.ui.embed({
          title: "🧩 My App",
          description: "Hello from your custom ServerOS app.",
          footer: "Loaded through ServerOS App Runtime"
        })
      ]
    });
  },

  async onCommand(ctx) {
    await this.open(ctx);
  }
};

export default MyAppApp;
