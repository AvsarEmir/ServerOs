import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AppCommandBuilder, AppDependency, ServerOSApp } from "./types.js";
import {
  SERVEROS_CATEGORIES,
  currentServerOSVersion,
  validateAppDirectory
} from "./AppManifest.js";

export { SERVEROS_CATEGORIES } from "./AppManifest.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface AppRegistryOptions {
  appDirectories?: string[];
  safeMode?: boolean;
  safeAppIds?: string[];
}

export interface AppLoadIssue {
  appId: string;
  sourceDirectory: string;
  status: "broken";
  message: string;
}

export class AppRegistry {
  private apps = new Map<string, ServerOSApp>();
  private commandToApp = new Map<string, string>();
  private issues: AppLoadIssue[] = [];
  private appSources = new Map<string, string>();
  private appDirectories: string[];
  private safeMode: boolean;
  private safeAppIds: Set<string>;

  constructor(options: AppRegistryOptions = {}) {
    this.appDirectories = options.appDirectories ?? [path.resolve(__dirname, "../../apps")];
    this.safeMode = options.safeMode ?? false;
    this.safeAppIds = new Set(options.safeAppIds ?? ["terminal"]);
  }

  async load(): Promise<void> {
    this.apps.clear();
    this.commandToApp.clear();
    this.issues = [];
    this.appSources.clear();

    for (const appsDir of this.appDirectories) {
      if (!fs.existsSync(appsDir)) {
        continue;
      }

      const appFolders = fs
        .readdirSync(appsDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))
        .filter((entry) => !this.safeMode || this.safeAppIds.has(entry.name));

      for (const folder of appFolders) {
        const appPath = path.join(appsDir, folder.name);
        const validation = await validateAppDirectory(appPath, {
          expectedAppId: folder.name,
          serverosVersion: currentServerOSVersion()
        });

        if (!validation.runtimeApp || validation.errors.length) {
          this.recordIssue(folder.name, appPath, validation.errors.join("; "));
          continue;
        }

        try {
          this.registerApp(validation.runtimeApp, appPath);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.recordIssue(folder.name, appPath, message);
        }
      }
    }

    this.validateDependencyGraph();
  }

  all(): ServerOSApp[] {
    return [...this.apps.values()].sort((a, b) => a.metadata.name.localeCompare(b.metadata.name));
  }

  loadIssues(): string[] {
    return this.issues.map((issue) => `${issue.appId}: ${issue.message}`);
  }

  loadIssueDetails(): AppLoadIssue[] {
    return this.issues.map((issue) => ({ ...issue }));
  }

  get(appId: string): ServerOSApp | undefined {
    return this.apps.get(appId);
  }

  getByCommand(commandName: string): ServerOSApp | undefined {
    const appId = this.commandToApp.get(commandName);
    return appId ? this.apps.get(appId) : undefined;
  }

  commands(): AppCommandBuilder[] {
    return this.all().flatMap((app) => app.commands ?? []);
  }

  systemCommands(): AppCommandBuilder[] {
    return this.all()
      .filter((app) => app.metadata.system)
      .flatMap((app) => app.commands ?? []);
  }

  commandsForInstalled(installedAppIds: string[]): AppCommandBuilder[] {
    const installed = new Set(installedAppIds);
    return this.all()
      .filter((app) => app.metadata.system || installed.has(app.metadata.id))
      .flatMap((app) => app.commands ?? []);
  }

  categories(apps = this.all()): string[] {
    return [...new Set(apps.map((app) => app.metadata.category || "Custom"))].sort();
  }

  appsByCategory(category: string, apps = this.all()): ServerOSApp[] {
    return apps.filter((app) => app.metadata.category === category);
  }

  dependencyIds(app: ServerOSApp): string[] {
    return this.normalizeDependencies(app.metadata.dependencies).map((dependency) => dependency.id);
  }

  requiredDependencyIds(app: ServerOSApp): string[] {
    return this.normalizeDependencies(app.metadata.dependencies)
      .filter((dependency) => !dependency.optional)
      .map((dependency) => dependency.id);
  }

  dependencyLabel(app: ServerOSApp): string {
    const dependencies = this.normalizeDependencies(app.metadata.dependencies);
    if (!dependencies.length) {
      return "None";
    }

    return dependencies
      .map((dependency) => `${dependency.id}${dependency.optional ? " (optional)" : ""}${dependency.reason ? ` — ${dependency.reason}` : ""}`)
      .join(", ");
  }

  dependentsOf(appId: string, apps = this.all()): ServerOSApp[] {
    return apps.filter((app) => this.requiredDependencyIds(app).includes(appId));
  }

  private normalizeDependencies(dependencies: AppDependency[] = []): Array<{ id: string; optional?: boolean; reason?: string }> {
    return dependencies.map((dependency) => {
      if (typeof dependency === "string") {
        return { id: dependency };
      }
      return dependency;
    });
  }

  private commandName(command: AppCommandBuilder): string {
    const data = command.toJSON();
    if (!data.name) {
      throw new Error("Command builder has no name");
    }
    return data.name;
  }

  private registerApp(app: ServerOSApp, sourceDirectory: string): void {
    if (this.apps.has(app.metadata.id)) {
      throw new Error(`Duplicate app id: ${app.metadata.id}`);
    }

    const commandNames = (app.commands ?? []).map((command) => this.commandName(command));
    const uniqueCommandNames = new Set(commandNames);
    if (uniqueCommandNames.size !== commandNames.length) {
      throw new Error(`App defines the same slash command more than once: ${app.metadata.id}`);
    }

    for (const name of commandNames) {
      if (this.commandToApp.has(name)) {
        throw new Error(`Duplicate slash command name: /${name}`);
      }
    }

    this.apps.set(app.metadata.id, app);
    this.appSources.set(app.metadata.id, sourceDirectory);
    for (const name of commandNames) {
      this.commandToApp.set(name, app.metadata.id);
    }
  }

  private unregisterApp(appId: string): void {
    this.apps.delete(appId);
    this.appSources.delete(appId);
    for (const [commandName, ownerAppId] of this.commandToApp) {
      if (ownerAppId === appId) {
        this.commandToApp.delete(commandName);
      }
    }
  }

  private validateDependencyGraph(): void {
    while (true) {
      const missingDependencies = this.all()
        .map((app) => ({
          app,
          missing: this.requiredDependencyIds(app).filter((dependencyId) => !this.apps.has(dependencyId))
        }))
        .filter((item) => item.missing.length > 0);

      if (missingDependencies.length) {
        for (const item of missingDependencies) {
          this.recordIssue(
            item.app.metadata.id,
            this.appSources.get(item.app.metadata.id) ?? "",
            `Missing required dependencies: ${item.missing.join(", ")}`
          );
          this.unregisterApp(item.app.metadata.id);
        }
        continue;
      }

      const cycles = this.findDependencyCycles();
      if (!cycles.length) {
        return;
      }

      for (const cycle of cycles) {
        const members = [...new Set(cycle.slice(0, -1))];
        const path = cycle.join(" -> ");
        for (const appId of members) {
          if (this.apps.has(appId)) {
            this.recordIssue(appId, this.appSources.get(appId) ?? "", `Dependency cycle detected: ${path}`);
            this.unregisterApp(appId);
          }
        }
      }
    }
  }

  private findDependencyCycles(): string[][] {
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const stack: string[] = [];
    const cycles: string[][] = [];

    const visit = (appId: string): void => {
      if (visiting.has(appId)) {
        const start = stack.indexOf(appId);
        cycles.push([...stack.slice(start), appId]);
        return;
      }

      if (visited.has(appId)) {
        return;
      }

      visiting.add(appId);
      stack.push(appId);
      const app = this.apps.get(appId);
      if (app) {
        for (const dependencyId of this.requiredDependencyIds(app)) {
          visit(dependencyId);
        }
      }
      stack.pop();
      visiting.delete(appId);
      visited.add(appId);
    };

    for (const appId of this.apps.keys()) {
      visit(appId);
    }

    return cycles;
  }

  private recordIssue(appId: string, sourceDirectory: string, message: string): void {
    this.issues.push({
      appId,
      sourceDirectory,
      status: "broken",
      message
    });
  }

}
