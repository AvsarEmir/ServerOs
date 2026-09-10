import type { PrismaClient } from "@prisma/client";
import type { AppRegistry } from "../runtime/AppRegistry.js";

export interface OrphanAppData {
  appId: string;
  installations: number;
  storage: number;
  health: number;
  logs: number;
  total: number;
}

type CountField = "installations" | "storage" | "health" | "logs";

export class AppDataMaintenance {
  constructor(
    private prisma: PrismaClient,
    private registry: AppRegistry
  ) {}

  async inspectOrphans(appId?: string): Promise<OrphanAppData[]> {
    const [installations, storage, health, logs] = await Promise.all([
      this.prisma.appInstallation.findMany({ select: { appId: true } }),
      this.prisma.appStorage.findMany({ select: { appId: true } }),
      this.prisma.appHealth.findMany({ select: { appId: true } }),
      this.prisma.systemLog.findMany({ where: { appId: { not: null } }, select: { appId: true } })
    ]);
    const counts = new Map<string, OrphanAppData>();

    this.addCounts(counts, installations, "installations");
    this.addCounts(counts, storage, "storage");
    this.addCounts(counts, health, "health");
    this.addCounts(counts, logs, "logs");

    const knownAppIds = new Set(this.registry.all().map((app) => app.metadata.id));
    return [...counts.values()]
      .filter((item) => !knownAppIds.has(item.appId))
      .filter((item) => !appId || item.appId === appId)
      .map((item) => ({ ...item, total: item.installations + item.storage + item.health + item.logs }))
      .sort((a, b) => a.appId.localeCompare(b.appId));
  }

  async deleteOrphans(appIds: string[]): Promise<OrphanAppData[]> {
    const uniqueAppIds = [...new Set(appIds)];
    if (!uniqueAppIds.length) {
      return [];
    }

    const current = await this.inspectOrphans();
    const currentById = new Map(current.map((item) => [item.appId, item]));
    const invalid = uniqueAppIds.filter((appId) => !currentById.has(appId));
    if (invalid.length) {
      throw new Error(`App data is not orphaned or does not exist: ${invalid.join(", ")}`);
    }

    await this.prisma.$transaction(async (transaction) => {
      await transaction.appInstallation.deleteMany({ where: { appId: { in: uniqueAppIds } } });
      await transaction.appStorage.deleteMany({ where: { appId: { in: uniqueAppIds } } });
      await transaction.appHealth.deleteMany({ where: { appId: { in: uniqueAppIds } } });
      await transaction.systemLog.deleteMany({ where: { appId: { in: uniqueAppIds } } });
    });

    return uniqueAppIds.map((appId) => currentById.get(appId)!);
  }

  private addCounts(
    counts: Map<string, OrphanAppData>,
    rows: Array<{ appId: string | null }>,
    field: CountField
  ): void {
    for (const row of rows) {
      if (!row.appId) {
        continue;
      }

      const current = counts.get(row.appId) ?? {
        appId: row.appId,
        installations: 0,
        storage: 0,
        health: 0,
        logs: 0,
        total: 0
      };
      current[field] += 1;
      counts.set(row.appId, current);
    }
  }
}
