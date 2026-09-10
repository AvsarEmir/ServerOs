import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { AppHealth } from "../src/core/system/AppHealth.js";

type HealthRecord = {
  guildId: string;
  appId: string;
  status: string;
  lastStartedAt: Date | null;
  lastError: string | null;
  crashCount: number;
};

function fakePrisma() {
  const records = new Map<string, HealthRecord>();
  const keyOf = (guildId: string, appId: string) => `${guildId}:${appId}`;

  const prisma = {
    appHealth: {
      async upsert(args: {
        where: { guildId_appId: { guildId: string; appId: string } };
        update: Partial<HealthRecord> & { crashCount?: number | { increment: number } };
        create: Partial<HealthRecord> & Pick<HealthRecord, "guildId" | "appId" | "status">;
      }) {
        const key = keyOf(args.where.guildId_appId.guildId, args.where.guildId_appId.appId);
        const current = records.get(key);

        if (!current) {
          const created: HealthRecord = {
            guildId: args.create.guildId,
            appId: args.create.appId,
            status: args.create.status,
            lastStartedAt: args.create.lastStartedAt ?? null,
            lastError: args.create.lastError ?? null,
            crashCount: typeof args.create.crashCount === "number" ? args.create.crashCount : 0
          };
          records.set(key, created);
          return created;
        }

        const crashCount = typeof args.update.crashCount === "object"
          ? current.crashCount + args.update.crashCount.increment
          : args.update.crashCount ?? current.crashCount;
        const updated: HealthRecord = {
          ...current,
          ...args.update,
          crashCount
        };
        records.set(key, updated);
        return updated;
      },
      async findUnique(args: { where: { guildId_appId: { guildId: string; appId: string } } }) {
        return records.get(keyOf(args.where.guildId_appId.guildId, args.where.guildId_appId.appId)) ?? null;
      },
      async findMany() {
        return [...records.values()];
      }
    }
  } as unknown as PrismaClient;

  return { prisma, records };
}

test("counts consecutive crashes and resets after success", async () => {
  const { prisma } = fakePrisma();
  const health = new AppHealth(prisma);

  await health.markRunning("guild", "notes");
  assert.equal(await health.markCrashed("guild", "notes", new Error("first")), 1);
  await health.markRunning("guild", "notes");
  assert.equal(await health.markCrashed("guild", "notes", new Error("second")), 2);

  await health.markHealthy("guild", "notes");
  const recovered = await health.get("guild", "notes");
  assert.equal(recovered?.status, "healthy");
  assert.equal(recovered?.crashCount, 0);
  assert.equal(recovered?.lastError, null);

  assert.equal(await health.markCrashed("guild", "notes", new Error("new sequence")), 1);
});

test("preserves crash details when an app is disabled", async () => {
  const { prisma } = fakePrisma();
  const health = new AppHealth(prisma);

  await health.markCrashed("guild", "tasks", new TypeError("failed"));
  await health.markDisabled("guild", "tasks");

  const state = await health.get("guild", "tasks");
  assert.equal(state?.status, "disabled");
  assert.equal(state?.crashCount, 1);
  assert.equal(state?.lastError, "TypeError: failed");
});
