import { Client, GatewayIntentBits } from "discord.js";
import { env } from "./core/utils/env.js";
import { prisma } from "./core/database/prisma.js";
import { AppRegistry } from "./core/runtime/AppRegistry.js";
import { InteractionRouter } from "./core/router/InteractionRouter.js";

const registry = new AppRegistry({
  safeMode: env.safeMode,
  safeAppIds: env.safeAppIds
});
await registry.load();

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const router = new InteractionRouter(client, prisma, registry);

client.once("ready", async (readyClient) => {
  console.log(`ServerOS booted as ${readyClient.user.tag}`);
  console.log(`Safe mode: ${env.safeMode ? "enabled" : "disabled"}`);
  console.log(`Loaded apps: ${registry.all().map((app) => app.metadata.id).join(", ")}`);

  const syncResults = await router.syncGuildCommands(readyClient.guilds.cache.keys());
  const failedSyncs = syncResults.filter((result) => result.error);
  console.log(`Synchronized commands for ${syncResults.length - failedSyncs.length}/${syncResults.length} guilds.`);
  for (const result of failedSyncs) {
    console.error(`Command sync failed for guild ${result.guildId}: ${result.error}`);
  }
});

client.on("interactionCreate", async (interaction) => {
  await router.handle(interaction);
});

let shuttingDown = false;

async function shutdown(reason: string, exitCode = 0): Promise<void> {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.log(`Shutting down ServerOS: ${reason}`);
  await prisma.$disconnect().catch((error) => console.error("Prisma disconnect failed", error));
  client.destroy();
  process.exitCode = exitCode;
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("unhandledRejection", (reason) => {
  console.error("Unhandled rejection", reason);
  void shutdown("unhandled rejection", 1);
});
process.once("uncaughtException", (error) => {
  console.error("Uncaught exception", error);
  void shutdown("uncaught exception", 1);
});

try {
  await client.login(env.discordToken);
} catch (error) {
  console.error("Discord login failed", error);
  await shutdown("Discord login failure", 1);
}
