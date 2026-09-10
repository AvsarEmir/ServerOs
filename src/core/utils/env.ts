import "dotenv/config";

const required = ["DISCORD_TOKEN", "DISCORD_CLIENT_ID"] as const;

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function booleanValue(value: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes((value ?? "").trim().toLowerCase());
}

function listValue(value: string | undefined, fallback: string[]): string[] {
  const items = (value ?? "").split(",").map((item) => item.trim()).filter(Boolean);
  return items.length ? items : fallback;
}

export const env = {
  discordToken: process.env.DISCORD_TOKEN!,
  discordClientId: process.env.DISCORD_CLIENT_ID!,
  discordGuildId: process.env.DISCORD_GUILD_ID || undefined,
  logLevel: process.env.LOG_LEVEL || "info",
  appCrashThreshold: positiveInteger(process.env.APP_CRASH_THRESHOLD, 3),
  safeMode: booleanValue(process.env.SERVEROS_SAFE_MODE),
  safeAppIds: listValue(process.env.SERVEROS_SAFE_APPS, ["terminal"])
};
