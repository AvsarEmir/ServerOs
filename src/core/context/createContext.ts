import type { ButtonInteraction, ChatInputCommandInteraction, Client } from "discord.js";
import type { PrismaClient } from "@prisma/client";
import type { AppRegistry } from "../runtime/AppRegistry.js";
import type { ServerOSApp, AppContext, CoreCommandContext } from "../runtime/types.js";
import { AppStorage } from "../system/AppStorage.js";
import { AppLogger } from "../system/AppLogger.js";
import { AppHealth } from "../system/AppHealth.js";
import { PermissionManager } from "../system/PermissionManager.js";
import type { AppInstallations } from "../system/AppInstallations.js";
import { ServerOSUI } from "../ui/ServerOSUI.js";

function baseReply(interaction: ChatInputCommandInteraction | ButtonInteraction) {
  return async (options: Parameters<AppContext["reply"]>[0]) => {
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(options as any);
      return;
    }

    await interaction.reply(options as any);
  };
}

function baseUpdate(interaction: ChatInputCommandInteraction | ButtonInteraction) {
  return async (options: Parameters<AppContext["update"]>[0]) => {
    if (interaction.isButton()) {
      await interaction.update(options as any);
      return;
    }

    if (interaction.replied || interaction.deferred) {
      await interaction.editReply(options as any);
      return;
    }

    await interaction.reply(options as any);
  };
}

export function createAppContext(options: {
  app: ServerOSApp;
  client: Client;
  prisma: PrismaClient;
  registry: AppRegistry;
  installations: AppInstallations;
  interaction: ChatInputCommandInteraction | ButtonInteraction;
}): AppContext {
  const guildId = options.interaction.guildId;
  if (!guildId) {
    throw new Error("ServerOS can only run inside a Discord server.");
  }

  const ctx: AppContext = {
    app: options.app,
    client: options.client,
    prisma: options.prisma,
    registry: options.registry,
    installations: options.installations,
    storage: new AppStorage(options.prisma, guildId, options.app.metadata.id),
    logger: new AppLogger(options.prisma, guildId, options.app.metadata.id),
    health: new AppHealth(options.prisma),
    permissions: new PermissionManager(options.interaction),
    ui: new ServerOSUI(),
    guildId,
    userId: options.interaction.user.id,
    interaction: options.interaction,
    reply: baseReply(options.interaction),
    update: baseUpdate(options.interaction),
    switchApp(app) {
      return createAppContext({
        app,
        client: options.client,
        prisma: options.prisma,
        registry: options.registry,
        installations: options.installations,
        interaction: options.interaction
      });
    }
  };

  return ctx;
}

export function createCoreContext(options: {
  client: Client;
  prisma: PrismaClient;
  registry: AppRegistry;
  installations: AppInstallations;
  interaction: ChatInputCommandInteraction | ButtonInteraction;
}): CoreCommandContext {
  const guildId = options.interaction.guildId;
  if (!guildId) {
    throw new Error("ServerOS can only run inside a Discord server.");
  }

  return {
    client: options.client,
    prisma: options.prisma,
    registry: options.registry,
    installations: options.installations,
    logger: new AppLogger(options.prisma, guildId),
    health: new AppHealth(options.prisma),
    permissions: new PermissionManager(options.interaction),
    ui: new ServerOSUI(),
    guildId,
    userId: options.interaction.user.id,
    interaction: options.interaction,
    reply: baseReply(options.interaction),
    update: baseUpdate(options.interaction),
    switchApp(app) {
      return createAppContext({
        app,
        client: options.client,
        prisma: options.prisma,
        registry: options.registry,
        installations: options.installations,
        interaction: options.interaction
      });
    }
  };
}
