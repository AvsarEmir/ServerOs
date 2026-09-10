import type { PrismaClient } from "@prisma/client";
import { AppStorage } from "./AppStorage.js";

const SETTINGS_APP_ID = "serveros";
const CRASH_THRESHOLD_KEY = "appCrashThreshold";

export class RuntimeSettings {
  constructor(
    private prisma: PrismaClient,
    private defaultCrashThreshold: number
  ) {}

  async crashThreshold(guildId: string): Promise<number> {
    const storage = new AppStorage(this.prisma, guildId, SETTINGS_APP_ID);
    const value = await storage.get<unknown>(CRASH_THRESHOLD_KEY, this.defaultCrashThreshold);
    return this.normalizeCrashThreshold(value, this.defaultCrashThreshold);
  }

  async setCrashThreshold(guildId: string, value: number): Promise<number> {
    const normalized = this.normalizeCrashThreshold(value, this.defaultCrashThreshold);
    const storage = new AppStorage(this.prisma, guildId, SETTINGS_APP_ID);
    await storage.set(CRASH_THRESHOLD_KEY, normalized);
    return normalized;
  }

  private normalizeCrashThreshold(value: unknown, fallback: number): number {
    const parsed = typeof value === "number" ? value : Number.parseInt(String(value), 10);
    if (!Number.isFinite(parsed)) {
      return Math.min(20, Math.max(1, Math.floor(fallback)));
    }
    return Math.min(20, Math.max(1, Math.floor(parsed)));
  }
}
