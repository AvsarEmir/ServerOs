import { ButtonStyle, SlashCommandBuilder } from "discord.js";
import type { ServerOSApp } from "../../core/runtime/types.js";

type Note = {
  id: string;
  title: string;
  content: string;
  tags: string[];
  pinned: boolean;
  authorId: string;
  createdAt: string;
};

const STORAGE_KEY = "notes";

const NotesApp: ServerOSApp = {
  metadata: {
    id: "notes",
    name: "Notes",
    icon: "📝",
    version: "1.0.0",
    author: "ServerOS Contributors",
    description: "Create, search and pin notes inside your server.",
    category: "Productivity",
    permissions: ["storage:read", "storage:write", "ui:reply", "logs:write"],
  },

  commands: [
    new SlashCommandBuilder()
      .setName("note")
      .setDescription("Manage ServerOS notes.")
      .addSubcommand((sub) =>
        sub
          .setName("create")
          .setDescription("Create a note.")
          .addStringOption((option) => option.setName("title").setDescription("Note title").setRequired(true))
          .addStringOption((option) => option.setName("content").setDescription("Note content").setRequired(true))
          .addStringOption((option) => option.setName("tags").setDescription("Comma separated tags").setRequired(false))
      )
      .addSubcommand((sub) => sub.setName("list").setDescription("List notes."))
      .addSubcommand((sub) =>
        sub
          .setName("search")
          .setDescription("Search notes.")
          .addStringOption((option) => option.setName("query").setDescription("Search text").setRequired(true))
      )
  ],

  async install(ctx) {
    await ctx.storage.set<Note[]>(STORAGE_KEY, []);
  },

  async open(ctx) {
    const notes = await ctx.storage.get<Note[]>(STORAGE_KEY, []);
    const pinned = notes.filter((note) => note.pinned);
    const recent = notes.slice(-5).reverse();

    await ctx.reply({
      embeds: [
        ctx.ui.embed({
          title: "📝 Notes",
          description: "Your server notebook.",
          fields: [
            {
              name: "Pinned",
              value: pinned.length
                ? pinned.map((note) => `📌 **${note.title}** \`${note.id}\``).join("\n")
                : ctx.ui.empty("No pinned notes."),
              inline: false
            },
            {
              name: "Recent",
              value: recent.length
                ? recent.map((note) => `• **${note.title}** \`${note.id}\``).join("\n")
                : ctx.ui.empty("No notes yet. Use /note create."),
              inline: false
            }
          ]
        })
      ],
      components: [
        ctx.ui.row(
          ctx.ui.button({ id: "sos:notes:refresh", label: "Refresh", emoji: "🔄", style: ButtonStyle.Secondary })
        )
      ]
    });
  },

  async onCommand(ctx, interaction) {
    const subcommand = interaction.options.getSubcommand();
    const notes = await ctx.storage.get<Note[]>(STORAGE_KEY, []);

    if (subcommand === "create") {
      const title = interaction.options.getString("title", true);
      const content = interaction.options.getString("content", true);
      const tags = interaction.options
        .getString("tags")
        ?.split(",")
        .map((tag) => tag.trim())
        .filter(Boolean) ?? [];

      const note: Note = {
        id: ctx.ui.shortId(),
        title,
        content,
        tags,
        pinned: false,
        authorId: ctx.userId,
        createdAt: new Date().toISOString()
      };

      notes.push(note);
      await ctx.storage.set(STORAGE_KEY, notes);

      await ctx.reply({
        embeds: [
          ctx.ui.embed({
            title: "✅ Note Created",
            description: `**${note.title}**\n${note.content}`,
            footer: `ID: ${note.id}`
          })
        ],
        components: [
          ctx.ui.row(
            ctx.ui.button({ id: `sos:notes:pin:${note.id}`, label: "Pin", emoji: "📌", style: ButtonStyle.Primary })
          )
        ]
      });
      return;
    }

    if (subcommand === "list") {
      await this.open(ctx);
      return;
    }

    if (subcommand === "search") {
      const query = interaction.options.getString("query", true).toLowerCase();
      const results = notes.filter((note) =>
        [note.title, note.content, note.tags.join(" ")].join(" ").toLowerCase().includes(query)
      );

      await ctx.reply({
        embeds: [
          ctx.ui.embed({
            title: `🔎 Notes Search: ${query}`,
            description: results.length
              ? results.slice(0, 10).map((note) => `• **${note.title}** \`${note.id}\` — ${note.content.slice(0, 80)}`).join("\n")
              : ctx.ui.empty("No matching notes found.")
          })
        ]
      });
    }
  },

  async onButton(ctx, interaction) {
    const [, , action, noteId] = interaction.customId.split(":");

    if (action === "refresh") {
      await this.open(ctx);
      return;
    }

    if (action === "pin") {
      const notes = await ctx.storage.get<Note[]>(STORAGE_KEY, []);
      const note = notes.find((item) => item.id === noteId);
      if (!note) {
        await ctx.reply({ content: "Note not found.", ephemeral: true });
        return;
      }

      note.pinned = !note.pinned;
      await ctx.storage.set(STORAGE_KEY, notes);
      await interaction.update({
        content: note.pinned ? `📌 Pinned note: ${note.title}` : `Unpinned note: ${note.title}`,
        embeds: [],
        components: []
      });
    }
  }
};

export default NotesApp;
