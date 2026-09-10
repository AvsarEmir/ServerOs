import fs from "node:fs";
import path from "node:path";

export const APPS_DIR = path.resolve(process.cwd(), "src/apps");

export const BUILT_IN_APPS = new Set(["notes", "tasks", "terminal", "vault"]);

export function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  const direct = process.argv.find((arg) => arg.startsWith(prefix));
  if (direct) return direct.slice(prefix.length);

  const index = process.argv.indexOf(`--${name}`);
  if (index !== -1) return process.argv[index + 1];
  return undefined;
}

export function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

export function positionalArgs(): string[] {
  return process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
}

export function normalizeAppId(rawName: string): string {
  return rawName
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
}

export function toTitle(appId: string): string {
  return appId
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function toClassName(appName: string): string {
  const safe = appName.replace(/[^a-zA-Z0-9]/g, "");
  return `${safe || "Custom"}App`;
}

export function commandNameFromAppId(appId: string): string {
  return appId.replace(/-/g, "").slice(0, 32);
}

export function appDir(appId: string): string {
  return path.join(APPS_DIR, appId);
}

export function assertValidAppId(appId: string): void {
  if (!/^[a-z0-9-]{2,32}$/.test(appId)) {
    throw new Error(`Invalid app id: ${appId}. Use 2-32 lowercase letters, numbers or dashes.`);
  }
}

export function readJsonFile<T extends Record<string, unknown>>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

export function writeJsonFile(filePath: string, value: Record<string, unknown>): void {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function copyDirectory(source: string, target: string): void {
  fs.mkdirSync(target, { recursive: true });

  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (["node_modules", "dist", ".git"].includes(entry.name)) {
      continue;
    }

    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(sourcePath, targetPath);
      continue;
    }

    fs.copyFileSync(sourcePath, targetPath);
  }
}

export function walkFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];

  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(full));
      continue;
    }
    files.push(full);
  }
  return files;
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
