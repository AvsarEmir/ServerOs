import type {
  AutocompleteInteraction,
  ButtonInteraction,
  ChatInputCommandInteraction,
  Client,
  Interaction
} from "discord.js";
import type { PrismaClient } from "@prisma/client";
import type { AppRegistry } from "../runtime/AppRegistry.js";
import { createAppContext, createCoreContext } from "../context/createContext.js";
import { AppInstallations } from "../system/AppInstallations.js";
import { AppLogger } from "../system/AppLogger.js";
import { AppHealth } from "../system/AppHealth.js";
import { CommandSyncer } from "../system/CommandSyncer.js";
import { RuntimeSettings } from "../system/RuntimeSettings.js";
import { showDesktop } from "../commands/desktop.js";
import { handleAppStoreButton, showAppStore } from "../commands/appStore.js";
import { showSystemLogs, showSystemMonitor } from "../commands/systemMonitor.js";
import { env } from "../utils/env.js";

export class InteractionRouter {
  private installations: AppInstallations;
  private logger: AppLogger;
  private health: AppHealth;
  private commandSyncer: CommandSyncer;
  private settings: RuntimeSettings;

  constructor(
    private client: Client,
    private prisma: PrismaClient,
    private registry: AppRegistry
  ) {
    this.installations = new AppInstallations(prisma, registry);
    this.logger = new AppLogger(prisma);
    this.health = new AppHealth(prisma);
    this.commandSyncer = new CommandSyncer(registry, this.installations);
    this.settings = new RuntimeSettings(prisma, env.appCrashThreshold);
  }

  async syncGuildCommands(guildIds: Iterable<string>) {
    return this.commandSyncer.syncGuilds(guildIds);
  }

  async handle(interaction: Interaction): Promise<void> {
    try {
      if (!interaction.inGuild()) {
        if (interaction.isRepliable()) {
          await interaction.reply({ content: "ServerOS only works inside Discord servers.", ephemeral: true });
        }
        return;
      }

      if (interaction.isAutocomplete()) {
        await this.handleAutocomplete(interaction);
        return;
      }

      if (interaction.isChatInputCommand()) {
        await this.handleCommand(interaction);
        return;
      }

      if (interaction.isButton()) {
        await this.handleButton(interaction);
      }
    } catch (error) {
      await this.logger.error("Unhandled interaction failure", error);
      if (interaction.isAutocomplete()) {
        await interaction.respond([]).catch(() => undefined);
        return;
      }
      if (interaction.isChatInputCommand() || interaction.isButton()) {
        await this.safeErrorReply(interaction, "ServerOS could not complete this action, but the bot is still running.");
      }
    }
  }

  private async handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const coreCtx = createCoreContext({
      client: this.client,
      prisma: this.prisma,
      registry: this.registry,
      installations: this.installations,
      interaction
    });

    await this.installations.ensureGuild(interaction.guildId!, interaction.guild?.name);

    if (interaction.commandName === "os") {
      await this.handleOsCommand(interaction, coreCtx);
      return;
    }

    if (interaction.commandName === "apps") {
      await showAppStore(coreCtx);
      return;
    }

    if (interaction.commandName === "monitor") {
      await showSystemMonitor(coreCtx);
      return;
    }

    if (interaction.commandName === "logs") {
      const appId = interaction.options.getString("app");
      await showSystemLogs(coreCtx, appId);
      return;
    }

    const app = this.registry.getByCommand(interaction.commandName);
    if (!app) {
      await interaction.reply({ content: "Unknown ServerOS command.", ephemeral: true });
      return;
    }

    const installed = await this.installations.isInstalled(interaction.guildId!, app.metadata.id);
    if (!installed && !app.metadata.system) {
      await interaction.reply({
        content: `${app.metadata.icon} **${app.metadata.name}** is not installed. Open /os action:apps to install it.`,
        ephemeral: true
      });
      await this.commandSyncer.syncGuild(interaction.guildId!).catch((error) => this.logger.error("Command sync failed", error));
      return;
    }

    const appCtx = createAppContext({
      app,
      client: this.client,
      prisma: this.prisma,
      registry: this.registry,
      installations: this.installations,
      interaction
    });

    await this.withAppBoundary(app.metadata.id, interaction, async () => {
      if (app.onCommand) {
        await app.onCommand(appCtx, interaction);
      } else {
        await app.open(appCtx);
      }
    });
  }

  private async handleOsCommand(interaction: ChatInputCommandInteraction, coreCtx: ReturnType<typeof createCoreContext>): Promise<void> {
    const action = interaction.options.getString("action") ?? "desktop";
    const appId = interaction.options.getString("app") ?? undefined;

    if (action === "desktop") {
      await showDesktop(coreCtx);
      return;
    }

    if (action === "apps") {
      await showAppStore(coreCtx);
      return;
    }

    if (action === "monitor") {
      await showSystemMonitor(coreCtx);
      return;
    }

    if (action === "logs") {
      await showSystemLogs(coreCtx, appId);
      return;
    }

    if (action === "settings") {
      if (!(await coreCtx.permissions.require("system:manage"))) {
        return;
      }

      const requestedThreshold = interaction.options.getInteger("threshold");
      const crashThreshold = requestedThreshold === null
        ? await this.settings.crashThreshold(interaction.guildId!)
        : await this.settings.setCrashThreshold(interaction.guildId!, requestedThreshold);

      await interaction.reply({
        embeds: [
          coreCtx.ui.embed({
            title: "⚙️ ServerOS Settings",
            description: requestedThreshold === null ? "Current runtime safety settings." : "Runtime safety settings updated.",
            fields: [
              { name: "Crash Threshold", value: `${crashThreshold} consecutive crashes`, inline: true },
              { name: "Safe Mode", value: env.safeMode ? "Enabled" : "Disabled", inline: true }
            ],
            footer: "Use /os action:settings threshold:<1-20> to update the threshold."
          })
        ],
        ephemeral: true
      });
      return;
    }

    if (action === "terminal") {
      const terminal = this.registry.get("terminal");
      if (!terminal) {
        await interaction.reply({ content: "Terminal app is missing from the registry.", ephemeral: true });
        return;
      }

      const terminalCtx = createAppContext({
        app: terminal,
        client: this.client,
        prisma: this.prisma,
        registry: this.registry,
        installations: this.installations,
        interaction
      });

      await this.withAppBoundary("terminal", interaction, async () => {
        if (terminal.onCommand) {
          await terminal.onCommand(terminalCtx, interaction);
        } else {
          await terminal.open(terminalCtx);
        }
      });
      return;
    }

    if (!appId) {
      await interaction.reply({ content: `Choose an app for /os action:${action}.`, ephemeral: true });
      return;
    }

    const app = this.registry.get(appId);
    if (!app) {
      await interaction.reply({ content: `Unknown app: ${appId}`, ephemeral: true });
      return;
    }

    if (action === "install") {
      await handleAppStoreButton(
        coreCtx,
        "install",
        appId,
        this.commandSyncer,
        (targetAppId, actionToRun) => this.withAppBoundary(targetAppId, interaction, actionToRun)
      );
      return;
    }

    if (action === "uninstall") {
      await handleAppStoreButton(
        coreCtx,
        "uninstall",
        appId,
        this.commandSyncer,
        (targetAppId, actionToRun) => this.withAppBoundary(targetAppId, interaction, actionToRun)
      );
      return;
    }

    if (action === "repair") {
      await handleAppStoreButton(
        coreCtx,
        "repair",
        appId,
        this.commandSyncer,
        (targetAppId, actionToRun) => this.withAppBoundary(targetAppId, interaction, actionToRun)
      );
      return;
    }

    if (action === "open") {
      if (!(await coreCtx.permissions.require("apps:open"))) {
        return;
      }

      const installed = await this.installations.isInstalled(interaction.guildId!, appId);
      if (!installed && !app.metadata.system) {
        await interaction.reply({ content: `${app.metadata.name} is not installed. Use /os action:install app:${appId}.`, ephemeral: true });
        return;
      }

      const appCtx = createAppContext({
        app,
        client: this.client,
        prisma: this.prisma,
        registry: this.registry,
        installations: this.installations,
        interaction
      });

      await this.withAppBoundary(appId, interaction, async () => {
        await app.open(appCtx);
      });
      return;
    }

    await interaction.reply({ content: `Unknown /os action: ${action}`, ephemeral: true });
  }

  private async handleButton(interaction: ButtonInteraction): Promise<void> {
    const parts = interaction.customId.split(":");

    if (parts[0] !== "sos") {
      return;
    }

    const coreCtx = createCoreContext({
      client: this.client,
      prisma: this.prisma,
      registry: this.registry,
      installations: this.installations,
      interaction
    });

    if (parts[1] === "core" && parts[2] === "apps") {
      await showAppStore(coreCtx);
      return;
    }

    if (parts[1] === "core" && parts[2] === "refresh-desktop") {
      await showDesktop(coreCtx);
      return;
    }

    if (parts[1] === "core" && parts[2] === "refresh-monitor") {
      await showSystemMonitor(coreCtx);
      return;
    }

    if (parts[1] === "core" && parts[2] === "open") {
      const appId = parts[3];
      const app = this.registry.get(appId);
      if (!app) {
        await interaction.reply({ content: "Unknown app button.", ephemeral: true });
        return;
      }

      const installed = await this.installations.isInstalled(interaction.guildId!, appId);
      if (!installed && !app.metadata.system) {
        await interaction.reply({ content: "This app is not installed.", ephemeral: true });
        return;
      }

      const appCtx = createAppContext({
        app,
        client: this.client,
        prisma: this.prisma,
        registry: this.registry,
        installations: this.installations,
        interaction
      });

      await this.withAppBoundary(appId, interaction, async () => {
        await app.open(appCtx);
      });
      return;
    }

    if (parts[1] === "apps") {
      const action = parts[2];
      const appId = parts[3];
      await this.withCoreBoundary(interaction, async () => {
        await handleAppStoreButton(
          coreCtx,
          action,
          appId,
          this.commandSyncer,
          (targetAppId, actionToRun) => this.withAppBoundary(targetAppId, interaction, actionToRun)
        );
      });
      return;
    }

    const appId = parts[1];
    const app = this.registry.get(appId);
    if (!app) {
      await interaction.reply({ content: "Unknown app button.", ephemeral: true });
      return;
    }

    const installed = await this.installations.isInstalled(interaction.guildId!, appId);
    if (!installed && !app.metadata.system) {
      await interaction.reply({ content: "This app is not installed.", ephemeral: true });
      await this.commandSyncer.syncGuild(interaction.guildId!).catch((error) => this.logger.error("Command sync failed", error));
      return;
    }

    const appCtx = createAppContext({
      app,
      client: this.client,
      prisma: this.prisma,
      registry: this.registry,
      installations: this.installations,
      interaction
    });

    await this.withAppBoundary(appId, interaction, async () => {
      if (!app.onButton) {
        await interaction.reply({ content: "This app button has no handler.", ephemeral: true });
        return;
      }
      await app.onButton(appCtx, interaction);
    });
  }

  private async handleAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
    try {
      if (interaction.commandName !== "os" && interaction.commandName !== "logs") {
        await interaction.respond([]);
        return;
      }

      const focused = interaction.options.getFocused(true);
      if (focused.name !== "app") {
        await interaction.respond([]);
        return;
      }

      await this.installations.ensureGuild(interaction.guildId!, interaction.guild?.name);
      const action = interaction.commandName === "logs" ? "logs" : interaction.options.getString("action") ?? "open";
      const installedIds = await this.installations.installedAppIds(interaction.guildId!);
      const installed = new Set(installedIds);
      const installationHistory = action === "repair"
        ? new Set(await this.installations.installationAppIds(interaction.guildId!))
        : new Set<string>();

      const apps = this.registry.all().filter((app) => {
        if (action === "install") {
          return !app.metadata.system && !installed.has(app.metadata.id);
        }

        if (action === "repair") {
          return !app.metadata.system && installationHistory.has(app.metadata.id);
        }

        if (["open", "uninstall", "logs", "terminal"].includes(action)) {
          return app.metadata.system || installed.has(app.metadata.id);
        }

        return true;
      });

      const query = String(focused.value ?? "").toLowerCase();
      const choices = apps
        .filter((app) => [app.metadata.id, app.metadata.name].join(" ").toLowerCase().includes(query))
        .slice(0, 25)
        .map((app) => ({
          name: `${app.metadata.icon} ${app.metadata.name} (${app.metadata.id})`.slice(0, 100),
          value: app.metadata.id
        }));

      await interaction.respond(choices);
    } catch {
      await interaction.respond([]).catch(() => undefined);
    }
  }

  private async withCoreBoundary(interaction: ChatInputCommandInteraction | ButtonInteraction, action: () => Promise<void>): Promise<void> {
    try {
      await action();
    } catch (error) {
      await this.logger.error("Core interaction failed", error);
      await this.safeErrorReply(interaction, "ServerOS core failed, but the bot is still running.");
    }
  }

  private async withAppBoundary(appId: string, interaction: ChatInputCommandInteraction | ButtonInteraction, action: () => Promise<void>): Promise<void> {
    const guildId = interaction.guildId;
    const appLogger = this.logger.child(appId, guildId ?? undefined);

    if (guildId) {
      await this.health.markRunning(guildId, appId).catch((error) => appLogger.error("App health could not be marked as running", error));
    }

    try {
      await action();
    } catch (error) {
      let crashCount: number | undefined;
      if (guildId) {
        try {
          crashCount = await this.health.markCrashed(guildId, appId, error);
        } catch (healthError) {
          await appLogger.error("App crash state could not be persisted", healthError);
        }
      }

      await appLogger.error("App crashed", error);

      let disabledAppIds: string[] = [];
      const app = this.registry.get(appId);
      const crashThreshold = guildId
        ? await this.settings.crashThreshold(guildId).catch(() => env.appCrashThreshold)
        : env.appCrashThreshold;
      if (guildId && crashCount !== undefined && crashCount >= crashThreshold && app && !app.metadata.system) {
        try {
          disabledAppIds = await this.installations.disableForSafety(guildId, appId);
          for (const disabledAppId of disabledAppIds) {
            await this.health.markDisabled(guildId, disabledAppId);
          }
          if (disabledAppIds.length) {
            await this.commandSyncer.syncGuild(guildId);
            await appLogger.warn("App automatically disabled after repeated crashes", {
              crashCount,
              affectedApps: disabledAppIds
            });
          }
        } catch (disableError) {
          await appLogger.error("App could not be automatically disabled", disableError);
        }
      }

      const message = disabledAppIds.length
        ? `⚠️ ${appId} crashed ${crashCount} times and was disabled automatically. Affected apps: ${disabledAppIds.join(", ")}.`
        : `⚠️ ${appId} crashed${crashCount ? ` (${crashCount}/${crashThreshold})` : ""}. ServerOS is still running.`;
      await this.safeErrorReply(interaction, message);
      return;
    }

    if (guildId) {
      await this.health.markHealthy(guildId, appId).catch((error) => appLogger.error("App health could not be marked as healthy", error));
    }
  }

  private async safeErrorReply(interaction: ChatInputCommandInteraction | ButtonInteraction, message: string): Promise<void> {
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: message, ephemeral: true });
      } else {
        await interaction.reply({ content: message, ephemeral: true });
      }
    } catch {}
  }
}
