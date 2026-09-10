import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { APPS_DIR, assertValidAppId, positionalArgs, walkFiles } from "./app-utils.js";

function usage(): void {
  console.log(`Run isolated ServerOS app tests.\n\nUsage:\n  npm run app:test\n  npm run app:test <app-id>\n\nExamples:\n  npm run app:test\n  npm run app:test notes`);
}

function appDirectories(requestedId?: string): string[] {
  if (requestedId) {
    assertValidAppId(requestedId);
    const directory = path.join(APPS_DIR, requestedId);
    if (!fs.existsSync(directory)) {
      throw new Error(`App does not exist: src/apps/${requestedId}`);
    }
    return [directory];
  }
  return fs.readdirSync(APPS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))
    .map((entry) => path.join(APPS_DIR, entry.name));
}

function main(): void {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    usage();
    return;
  }
  const requestedId = positionalArgs()[0];
  const directories = appDirectories(requestedId);
  const testFiles = directories.flatMap((directory) => walkFiles(directory))
    .filter((file) => /(?:^|[\\/])[^\\/]+\.test\.ts$/i.test(file))
    .sort();
  if (!testFiles.length) {
    throw new Error(requestedId ? `No app tests found for: ${requestedId}` : "No app tests found");
  }

  const tsxCli = path.resolve(process.cwd(), "node_modules/tsx/dist/cli.mjs");
  const result = spawnSync(process.execPath, [tsxCli, "--test", ...testFiles], {
    cwd: process.cwd(),
    stdio: "inherit"
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
