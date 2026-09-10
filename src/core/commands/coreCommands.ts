import { SlashCommandBuilder } from "discord.js";

export const coreCommands = [
  new SlashCommandBuilder()
    .setName("os")
    .setDescription("Control ServerOS from one command.")
    .addStringOption((option) =>
      option
        .setName("action")
        .setDescription("What should ServerOS do?")
        .setRequired(false)
        .addChoices(
          { name: "Desktop", value: "desktop" },
          { name: "App Store", value: "apps" },
          { name: "Open App", value: "open" },
          { name: "Install App", value: "install" },
          { name: "Disable App", value: "uninstall" },
          { name: "Repair App", value: "repair" },
          { name: "Monitor", value: "monitor" },
          { name: "Logs", value: "logs" },
          { name: "Settings", value: "settings" },
          { name: "Terminal", value: "terminal" }
        )
    )
    .addStringOption((option) =>
      option
        .setName("app")
        .setDescription("App id, such as notes, tasks or vault.")
        .setRequired(false)
        .setAutocomplete(true)
    )
    .addStringOption((option) =>
      option
        .setName("input")
        .setDescription("Optional input for actions such as terminal.")
        .setRequired(false)
    )
    .addIntegerOption((option) =>
      option
        .setName("threshold")
        .setDescription("Consecutive app crashes before automatic disable.")
        .setMinValue(1)
        .setMaxValue(20)
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("apps")
    .setDescription("Open the ServerOS App Store."),

  new SlashCommandBuilder()
    .setName("monitor")
    .setDescription("Open the ServerOS system monitor."),

  new SlashCommandBuilder()
    .setName("logs")
    .setDescription("View recent ServerOS logs.")
    .addStringOption((option) =>
      option
        .setName("app")
        .setDescription("Optional app id to filter logs, such as notes or tasks.")
        .setRequired(false)
        .setAutocomplete(true)
    )
];
