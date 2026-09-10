import { REST, Routes } from "discord.js";
import { env } from "../utils/env.js";
import { coreCommands } from "../commands/coreCommands.js";
import type { AppRegistry } from "../runtime/AppRegistry.js";
import type { AppInstallations } from "./AppInstallations.js";

export interface GuildCommandSyncResult {
  guildId: string;
  commandCount?: number;
  error?: string;
}

type CommandRest = Pick<REST, "put">;

export class CommandSyncer {
  private rest: CommandRest;

  constructor(
    private registry: AppRegistry,
    private installations: AppInstallations,
    rest?: CommandRest
  ) {
    this.rest = rest ?? new REST({ version: "10" }).setToken(env.discordToken);
  }

  async syncGuild(guildId: string): Promise<number> {
    const installedIds = await this.installations.installedAppIds(guildId);
    const commands = [
      ...coreCommands,
      ...this.registry.commandsForInstalled(installedIds)
    ].map((command) => command.toJSON());

    await this.rest.put(
      Routes.applicationGuildCommands(env.discordClientId, guildId),
      { body: commands }
    );

    return commands.length;
  }

  async syncGuilds(guildIds: Iterable<string>): Promise<GuildCommandSyncResult[]> {
    const results: GuildCommandSyncResult[] = [];

    for (const guildId of new Set(guildIds)) {
      try {
        const commandCount = await this.syncGuild(guildId);
        results.push({ guildId, commandCount });
      } catch (error) {
        results.push({
          guildId,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    return results;
  }

  async syncDefaultGuildCommands(): Promise<number> {
    if (env.discordGuildId) {
      return this.syncGuild(env.discordGuildId);
    }

    const commands = [
      ...coreCommands,
      ...this.registry.systemCommands()
    ].map((command) => command.toJSON());

    await this.rest.put(
      Routes.applicationCommands(env.discordClientId),
      { body: commands }
    );

    return commands.length;
  }
}
