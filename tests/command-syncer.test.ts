import assert from "node:assert/strict";
import test from "node:test";
import type { REST } from "discord.js";
import type { AppRegistry } from "../src/core/runtime/AppRegistry.js";
import type { AppInstallations } from "../src/core/system/AppInstallations.js";

test("synchronizes guilds independently and removes duplicates", async () => {
  process.env.DISCORD_TOKEN ??= "test-token";
  process.env.DISCORD_CLIENT_ID ??= "test-client";

  const { CommandSyncer } = await import("../src/core/system/CommandSyncer.js");
  const registry = {
    commandsForInstalled: () => [],
    systemCommands: () => []
  } as unknown as AppRegistry;
  const installations = {
    installedAppIds: async () => []
  } as unknown as AppInstallations;
  let requestCount = 0;
  const rest = {
    async put() {
      requestCount += 1;
      if (requestCount === 2) {
        throw new Error("second guild failed");
      }
      return [];
    }
  } as unknown as Pick<REST, "put">;
  const syncer = new CommandSyncer(registry, installations, rest);

  const results = await syncer.syncGuilds(["guild-a", "guild-b", "guild-a"]);

  assert.equal(requestCount, 2);
  assert.equal(results.length, 2);
  assert.equal(results[0].guildId, "guild-a");
  assert.equal(typeof results[0].commandCount, "number");
  assert.equal(results[1].guildId, "guild-b");
  assert.equal(results[1].error, "second guild failed");
});

test("includes commands belonging to installed apps", async () => {
  process.env.DISCORD_TOKEN ??= "test-token";
  process.env.DISCORD_CLIENT_ID ??= "test-client";

  const { CommandSyncer } = await import("../src/core/system/CommandSyncer.js");
  let receivedInstalledIds: string[] = [];
  const registry = {
    commandsForInstalled: (appIds: string[]) => {
      receivedInstalledIds = appIds;
      return [{ toJSON: () => ({ name: "custom-command", description: "Custom command" }) }];
    },
    systemCommands: () => []
  } as unknown as AppRegistry;
  const installations = {
    installedAppIds: async () => ["custom-app"]
  } as unknown as AppInstallations;
  let body: Array<{ name: string }> = [];
  const rest = {
    async put(_route: string, options: { body: Array<{ name: string }> }) {
      body = options.body;
      return [];
    }
  } as unknown as Pick<REST, "put">;
  const syncer = new CommandSyncer(registry, installations, rest);

  const commandCount = await syncer.syncGuild("guild");

  assert.deepEqual(receivedInstalledIds, ["custom-app"]);
  assert.equal(commandCount, body.length);
  assert.equal(body.some((command) => command.name === "custom-command"), true);
});
