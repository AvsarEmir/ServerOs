import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { AppStorage } from "../src/core/system/AppStorage.js";

type StorageRecord = {
  guildId: string;
  appId: string;
  key: string;
  value: string;
};

function storageKey(record: Pick<StorageRecord, "guildId" | "appId" | "key">): string {
  return `${record.guildId}:${record.appId}:${record.key}`;
}

function fakePrisma() {
  const records = new Map<string, StorageRecord>();

  const prisma = {
    appStorage: {
      async findUnique(args: { where: { guildId_appId_key: Pick<StorageRecord, "guildId" | "appId" | "key"> } }) {
        return records.get(storageKey(args.where.guildId_appId_key)) ?? null;
      },
      async upsert(args: {
        where: { guildId_appId_key: Pick<StorageRecord, "guildId" | "appId" | "key"> };
        create: StorageRecord;
        update: Pick<StorageRecord, "value">;
      }) {
        const key = storageKey(args.where.guildId_appId_key);
        const current = records.get(key);
        records.set(key, current ? { ...current, ...args.update } : args.create);
      },
      async deleteMany(args: { where: Pick<StorageRecord, "guildId" | "appId" | "key"> }) {
        records.delete(storageKey(args.where));
      }
    }
  } as unknown as PrismaClient;

  return { prisma, records };
}

test("isolates storage by guild and app", async () => {
  const { prisma } = fakePrisma();
  const firstGuild = new AppStorage(prisma, "guild-a", "notes");
  const secondGuild = new AppStorage(prisma, "guild-b", "notes");
  const secondApp = new AppStorage(prisma, "guild-a", "tasks");

  await firstGuild.set("items", ["first"]);
  await secondGuild.set("items", ["second"]);
  await secondApp.set("items", ["task"]);

  assert.deepEqual(await firstGuild.get("items", []), ["first"]);
  assert.deepEqual(await secondGuild.get("items", []), ["second"]);
  assert.deepEqual(await secondApp.get("items", []), ["task"]);
});

test("returns fallbacks and deletes only the requested key", async () => {
  const { prisma, records } = fakePrisma();
  const storage = new AppStorage(prisma, "guild-a", "notes");

  assert.deepEqual(await storage.get("missing", ["fallback"]), ["fallback"]);

  await storage.set("keep", { value: 1 });
  await storage.set("remove", { value: 2 });
  await storage.delete("remove");

  assert.deepEqual(await storage.get("keep", { value: 0 }), { value: 1 });
  assert.deepEqual(await storage.get("remove", { value: 0 }), { value: 0 });

  records.set("guild-a:notes:invalid", {
    guildId: "guild-a",
    appId: "notes",
    key: "invalid",
    value: "invalid-json"
  });

  assert.deepEqual(await storage.get("invalid", { safe: true }), { safe: true });
});
