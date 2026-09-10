import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import type { AppRegistry } from "../src/core/runtime/AppRegistry.js";
import { AppDataMaintenance } from "../src/core/system/AppDataMaintenance.js";

type AppRow = { appId: string | null };

function fixture() {
  const rows = {
    installations: [{ appId: "known" }, { appId: "removed" }],
    storage: [{ appId: "removed" }, { appId: "removed" }],
    health: [{ appId: "removed" }],
    logs: [{ appId: "removed" }, { appId: null }]
  };

  const remove = (items: AppRow[], appIds: string[]) => {
    for (let index = items.length - 1; index >= 0; index -= 1) {
      if (items[index].appId && appIds.includes(items[index].appId!)) {
        items.splice(index, 1);
      }
    }
  };

  const prismaObject = {
    appInstallation: {
      findMany: async () => rows.installations,
      deleteMany: async (args: { where: { appId: { in: string[] } } }) => remove(rows.installations, args.where.appId.in)
    },
    appStorage: {
      findMany: async () => rows.storage,
      deleteMany: async (args: { where: { appId: { in: string[] } } }) => remove(rows.storage, args.where.appId.in)
    },
    appHealth: {
      findMany: async () => rows.health,
      deleteMany: async (args: { where: { appId: { in: string[] } } }) => remove(rows.health, args.where.appId.in)
    },
    systemLog: {
      findMany: async () => rows.logs.filter((item) => item.appId),
      deleteMany: async (args: { where: { appId: { in: string[] } } }) => remove(rows.logs, args.where.appId.in)
    },
    $transaction: async (action: (transaction: PrismaClient) => Promise<void>) => action(prismaObject as unknown as PrismaClient)
  };
  const prisma = prismaObject as unknown as PrismaClient;
  const registry = {
    all: () => [{ metadata: { id: "known" } }]
  } as unknown as AppRegistry;

  return { prisma, registry, rows };
}

test("reports only data belonging to missing apps", async () => {
  const { prisma, registry } = fixture();
  const maintenance = new AppDataMaintenance(prisma, registry);

  assert.deepEqual(await maintenance.inspectOrphans(), [{
    appId: "removed",
    installations: 1,
    storage: 2,
    health: 1,
    logs: 1,
    total: 5
  }]);
  assert.deepEqual(await maintenance.inspectOrphans("known"), []);
});

test("deletes only app data that is still orphaned", async () => {
  const { prisma, registry, rows } = fixture();
  const maintenance = new AppDataMaintenance(prisma, registry);

  const deleted = await maintenance.deleteOrphans(["removed"]);
  assert.equal(deleted[0].total, 5);
  assert.deepEqual(rows.installations, [{ appId: "known" }]);
  assert.deepEqual(rows.storage, []);
  assert.deepEqual(rows.health, []);
  assert.deepEqual(rows.logs, [{ appId: null }]);
  await assert.rejects(() => maintenance.deleteOrphans(["known"]), /not orphaned or does not exist/);
});
