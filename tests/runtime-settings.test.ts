import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { RuntimeSettings } from "../src/core/system/RuntimeSettings.js";

function fakePrisma() {
  const records = new Map<string, string>();
  const prisma = {
    appStorage: {
      async findUnique(args: { where: { guildId_appId_key: { guildId: string; appId: string; key: string } } }) {
        const value = records.get(`${args.where.guildId_appId_key.guildId}:${args.where.guildId_appId_key.appId}:${args.where.guildId_appId_key.key}`);
        return value === undefined ? null : { value };
      },
      async upsert(args: {
        where: { guildId_appId_key: { guildId: string; appId: string; key: string } };
        create: { value: string };
        update: { value: string };
      }) {
        const key = `${args.where.guildId_appId_key.guildId}:${args.where.guildId_appId_key.appId}:${args.where.guildId_appId_key.key}`;
        records.set(key, args.update.value ?? args.create.value);
      }
    }
  } as unknown as PrismaClient;
  return { prisma, records };
}

test("uses a default threshold and stores guild-specific values", async () => {
  const { prisma } = fakePrisma();
  const settings = new RuntimeSettings(prisma, 3);

  assert.equal(await settings.crashThreshold("guild-a"), 3);
  assert.equal(await settings.setCrashThreshold("guild-a", 5), 5);
  assert.equal(await settings.crashThreshold("guild-a"), 5);
  assert.equal(await settings.crashThreshold("guild-b"), 3);
});

test("keeps thresholds inside the supported range", async () => {
  const { prisma, records } = fakePrisma();
  const settings = new RuntimeSettings(prisma, 3);

  assert.equal(await settings.setCrashThreshold("guild", 0), 1);
  assert.equal(await settings.setCrashThreshold("guild", 99), 20);
  records.set("guild:serveros:appCrashThreshold", JSON.stringify("invalid"));
  assert.equal(await settings.crashThreshold("guild"), 3);
});
