export type AppTemplateId = "simple" | "crud" | "dashboard" | "moderation";

export interface AppTemplateDefinition {
  id: AppTemplateId;
  name: string;
  description: string;
  appDescription: string;
  category: string;
  icon: string;
  permissions: string[];
  files(app: { appId: string; appName: string; className: string; commandName: string; author: string }): Record<string, string>;
}

function sdkImport() {
  return `import { SlashCommandBuilder } from "discord.js";\nimport { createApp } from "../../core/sdk/index.js";\n`;
}

function appTest(appId: string, appName: string, commandName: string) {
  return `import assert from "node:assert/strict";
import test from "node:test";
import app from "./index.js";

test("${appName} exposes a valid runtime contract", () => {
  assert.equal(app.metadata.id, "${appId}");
  assert.equal(app.metadata.name, "${appName}");
  assert.equal(app.metadata.version, "1.0.0");
  assert.equal(app.commands?.some((command) => command.toJSON().name === "${commandName}"), true);
  assert.equal(typeof app.open, "function");
});
`;
}

export const APP_TEMPLATES: AppTemplateDefinition[] = [
  {
    id: "simple",
    name: "Simple App",
    description: "Single-screen app with one slash command.",
    appDescription: "A custom ServerOS app.",
    category: "Custom",
    icon: "🧩",
    permissions: ["ui:reply"],
    files({ appId, appName, className, commandName, author }) {
      return {
        "index.ts": `${sdkImport()}

const ${className}App = createApp({
  metadata: {
    id: "${appId}",
    name: "${appName}",
    icon: "🧩",
    version: "1.0.0",
    author: "${author}",
    description: "A custom ServerOS app.",
    category: "Custom",
    template: "simple",
    permissions: ["ui:reply"]
  },

  commands: [
    new SlashCommandBuilder()
      .setName("${commandName}")
      .setDescription("Open ${appName}.")
  ],

  screens: {
    home: async (ctx) => ctx.ui.screen({
      app: "${appName}",
      screen: "Home",
      title: "🧩 ${appName}",
      description: "Hello from your custom ServerOS app.",
      footer: "Generated from the simple template"
    })
  },

  async onCommand(ctx) {
    await ctx.app.open(ctx);
  }
});

export default ${className}App;
`,
        "app.test.ts": appTest(appId, appName, commandName),
        "README.md": `# ${appName}\n\nGenerated from the **simple** ServerOS app template.\n\n## Command\n\n- /${commandName}\n`
      };
    }
  },
  {
    id: "crud",
    name: "CRUD App",
    description: "Create/list/delete style app backed by app storage.",
    appDescription: "A storage-backed ServerOS CRUD app.",
    category: "Productivity",
    icon: "🗂️",
    permissions: ["storage:read", "storage:write", "ui:reply"],
    files({ appId, appName, className, commandName, author }) {
      return {
        "index.ts": `${sdkImport()}

type Item = { id: string; title: string; createdAt: string };

const ${className}App = createApp({
  metadata: {
    id: "${appId}",
    name: "${appName}",
    icon: "🗂️",
    version: "1.0.0",
    author: "${author}",
    description: "A storage-backed ServerOS CRUD app.",
    category: "Productivity",
    template: "crud",
    permissions: ["storage:read", "storage:write", "ui:reply"]
  },

  commands: [
    new SlashCommandBuilder()
      .setName("${commandName}")
      .setDescription("Manage ${appName} items.")
      .addSubcommand((subcommand) =>
        subcommand
          .setName("add")
          .setDescription("Add an item.")
          .addStringOption((option) => option.setName("title").setDescription("Item title").setRequired(true))
      )
      .addSubcommand((subcommand) => subcommand.setName("list").setDescription("List items."))
      .addSubcommand((subcommand) =>
        subcommand
          .setName("delete")
          .setDescription("Delete an item by id.")
          .addStringOption((option) => option.setName("id").setDescription("Item id").setRequired(true))
      )
  ],

  async install(ctx) {
    await ctx.storage.set("items", []);
  },

  screens: {
    home: async (ctx) => {
      const items = (await ctx.storage.get<Item[]>("items", []));
      return ctx.ui.screen({
        app: "${appName}",
        screen: "Items",
        title: "🗂️ ${appName}",
        description: items.length ? items.map((item) => "• " + item.id + " — " + item.title).join("\\n") : "No items yet.",
        footer: "Generated from the CRUD template"
      });
    }
  },

  async onCommand(ctx, interaction) {
    const subcommand = interaction.options.getSubcommand();
    const items = (await ctx.storage.get<Item[]>("items", []));

    if (subcommand === "add") {
      const title = interaction.options.getString("title", true);
      const item = { id: ctx.ui.shortId(), title, createdAt: new Date().toISOString() };
      await ctx.storage.set("items", [item, ...items]);
      await ctx.reply({ content: "✅ Added: " + item.title + " (" + item.id + ")" });
      return;
    }

    if (subcommand === "delete") {
      const id = interaction.options.getString("id", true);
      await ctx.storage.set("items", items.filter((item) => item.id !== id));
      await ctx.reply({ content: "🗑️ Deleted item: " + id });
      return;
    }

    await ctx.app.open(ctx);
  }
});

export default ${className}App;
`,
        "app.test.ts": appTest(appId, appName, commandName),
        "README.md": `# ${appName}\n\nGenerated from the **CRUD** ServerOS app template.\n\n## Commands\n\n- /${commandName} add\n- /${commandName} list\n- /${commandName} delete\n`
      };
    }
  },
  {
    id: "dashboard",
    name: "Dashboard App",
    description: "Read-only dashboard app for metrics and widgets.",
    appDescription: "A ServerOS dashboard app.",
    category: "Analytics",
    icon: "📊",
    permissions: ["storage:read", "ui:reply"],
    files({ appId, appName, className, commandName, author }) {
      return {
        "index.ts": `${sdkImport()}

const ${className}App = createApp({
  metadata: {
    id: "${appId}",
    name: "${appName}",
    icon: "📊",
    version: "1.0.0",
    author: "${author}",
    description: "A ServerOS dashboard app.",
    category: "Analytics",
    template: "dashboard",
    permissions: ["storage:read", "ui:reply"]
  },

  commands: [
    new SlashCommandBuilder()
      .setName("${commandName}")
      .setDescription("Open the ${appName} dashboard.")
  ],

  screens: {
    home: async (ctx) => ctx.ui.screen({
      app: "${appName}",
      screen: "Dashboard",
      title: "📊 ${appName}",
      description: "Your dashboard is ready.",
      fields: [
        { name: "Widget 1", value: "Replace this with your first metric.", inline: true },
        { name: "Widget 2", value: "Replace this with your second metric.", inline: true },
        { name: "Widget 3", value: "Replace this with your third metric.", inline: true }
      ],
      footer: "Generated from the dashboard template"
    })
  },

  async onCommand(ctx) {
    await ctx.app.open(ctx);
  }
});

export default ${className}App;
`,
        "app.test.ts": appTest(appId, appName, commandName),
        "README.md": `# ${appName}\n\nGenerated from the **dashboard** ServerOS app template.\n`
      };
    }
  },
  {
    id: "moderation",
    name: "Moderation Tools App",
    description: "Moderation-style command template with report/case workflow.",
    appDescription: "A moderation workflow app template for ServerOS.",
    category: "Moderation",
    icon: "🛡️",
    permissions: ["storage:read", "storage:write", "ui:reply", "moderation:case:create"],
    files({ appId, appName, className, commandName, author }) {
      return {
        "index.ts": `${sdkImport()}

type CaseItem = { id: string; type: string; targetId: string; reason: string; createdAt: string; createdBy: string };

const ${className}App = createApp({
  metadata: {
    id: "${appId}",
    name: "${appName}",
    icon: "🛡️",
    version: "1.0.0",
    author: "${author}",
    description: "A moderation workflow app template for ServerOS.",
    category: "Moderation",
    template: "moderation",
    permissions: ["storage:read", "storage:write", "ui:reply", "moderation:case:create"]
  },

  commands: [
    new SlashCommandBuilder()
      .setName("${commandName}")
      .setDescription("Open moderation tools.")
      .addSubcommand((subcommand) =>
        subcommand
          .setName("report")
          .setDescription("Create a report/case.")
          .addUserOption((option) => option.setName("user").setDescription("Reported user").setRequired(true))
          .addStringOption((option) => option.setName("reason").setDescription("Reason").setRequired(true))
      )
      .addSubcommand((subcommand) => subcommand.setName("cases").setDescription("List recent cases."))
      .addSubcommand((subcommand) => subcommand.setName("panel").setDescription("Open the moderation panel."))
  ],

  async install(ctx) {
    await ctx.storage.set("cases", []);
  },

  screens: {
    home: async (ctx) => {
      const cases = (await ctx.storage.get<CaseItem[]>("cases", []));
      return ctx.ui.screen({
        app: "${appName}",
        screen: "Moderation Panel",
        title: "🛡️ ${appName}",
        description: cases.length
          ? cases.slice(0, 8).map((item) => "• " + item.id + " — <@" + item.targetId + "> — " + item.reason).join("\\n")
          : "No moderation cases yet.",
        footer: "Generated from the moderation template"
      });
    }
  },

  async onCommand(ctx, interaction) {
    const subcommand = interaction.options.getSubcommand();
    const cases = (await ctx.storage.get<CaseItem[]>("cases", []));

    if (subcommand === "report") {
      const user = interaction.options.getUser("user", true);
      const reason = interaction.options.getString("reason", true);
      const item: CaseItem = {
        id: ctx.ui.shortId(),
        type: "report",
        targetId: user.id,
        reason,
        createdAt: new Date().toISOString(),
        createdBy: ctx.userId
      };

      await ctx.storage.set("cases", [item, ...cases]);
      await ctx.reply({ content: "🛡️ Case created: " + item.id + " for " + user.toString() + " — " + reason });
      return;
    }

    await ctx.app.open(ctx);
  }
});

export default ${className}App;
`,
        "app.test.ts": appTest(appId, appName, commandName),
        "README.md": `# ${appName}\n\nGenerated from the **moderation** ServerOS app template.\n\nThis is a moderation-style workflow starter. It creates reports/cases, but does not ban, kick or mute users by default.\n\n## Commands\n\n- /${commandName} report\n- /${commandName} cases\n- /${commandName} panel\n`
      };
    }
  }
];

export function getTemplate(id: string | undefined): AppTemplateDefinition | undefined {
  return APP_TEMPLATES.find((template) => template.id === id);
}
