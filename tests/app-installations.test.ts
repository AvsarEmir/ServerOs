import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import type { AppRegistry } from "../src/core/runtime/AppRegistry.js";
import type { ServerOSApp } from "../src/core/runtime/types.js";
import { AppInstallations } from "../src/core/system/AppInstallations.js";

function app(id: string, dependencies: string[] = [], system = false): ServerOSApp {
  return {
    metadata: {
      id,
      name: id,
      icon: "🧩",
      version: "1.0.0",
      description: id,
      category: system ? "System" : "Custom",
      dependencies,
      system
    },
    async open() {}
  };
}

function fixture(initialEnabled: boolean | null = true) {
  const apps = [
    app("base"),
    app("dependent", ["base"]),
    app("transitive", ["dependent"]),
    app("unrelated"),
    app("terminal", [], true)
  ];
  const byId = new Map(apps.map((item) => [item.metadata.id, item]));
  const registry = {
    get: (id: string) => byId.get(id),
    all: () => apps,
    requiredDependencyIds: (item: ServerOSApp) => (item.metadata.dependencies ?? []).map((dependency) => typeof dependency === "string" ? dependency : dependency.id),
    dependentsOf: (appId: string) => apps.filter((item) => (item.metadata.dependencies ?? []).some((dependency) => (typeof dependency === "string" ? dependency : dependency.id) === appId))
  } as unknown as AppRegistry;

  const enabled = new Map<string, boolean>(
    initialEnabled === null
      ? []
      : apps.filter((item) => !item.metadata.system).map((item) => [item.metadata.id, initialEnabled])
  );
  const prisma = {
    appInstallation: {
      async findUnique(args: { where: { guildId_appId: { appId: string } } }) {
        const value = enabled.get(args.where.guildId_appId.appId);
        return value === undefined ? null : { enabled: value };
      },
      async findMany() {
        return [...enabled.entries()].filter(([, value]) => value).map(([appId]) => ({ appId }));
      },
      async upsert(args: { where: { guildId_appId: { appId: string } }; create: { enabled: boolean }; update: { enabled: boolean } }) {
        enabled.set(args.where.guildId_appId.appId, args.update.enabled ?? args.create.enabled);
      },
      async updateMany(args: { where: { appId: string | { in: string[] } }; data: { enabled: boolean } }) {
        const appIds = typeof args.where.appId === "string" ? [args.where.appId] : args.where.appId.in;
        for (const appId of appIds) {
          enabled.set(appId, args.data.enabled);
        }
        return { count: appIds.length };
      }
    }
  } as unknown as PrismaClient;

  return { registry, prisma, enabled };
}

test("safety disable cascades through installed dependents", async () => {
  const { registry, prisma, enabled } = fixture();
  const installations = new AppInstallations(prisma, registry);

  const affected = await installations.disableForSafety("guild", "base");

  assert.deepEqual(affected.sort(), ["base", "dependent", "transitive"]);
  assert.equal(enabled.get("base"), false);
  assert.equal(enabled.get("dependent"), false);
  assert.equal(enabled.get("transitive"), false);
  assert.equal(enabled.get("unrelated"), true);
});

test("safety disable never disables a system app", async () => {
  const { registry, prisma, enabled } = fixture();
  const installations = new AppInstallations(prisma, registry);

  assert.deepEqual(await installations.disableForSafety("guild", "terminal"), []);
  assert.equal(enabled.get("unrelated"), true);
});

test("installs required dependencies before the requested app", async () => {
  const { registry, prisma, enabled } = fixture(null);
  const installations = new AppInstallations(prisma, registry);

  assert.deepEqual(await installations.installWithDependencies("guild", "transitive"), {
    activatedAppIds: ["base", "dependent", "transitive"],
    firstInstallAppIds: ["base", "dependent", "transitive"]
  });
  assert.equal(enabled.get("base"), true);
  assert.equal(enabled.get("dependent"), true);
  assert.equal(enabled.get("transitive"), true);
  assert.notEqual(enabled.get("unrelated"), true);
});

test("prevents disabling an app while installed apps depend on it", async () => {
  const { registry, prisma, enabled } = fixture();
  const installations = new AppInstallations(prisma, registry);

  await assert.rejects(() => installations.uninstall("guild", "base"), /dependent/);
  assert.equal(enabled.get("base"), true);

  await installations.uninstall("guild", "transitive");
  assert.equal(enabled.get("transitive"), false);
});

test("re-enables an existing installation without treating it as a first install", async () => {
  const { registry, prisma, enabled } = fixture();
  const installations = new AppInstallations(prisma, registry);
  enabled.set("unrelated", false);

  assert.deepEqual(await installations.installWithDependencies("guild", "unrelated"), {
    activatedAppIds: ["unrelated"],
    firstInstallAppIds: []
  });
  assert.equal(enabled.get("unrelated"), true);
});
