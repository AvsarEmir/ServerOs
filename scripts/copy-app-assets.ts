import fs from "node:fs";
import path from "node:path";
import { APPS_DIR } from "./app-utils.js";

const outputAppsDirectory = path.resolve(process.cwd(), "dist/apps");

function copyAppAssets(sourceDirectory: string, targetDirectory: string): void {
  fs.mkdirSync(targetDirectory, { recursive: true });
  for (const entry of fs.readdirSync(sourceDirectory, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDirectory, entry.name);
    const targetPath = path.join(targetDirectory, entry.name);
    if (entry.isDirectory()) {
      copyAppAssets(sourcePath, targetPath);
      continue;
    }
    if (/\.(?:ts|tsx)$/i.test(entry.name)) {
      continue;
    }
    if (entry.name === "serveros.app.json") {
      const manifest = JSON.parse(fs.readFileSync(sourcePath, "utf8")) as Record<string, unknown>;
      if (typeof manifest.entry === "string") {
        manifest.entry = manifest.entry.replace(/\.(?:ts|tsx)$/i, ".js");
      }
      fs.writeFileSync(targetPath, `${JSON.stringify(manifest, null, 2)}\n`);
      continue;
    }
    fs.copyFileSync(sourcePath, targetPath);
  }
}

for (const entry of fs.readdirSync(APPS_DIR, { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name.startsWith("_")) {
    continue;
  }
  copyAppAssets(path.join(APPS_DIR, entry.name), path.join(outputAppsDirectory, entry.name));
}
