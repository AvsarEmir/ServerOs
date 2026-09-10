import type { PrismaClient } from "@prisma/client";

export class AppStorage {
  constructor(
    private prisma: PrismaClient,
    private guildId: string,
    private appId: string
  ) {}

  async get<T>(key: string, fallback: T): Promise<T> {
    const item = await this.prisma.appStorage.findUnique({
      where: {
        guildId_appId_key: {
          guildId: this.guildId,
          appId: this.appId,
          key
        }
      }
    });

    if (!item) {
      return fallback;
    }

    try {
      return JSON.parse(item.value) as T;
    } catch {
      return fallback;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    await this.prisma.appStorage.upsert({
      where: {
        guildId_appId_key: {
          guildId: this.guildId,
          appId: this.appId,
          key
        }
      },
      create: {
        guildId: this.guildId,
        appId: this.appId,
        key,
        value: JSON.stringify(value)
      },
      update: {
        value: JSON.stringify(value)
      }
    });
  }

  async delete(key: string): Promise<void> {
    await this.prisma.appStorage.deleteMany({
      where: {
        guildId: this.guildId,
        appId: this.appId,
        key
      }
    });
  }
}
