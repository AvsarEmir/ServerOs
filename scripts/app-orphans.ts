import { prisma } from "../src/core/database/prisma.js";
import { AppRegistry } from "../src/core/runtime/AppRegistry.js";
import { AppDataMaintenance } from "../src/core/system/AppDataMaintenance.js";
import { argValue, assertValidAppId, hasFlag, normalizeAppId, positionalArgs } from "./app-utils.js";

async function main(): Promise<void> {
  const rawAppId = argValue("app") ?? positionalArgs()[0];
  const appId = rawAppId ? normalizeAppId(rawAppId) : undefined;
  if (appId) {
    assertValidAppId(appId);
  }

  const registry = new AppRegistry();
  await registry.load();
  const maintenance = new AppDataMaintenance(prisma, registry);
  const orphans = await maintenance.inspectOrphans(appId);

  if (!orphans.length) {
    console.log(appId ? `No orphaned data found for app: ${appId}` : "No orphaned app data found.");
    return;
  }

  console.table(orphans.map((item) => ({
    appId: item.appId,
    installations: item.installations,
    storage: item.storage,
    health: item.health,
    logs: item.logs,
    total: item.total
  })));

  if (!hasFlag("delete")) {
    console.log("Preview only. Add --delete --yes to permanently remove the listed rows.");
    return;
  }

  if (!hasFlag("yes")) {
    throw new Error("Permanent deletion requires both --delete and --yes.");
  }

  const deleted = await maintenance.deleteOrphans(orphans.map((item) => item.appId));
  console.log(`Deleted ${deleted.reduce((total, item) => total + item.total, 0)} rows for: ${deleted.map((item) => item.appId).join(", ")}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
