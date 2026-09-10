import type { PrismaClient } from "@prisma/client";
import type { AppRegistry } from "../runtime/AppRegistry.js";

export interface AppInstallResult {
  activatedAppIds: string[];
  firstInstallAppIds: string[];
}

export class AppInstallations {
  constructor(
    private prisma: PrismaClient,
    private registry: AppRegistry
  ) {}

  async ensureGuild(guildId: string, name?: string): Promise<void> {
    await this.prisma.guild.upsert({
      where: { id: guildId },
      create: { id: guildId, name },
      update: { name }
    });
  }

  async isInstalled(guildId: string, appId: string): Promise<boolean> {
    const app = this.registry.get(appId);
    if (app?.metadata.system) {
      return true;
    }

    const installation = await this.prisma.appInstallation.findUnique({
      where: {
        guildId_appId: { guildId, appId }
      }
    });

    return installation?.enabled ?? false;
  }

  async hasInstallation(guildId: string, appId: string): Promise<boolean> {
    const installation = await this.prisma.appInstallation.findUnique({
      where: {
        guildId_appId: { guildId, appId }
      },
      select: { id: true }
    });
    return installation !== null;
  }

  async installationAppIds(guildId: string): Promise<string[]> {
    const installations = await this.prisma.appInstallation.findMany({
      where: { guildId },
      select: { appId: true }
    });
    return installations.map((installation) => installation.appId);
  }

  async install(guildId: string, appId: string): Promise<void> {
    await this.prisma.appInstallation.upsert({
      where: {
        guildId_appId: { guildId, appId }
      },
      create: { guildId, appId, enabled: true },
      update: { enabled: true }
    });
  }

  async installWithDependencies(guildId: string, appId: string): Promise<AppInstallResult> {
    const activatedAppIds: string[] = [];
    const firstInstallAppIds: string[] = [];
    const visited = new Set<string>();

    const installRecursive = async (targetAppId: string) => {
      if (visited.has(targetAppId)) {
        return;
      }
      visited.add(targetAppId);

      const app = this.registry.get(targetAppId);
      if (!app) {
        throw new Error(`Dependency not found: ${targetAppId}`);
      }

      for (const dependencyId of this.registry.requiredDependencyIds(app)) {
        await installRecursive(dependencyId);
      }

      if (app.metadata.system) {
        return;
      }

      const existing = await this.prisma.appInstallation.findUnique({
        where: {
          guildId_appId: { guildId, appId: targetAppId }
        },
        select: { enabled: true }
      });
      await this.install(guildId, targetAppId);
      if (!existing?.enabled) {
        activatedAppIds.push(targetAppId);
      }
      if (!existing) {
        firstInstallAppIds.push(targetAppId);
      }
    };

    await installRecursive(appId);
    return { activatedAppIds, firstInstallAppIds };
  }

  async missingDependencyIds(guildId: string, appId: string): Promise<string[]> {
    const app = this.registry.get(appId);
    if (!app) {
      return [];
    }

    const missing: string[] = [];
    for (const dependencyId of this.registry.requiredDependencyIds(app)) {
      if (!(await this.isInstalled(guildId, dependencyId))) {
        missing.push(dependencyId);
      }
    }
    return missing;
  }

  async installedDependents(guildId: string, appId: string): Promise<string[]> {
    const installed = new Set(await this.installedAppIds(guildId));
    return this.registry
      .dependentsOf(appId)
      .filter((app) => installed.has(app.metadata.id))
      .map((app) => app.metadata.id);
  }

  async uninstall(guildId: string, appId: string): Promise<void> {
    const app = this.registry.get(appId);
    if (app?.metadata.system) {
      throw new Error("System apps cannot be uninstalled.");
    }

    const dependents = await this.installedDependents(guildId, appId);
    if (dependents.length) {
      throw new Error(`Cannot disable ${appId}. Installed apps depend on it: ${dependents.join(", ")}`);
    }

    await this.prisma.appInstallation.updateMany({
      where: { guildId, appId },
      data: { enabled: false }
    });
  }

  async disableAppIds(guildId: string, appIds: string[]): Promise<void> {
    const uniqueAppIds = [...new Set(appIds)];
    if (!uniqueAppIds.length) {
      return;
    }

    await this.prisma.appInstallation.updateMany({
      where: {
        guildId,
        appId: { in: uniqueAppIds }
      },
      data: { enabled: false }
    });
  }

  async disableForSafety(guildId: string, appId: string): Promise<string[]> {
    const app = this.registry.get(appId);
    if (!app || app.metadata.system) {
      return [];
    }

    const installed = new Set(await this.installedAppIds(guildId));
    const affected = new Set<string>();
    if (installed.has(appId)) {
      affected.add(appId);
    }

    let previousSize = -1;
    while (previousSize !== affected.size) {
      previousSize = affected.size;
      for (const candidate of this.registry.all()) {
        if (!installed.has(candidate.metadata.id) || candidate.metadata.system) {
          continue;
        }

        if (this.registry.requiredDependencyIds(candidate).some((dependencyId) => affected.has(dependencyId))) {
          affected.add(candidate.metadata.id);
        }
      }
    }

    const appIds = [...affected];
    if (!appIds.length) {
      return [];
    }

    await this.disableAppIds(guildId, appIds);

    return appIds;
  }

  async installedAppIds(guildId: string): Promise<string[]> {
    const installed = await this.prisma.appInstallation.findMany({
      where: { guildId, enabled: true },
      select: { appId: true }
    });

    const systemApps = this.registry
      .all()
      .filter((app) => app.metadata.system)
      .map((app) => app.metadata.id);

    return [...new Set([...systemApps, ...installed.map((item) => item.appId)])];
  }
}
