import type { PrismaClient } from "@prisma/client";

export type LogLevel = "debug" | "info" | "warn" | "error";

export class AppLogger {
  constructor(
    private prisma: PrismaClient,
    private guildId?: string,
    private appId?: string
  ) {}

  child(appId: string, guildId = this.guildId): AppLogger {
    return new AppLogger(this.prisma, guildId, appId);
  }

  async debug(message: string, meta?: unknown): Promise<void> {
    await this.write("debug", message, meta);
  }

  async info(message: string, meta?: unknown): Promise<void> {
    await this.write("info", message, meta);
  }

  async warn(message: string, meta?: unknown): Promise<void> {
    await this.write("warn", message, meta);
  }

  async error(message: string, meta?: unknown): Promise<void> {
    await this.write("error", message, meta);
  }

  private async write(level: LogLevel, message: string, meta?: unknown): Promise<void> {
    console[level === "debug" ? "log" : level](`[${level.toUpperCase()}]${this.appId ? ` [${this.appId}]` : ""} ${message}`);

    try {
      await this.prisma.systemLog.create({
        data: {
          guildId: this.guildId,
          appId: this.appId,
          level,
          message,
          meta: meta === undefined ? undefined : JSON.stringify(meta, null, 2)
        }
      });
    } catch (error) {
      console.error("Failed to write system log", error);
    }
  }
}
