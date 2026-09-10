import fs from "node:fs";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import path from "node:path";
import { currentServerOSVersion, loadAppManifest, validateAppDirectory } from "../src/core/runtime/AppManifest.js";
import {
  argValue,
  appDir,
  assertValidAppId,
  commandNameFromAppId,
  copyDirectory,
  escapeRegExp,
  normalizeAppId,
  positionalArgs,
  readJsonFile,
  toClassName,
  toTitle,
  walkFiles,
  writeJsonFile
} from "./app-utils.js";

type AppManifest = Record<string, unknown> & {
  id?: string;
  name?: string;
  commands?: string[];
  publisher?: {
    name?: string;
    github?: string;
  };
};

function usage(): void {
  console.log(`Duplicate a ServerOS app folder.\n\nUsage:\n  npm run app:duplicate <source-app-id> <new-app-id>\n\nOptions:\n  --name "New App Name"       Override generated display name\n  --author "Author Name"      Override manifest author\n\nExamples:\n  npm run app:duplicate weather weather-pro\n  npm run app:duplicate notes team-notes -- --name "Team Notes"`);
}

function replaceAllSafe(content: string, from: string | undefined, to: string | undefined): string {
  if (!from || !to || from === to) return content;
  return content.replace(new RegExp(escapeRegExp(from), "g"), to);
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    usage();
    return;
  }

  const args = positionalArgs();
  const rl = readline.createInterface({ input, output });
  let createdTargetDir: string | undefined;

  try {
    const sourceInput = args[0] || (await rl.question("Source app id: "));
    const targetInput = args[1] || (await rl.question("New app id: "));
    const sourceId = normalizeAppId(sourceInput);
    const targetId = normalizeAppId(targetInput);

    assertValidAppId(sourceId);
    assertValidAppId(targetId);

    if (sourceId === targetId) {
      throw new Error("Source and target app ids must be different.");
    }

    const sourceDir = appDir(sourceId);
    const targetDir = appDir(targetId);

    if (!fs.existsSync(sourceDir)) {
      throw new Error(`Source app does not exist: src/apps/${sourceId}`);
    }

    if (fs.existsSync(targetDir)) {
      throw new Error(`Target app already exists: src/apps/${targetId}`);
    }

    const sourceManifestPath = path.join(sourceDir, "serveros.app.json");
    const sourceValidation = loadAppManifest(sourceManifestPath, {
      appDirectory: sourceDir,
      serverosVersion: currentServerOSVersion()
    });
    const sourceManifest = sourceValidation.manifest;
    if (!sourceManifest) {
      throw new Error(`Source manifest is invalid: ${sourceValidation.errors.join("; ")}`);
    }
    if (sourceManifest.system) {
      throw new Error("System apps cannot be duplicated into custom apps.");
    }

    const sourceName = sourceManifest.name || toTitle(sourceId);
    const targetName = argValue("name") || toTitle(targetId);
    const sourceCommand = sourceManifest.commands[0] || commandNameFromAppId(sourceId);
    const targetCommand = commandNameFromAppId(targetId);
    const sourceAuthor = sourceManifest.publisher.name;
    const targetAuthor = argValue("author") || sourceAuthor || "ServerOS Developer";
    const sourceClass = toClassName(sourceName);
    const targetClass = toClassName(targetName);

    copyDirectory(sourceDir, targetDir);
    createdTargetDir = targetDir;

    for (const file of walkFiles(targetDir)) {
      if (!/[.](ts|tsx|js|jsx|json|md|txt)$/i.test(file)) continue;
      let content = fs.readFileSync(file, "utf8");
      content = replaceAllSafe(content, sourceId, targetId);
      content = replaceAllSafe(content, sourceCommand, targetCommand);
      content = replaceAllSafe(content, sourceName, targetName);
      content = replaceAllSafe(content, sourceAuthor, targetAuthor);
      content = replaceAllSafe(content, sourceClass, targetClass);
      fs.writeFileSync(file, content);
    }

    const manifestPath = path.join(targetDir, "serveros.app.json");
    const manifest = readJsonFile<AppManifest>(manifestPath) ?? {};
    writeJsonFile(manifestPath, {
      ...manifest,
      id: targetId,
      name: targetName,
      commands: Array.isArray(manifest.commands)
        ? manifest.commands.map((command) => command === sourceCommand ? targetCommand : command)
        : [targetCommand],
      publisher: {
        name: targetAuthor
      },
      repository: undefined,
      support: undefined,
      releaseChannel: "development"
    });

    const targetValidation = await validateAppDirectory(targetDir, {
      expectedAppId: targetId,
      serverosVersion: currentServerOSVersion()
    });
    if (!targetValidation.runtimeApp || targetValidation.errors.length) {
      throw new Error(`Duplicated app is invalid: ${targetValidation.errors.join("; ")}`);
    }

    console.log(`Duplicated ServerOS app: src/apps/${sourceId} -> src/apps/${targetId}`);
    console.log(`Display name: ${targetName}`);
    console.log(`Command suggestion: /${targetCommand}`);
    console.log("Next steps:");
    console.log("1. Review the generated files and adjust custom logic if needed.");
    console.log("2. npm run deploy:commands");
    console.log("3. npm run dev");
  } catch (error) {
    if (createdTargetDir && fs.existsSync(createdTargetDir)) {
      fs.rmSync(createdTargetDir, { recursive: true, force: true });
    }
    throw error;
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
