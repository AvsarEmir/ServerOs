import type { PrismaClient } from "@prisma/client";

export type AppHealthStatus = "healthy" | "running" | "degraded" | "broken" | "disabled" | "crashed" | "unknown";

export class AppHealth {
  constructor(private prisma: PrismaClient) {}

  async ensure(guildId: string, appId: string): Promise<void> {
    await this.prisma.appHealth.upsert({
      where: { guildId_appId: { guildId, appId } },
      update: {},
      create: {
        guildId,
        appId,
        status: "unknown"
      }
    });
  }

  async markRunning(guildId: string, appId: string): Promise<void> {
    await this.prisma.appHealth.upsert({
      where: { guildId_appId: { guildId, appId } },
      update: {
        status: "running",
        lastStartedAt: new Date()
      },
      create: {
        guildId,
        appId,
        status: "running",
        lastStartedAt: new Date()
      }
    });
  }

  async markHealthy(guildId: string, appId: string): Promise<void> {
    await this.prisma.appHealth.upsert({
      where: { guildId_appId: { guildId, appId } },
      update: {
        status: "healthy",
        lastError: null,
        crashCount: 0
      },
      create: {
        guildId,
        appId,
        status: "healthy"
      }
    });
  }

  async reset(guildId: string, appId: string): Promise<void> {
    await this.prisma.appHealth.upsert({
      where: { guildId_appId: { guildId, appId } },
      update: {
        status: "unknown",
        lastError: null,
        crashCount: 0
      },
      create: {
        guildId,
        appId,
        status: "unknown"
      }
    });
  }

  async markDisabled(guildId: string, appId: string): Promise<void> {
    await this.prisma.appHealth.upsert({
      where: { guildId_appId: { guildId, appId } },
      update: { status: "disabled" },
      create: { guildId, appId, status: "disabled" }
    });
  }

  async markCrashed(guildId: string, appId: string, error: unknown): Promise<number> {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);

    const health = await this.prisma.appHealth.upsert({
      where: { guildId_appId: { guildId, appId } },
      update: {
        status: "degraded",
        lastError: message.slice(0, 1000),
        crashCount: { increment: 1 }
      },
      create: {
        guildId,
        appId,
        status: "degraded",
        lastError: message.slice(0, 1000),
        crashCount: 1
      }
    });

    return health.crashCount;
  }

  async get(guildId: string, appId: string) {
    return this.prisma.appHealth.findUnique({
      where: { guildId_appId: { guildId, appId } }
    });
  }

  async list(guildId: string) {
    return this.prisma.appHealth.findMany({
      where: { guildId },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }]
    });
  }

  label(status?: string | null): string {
    switch (status) {
      case "healthy":
        return "🟢 Healthy";
      case "running":
        return "🟢 Running";
      case "degraded":
        return "🟠 Degraded";
      case "disabled":
        return "⚪ Disabled";
      case "broken":
        return "🔴 Broken";
      case "crashed":
        return "🔴 Crashed";
      default:
        return "🟡 Unknown";
    }
  }
}
