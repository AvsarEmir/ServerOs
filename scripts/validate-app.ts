import fs from "node:fs";
import path from "node:path";
import { AppRegistry } from "../src/core/runtime/AppRegistry.js";
import { currentServerOSVersion, loadAppManifest } from "../src/core/runtime/AppManifest.js";
import { APPS_DIR, assertValidAppId, hasFlag, positionalArgs } from "./app-utils.js";

interface ValidationReport {
  ok: boolean;
  serverosVersion: string;
  apps: Array<{
    id: string;
    directory: string;
    valid: boolean;
    version?: string;
    commands?: string[];
    errors: string[];
  }>;
}

function usage(): void {
  console.log(`Validate ServerOS apps.\n\nUsage:\n  npm run app:validate\n  npm run app:validate <app-id>\n\nOptions:\n  --json       Print a machine-readable report\n\nExamples:\n  npm run app:validate\n  npm run app:validate notes\n  npm run app:validate -- --json`);
}

async function main(): Promise<void> {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    usage();
    return;
  }

  const requestedId = positionalArgs()[0];
  if (requestedId) {
    assertValidAppId(requestedId);
  }
  if (!fs.existsSync(APPS_DIR)) {
    throw new Error(`Apps directory does not exist: ${APPS_DIR}`);
  }

  const folders = fs.readdirSync(APPS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))
    .map((entry) => entry.name)
    .sort();
  if (requestedId && !folders.includes(requestedId)) {
    throw new Error(`App does not exist: src/apps/${requestedId}`);
  }

  const selectedFolders = requestedId ? [requestedId] : folders;
  const registry = new AppRegistry({ appDirectories: [APPS_DIR] });
  await registry.load();
  const issuesByDirectory = new Map<string, string[]>();
  for (const issue of registry.loadIssueDetails()) {
    const source = path.resolve(issue.sourceDirectory);
    const current = issuesByDirectory.get(source) ?? [];
    current.push(issue.message);
    issuesByDirectory.set(source, current);
  }

  const commandOwners = new Map<string, string[]>();
  for (const folder of folders) {
    const directory = path.join(APPS_DIR, folder);
    const loaded = loadAppManifest(path.join(directory, "serveros.app.json"), {
      appDirectory: directory,
      expectedAppId: folder,
      serverosVersion: currentServerOSVersion()
    });
    for (const command of loaded.manifest?.commands ?? []) {
      const owners = commandOwners.get(command) ?? [];
      owners.push(folder);
      commandOwners.set(command, owners);
    }
  }

  const loadedApps = new Map(registry.all().map((app) => [app.metadata.id, app]));
  const report: ValidationReport = {
    ok: true,
    serverosVersion: currentServerOSVersion(),
    apps: selectedFolders.map((folder) => {
      const directory = path.join(APPS_DIR, folder);
      const errors = [...(issuesByDirectory.get(path.resolve(directory)) ?? [])];
      const manifestResult = loadAppManifest(path.join(directory, "serveros.app.json"), {
        appDirectory: directory,
        expectedAppId: folder,
        serverosVersion: currentServerOSVersion()
      });
      for (const command of manifestResult.manifest?.commands ?? []) {
        const owners = commandOwners.get(command) ?? [];
        if (owners.length > 1) {
          errors.push(`Slash command /${command} conflicts with: ${owners.filter((owner) => owner !== folder).join(", ")}`);
        }
      }
      const uniqueErrors = [...new Set(errors)];
      const app = loadedApps.get(folder);
      return {
        id: folder,
        directory,
        valid: uniqueErrors.length === 0 && Boolean(app),
        version: manifestResult.manifest?.version,
        commands: manifestResult.manifest?.commands,
        errors: uniqueErrors
      };
    })
  };
  report.ok = report.apps.every((app) => app.valid);

  if (hasFlag("json")) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`ServerOS ${report.serverosVersion} app validation`);
    for (const app of report.apps) {
      if (app.valid) {
        const commands = app.commands?.length ? app.commands.map((command) => `/${command}`).join(", ") : "none";
        console.log(`PASS ${app.id} ${app.version ?? "unknown"} commands: ${commands}`);
        continue;
      }
      console.error(`FAIL ${app.id}`);
      for (const error of app.errors) {
        console.error(`  ${error}`);
      }
    }
    console.log(report.ok ? `Validated ${report.apps.length} app(s).` : `Validation failed for ${report.apps.filter((app) => !app.valid).length} app(s).`);
  }

  if (!report.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
