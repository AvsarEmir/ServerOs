import { AppRegistry } from "./core/runtime/AppRegistry.js";
import { CommandSyncer } from "./core/system/CommandSyncer.js";
import { AppInstallations } from "./core/system/AppInstallations.js";
import { prisma } from "./core/database/prisma.js";
import { env } from "./core/utils/env.js";

const registry = new AppRegistry();
await registry.load();

const installations = new AppInstallations(prisma, registry);
const syncer = new CommandSyncer(registry, installations);
const commandCount = await syncer.syncDefaultGuildCommands();

if (env.discordGuildId) {
  console.log(`Registered ${commandCount} default guild commands.`);
} else {
  console.log(`Registered ${commandCount} default global commands.`);
}

await prisma.$disconnect();
