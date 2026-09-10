import { ButtonStyle, SlashCommandBuilder } from "discord.js";
import type { ServerOSApp } from "../../core/runtime/types.js";

type VaultItem = {
  id: string;
  title: string;
  content: string;
  folder: string;
  tags: string[];
  authorId: string;
  createdAt: string;
  updatedAt: string;
};

const STORAGE_KEY = "vault-items";

function normalizeFolder(folder?: string | null): string {
  return folder?.trim().replace(/^\/+|\/+$/g, "") || "home";
}

function renderItems(items: VaultItem[]): string {
  if (!items.length) {
    return "_No saved items yet. Use /vault save to add links, decisions, docs or checklists._";
  }

  return items
    .slice(0, 12)
    .map((item) => `📄 **${item.title}** \`${item.id}\` — /${item.folder}`)
    .join("\n");
}

function renderFolders(items: VaultItem[]): string {
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item.folder, (counts.get(item.folder) ?? 0) + 1);
  }

  if (!counts.size) {
    return "_No folders yet._";
  }

  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, 12)
    .map(([folder, count]) => `📁 **/${folder}** — ${count} item${count === 1 ? "" : "s"}`)
    .join("\n");
}

const VaultApp: ServerOSApp = {
  metadata: {
    id: "vault",
    name: "Vault",
    icon: "📁",
    version: "1.0.0",
    author: "ServerOS Contributors",
    description: "A friendly server file cabinet for links, decisions, docs and checklists.",
    category: "Knowledge",
    permissions: ["storage:read", "storage:write", "ui:reply", "logs:write"]
  },

  commands: [
    new SlashCommandBuilder()
      .setName("vault")
      .setDescription("Manage the ServerOS Vault.")
      .addSubcommand((sub) =>
        sub
          .setName("save")
          .setDescription("Save an item into the Vault.")
          .addStringOption((option) => option.setName("title").setDescription("Item title").setRequired(true))
          .addStringOption((option) => option.setName("content").setDescription("Link, note, decision or checklist content").setRequired(true))
          .addStringOption((option) => option.setName("folder").setDescription("Friendly folder, such as projects/gamerplus").setRequired(false))
          .addStringOption((option) => option.setName("tags").setDescription("Comma separated tags").setRequired(false))
      )
      .addSubcommand((sub) =>
        sub
          .setName("list")
          .setDescription("List Vault items.")
          .addStringOption((option) => option.setName("folder").setDescription("Optional folder filter").setRequired(false))
      )
      .addSubcommand((sub) =>
        sub
          .setName("open")
          .setDescription("Open a Vault item.")
          .addStringOption((option) => option.setName("id").setDescription("Vault item ID").setRequired(true))
      )
      .addSubcommand((sub) =>
        sub
          .setName("search")
          .setDescription("Search the Vault.")
          .addStringOption((option) => option.setName("query").setDescription("Search text").setRequired(true))
      )
  ],

  async install(ctx) {
    await ctx.storage.set<VaultItem[]>(STORAGE_KEY, []);
  },

  async open(ctx) {
    const items = await ctx.storage.get<VaultItem[]>(STORAGE_KEY, []);
    const recent = [...items]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 8);

    await ctx.reply({
      embeds: [
        ctx.ui.embed({
          title: "📁 Vault",
          description: "A friendly file cabinet for your Discord server. Save important links, decisions, brand rules, API notes and release checklists into simple folders.",
          fields: [
            { name: "Folders", value: renderFolders(items), inline: false },
            { name: "Recent Items", value: renderItems(recent), inline: false }
          ],
          footer: "Use /vault save or /os action:open app:vault"
        })
      ],
      components: [
        ctx.ui.row(
          ctx.ui.button({ id: "sos:vault:refresh", label: "Refresh", emoji: "🔄", style: ButtonStyle.Secondary })
        )
      ]
    });
  },

  async onCommand(ctx, interaction) {
    const subcommand = interaction.options.getSubcommand();
    const items = await ctx.storage.get<VaultItem[]>(STORAGE_KEY, []);

    if (subcommand === "save") {
      const tags = interaction.options
        .getString("tags")
        ?.split(",")
        .map((tag) => tag.trim())
        .filter(Boolean) ?? [];

      const item: VaultItem = {
        id: ctx.ui.shortId(),
        title: interaction.options.getString("title", true),
        content: interaction.options.getString("content", true),
        folder: normalizeFolder(interaction.options.getString("folder")),
        tags,
        authorId: ctx.userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      items.push(item);
      await ctx.storage.set(STORAGE_KEY, items);

      await ctx.reply({
        embeds: [
          ctx.ui.embed({
            title: "📁 Vault Item Saved",
            description: `**${item.title}** saved to **/${item.folder}**.`,
            footer: `ID: ${item.id}`
          })
        ]
      });
      return;
    }

    if (subcommand === "list") {
      const folder = interaction.options.getString("folder");
      const normalized = folder ? normalizeFolder(folder) : null;
      const filtered = normalized ? items.filter((item) => item.folder === normalized) : items;

      await ctx.reply({
        embeds: [
          ctx.ui.embed({
            title: normalized ? `📁 Vault — /${normalized}` : "📁 Vault Items",
            description: renderItems(filtered)
          })
        ]
      });
      return;
    }

    if (subcommand === "open") {
      const id = interaction.options.getString("id", true);
      const item = items.find((entry) => entry.id === id);

      if (!item) {
        await ctx.reply({ content: "Vault item not found.", ephemeral: true });
        return;
      }

      await ctx.reply({
        embeds: [
          ctx.ui.embed({
            title: `📄 ${item.title}`,
            description: item.content,
            fields: [
              { name: "Folder", value: `/${item.folder}`, inline: true },
              { name: "Tags", value: item.tags.length ? item.tags.join(", ") : "_No tags_", inline: true }
            ],
            footer: `ID: ${item.id}`
          })
        ]
      });
      return;
    }

    if (subcommand === "search") {
      const query = interaction.options.getString("query", true).toLowerCase();
      const results = items.filter((item) =>
        [item.title, item.content, item.folder, item.tags.join(" ")].join(" ").toLowerCase().includes(query)
      );

      await ctx.reply({
        embeds: [
          ctx.ui.embed({
            title: `🔎 Vault Search: ${query}`,
            description: renderItems(results)
          })
        ]
      });
    }
  },

  async onButton(ctx, interaction) {
    const [, , action] = interaction.customId.split(":");

    if (action === "refresh") {
      await this.open(ctx);
    }
  }
};

export default VaultApp;
