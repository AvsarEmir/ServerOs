import { SlashCommandBuilder } from "discord.js";
import type { ServerOSApp } from "../../core/runtime/types.js";

type TaskStatus = "todo" | "in-progress" | "done";

type Task = {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: "low" | "normal" | "high";
  assigneeId?: string;
  authorId: string;
  createdAt: string;
  completedAt?: string;
};

const STORAGE_KEY = "tasks";

function renderTasks(tasks: Task[]): string {
  if (!tasks.length) {
    return "_No tasks yet. Use /task create._";
  }

  return tasks
    .slice(0, 15)
    .map((task) => {
      const icon = task.status === "done" ? "✅" : task.status === "in-progress" ? "🔵" : "🟡";
      const assignee = task.assigneeId ? ` <@${task.assigneeId}>` : "";
      return `${icon} **${task.title}** \`${task.id}\`${assignee}`;
    })
    .join("\n");
}

const TasksApp: ServerOSApp = {
  metadata: {
    id: "tasks",
    name: "Tasks",
    icon: "✅",
    version: "1.0.0",
    author: "ServerOS Contributors",
    description: "A lightweight task manager for your Discord workspace.",
    category: "Project Management",
    permissions: ["storage:read", "storage:write", "ui:reply", "logs:write"],
  },

  commands: [
    new SlashCommandBuilder()
      .setName("task")
      .setDescription("Manage ServerOS tasks.")
      .addSubcommand((sub) =>
        sub
          .setName("create")
          .setDescription("Create a task.")
          .addStringOption((option) => option.setName("title").setDescription("Task title").setRequired(true))
          .addStringOption((option) => option.setName("description").setDescription("Task description").setRequired(false))
          .addUserOption((option) => option.setName("assignee").setDescription("Assign to a member").setRequired(false))
          .addStringOption((option) =>
            option
              .setName("priority")
              .setDescription("Task priority")
              .setRequired(false)
              .addChoices(
                { name: "Low", value: "low" },
                { name: "Normal", value: "normal" },
                { name: "High", value: "high" }
              )
          )
      )
      .addSubcommand((sub) => sub.setName("list").setDescription("List tasks."))
      .addSubcommand((sub) =>
        sub
          .setName("done")
          .setDescription("Mark a task as done.")
          .addStringOption((option) => option.setName("id").setDescription("Task ID").setRequired(true))
      )
      .addSubcommand((sub) =>
        sub
          .setName("start")
          .setDescription("Move a task to in-progress.")
          .addStringOption((option) => option.setName("id").setDescription("Task ID").setRequired(true))
      )
  ],

  async install(ctx) {
    await ctx.storage.set<Task[]>(STORAGE_KEY, []);
  },

  async open(ctx) {
    const tasks = await ctx.storage.get<Task[]>(STORAGE_KEY, []);
    const todo = tasks.filter((task) => task.status === "todo");
    const progress = tasks.filter((task) => task.status === "in-progress");
    const done = tasks.filter((task) => task.status === "done").slice(-5).reverse();

    await ctx.reply({
      embeds: [
        ctx.ui.embed({
          title: "✅ Tasks",
          description: "Your server task manager.",
          fields: [
            { name: "🟡 To Do", value: renderTasks(todo), inline: false },
            { name: "🔵 In Progress", value: renderTasks(progress), inline: false },
            { name: "✅ Recently Done", value: renderTasks(done), inline: false }
          ]
        })
      ]
    });
  },

  async onCommand(ctx, interaction) {
    const subcommand = interaction.options.getSubcommand();
    const tasks = await ctx.storage.get<Task[]>(STORAGE_KEY, []);

    if (subcommand === "create") {
      const task: Task = {
        id: ctx.ui.shortId(),
        title: interaction.options.getString("title", true),
        description: interaction.options.getString("description") ?? undefined,
        assigneeId: interaction.options.getUser("assignee")?.id,
        priority: (interaction.options.getString("priority") as Task["priority"] | null) ?? "normal",
        status: "todo",
        authorId: ctx.userId,
        createdAt: new Date().toISOString()
      };

      tasks.push(task);
      await ctx.storage.set(STORAGE_KEY, tasks);

      await ctx.reply({
        embeds: [
          ctx.ui.embed({
            title: "✅ Task Created",
            description: `**${task.title}**\n${task.description ?? ""}`,
            footer: `ID: ${task.id}`
          })
        ]
      });
      return;
    }

    if (subcommand === "list") {
      await this.open(ctx);
      return;
    }

    if (subcommand === "done" || subcommand === "start") {
      const id = interaction.options.getString("id", true);
      const task = tasks.find((item) => item.id === id);

      if (!task) {
        await ctx.reply({ content: "Task not found.", ephemeral: true });
        return;
      }

      task.status = subcommand === "done" ? "done" : "in-progress";
      task.completedAt = subcommand === "done" ? new Date().toISOString() : undefined;
      await ctx.storage.set(STORAGE_KEY, tasks);

      await ctx.reply({
        embeds: [
          ctx.ui.embed({
            title: subcommand === "done" ? "✅ Task Completed" : "🔵 Task Started",
            description: `**${task.title}** \`${task.id}\``
          })
        ]
      });
    }
  }
};

export default TasksApp;
