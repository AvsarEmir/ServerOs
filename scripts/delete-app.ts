import fs from "node:fs";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { appDir, assertValidAppId, BUILT_IN_APPS, hasFlag, normalizeAppId, positionalArgs } from "./app-utils.js";

function usage(): void {
  console.log(`Delete a ServerOS app folder.\n\nUsage:\n  npm run app:delete <app-id> -- --yes\n\nOptions:\n  --yes       Skip confirmation\n  --force     Allow deleting built-in apps\n\nExamples:\n  npm run app:delete weather -- --yes\n  npm run app:delete custom-dashboard`);
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    usage();
    return;
  }

  const args = positionalArgs();
  const rl = readline.createInterface({ input, output });

  try {
    const appInput = args[0] || (await rl.question("App id to delete: "));
    const appId = normalizeAppId(appInput);
    assertValidAppId(appId);

    const dir = appDir(appId);
    if (!fs.existsSync(dir)) {
      throw new Error(`App does not exist: src/apps/${appId}`);
    }

    if (BUILT_IN_APPS.has(appId) && !hasFlag("force")) {
      throw new Error(`Refusing to delete built-in app '${appId}'. Use --force only if you really want to remove it from the source tree.`);
    }

    if (!hasFlag("yes")) {
      const answer = await rl.question(`Delete src/apps/${appId}? This removes the source folder only. Type '${appId}' to confirm: `);
      if (answer.trim() !== appId) {
        console.log("Delete cancelled.");
        return;
      }
    }

    fs.rmSync(dir, { recursive: true, force: true });
    console.log(`Deleted ServerOS app folder: src/apps/${appId}`);
    console.log("Next steps:");
    console.log("1. npm run deploy:commands");
    console.log("2. Restart ServerOS so the app registry reloads.");
    console.log("Note: existing database rows for this app are not removed automatically.");
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
