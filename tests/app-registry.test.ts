import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { AppRegistry } from "../src/core/runtime/AppRegistry.js";

type TestAppOptions = {
  id: string;
  name: string;
  command?: string;
  duplicateCommand?: boolean;
  dependencies?: string[];
};

function appModule(options: TestAppOptions): string {
  const commands = options.command
    ? `commands: [
        { toJSON() { return { name: "${options.command}" }; } }${options.duplicateCommand ? `,
        { toJSON() { return { name: "${options.command}" }; } }` : ""}
      ],`
    : "";

  return `const app = {
    metadata: {
      id: "${options.id}",
      name: "${options.name}",
      icon: "🧩",
      version: "1.0.0",
      author: "ServerOS Test",
      description: "Test app",
      category: "Custom",
      dependencies: ${JSON.stringify(options.dependencies ?? [])}
    },
    ${commands}
    async open() {}
  };
  export default app;
  `;
}

function writeApp(root: string, folder: string, options: TestAppOptions): void {
  const directory = path.join(root, folder);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, "index.mjs"), appModule(options));
  fs.writeFileSync(path.join(directory, "serveros.app.json"), JSON.stringify({
    schemaVersion: 1,
    id: options.id,
    name: options.name,
    version: "1.0.0",
    description: "Test app",
    icon: "🧩",
    category: "Custom",
    entry: "index.mjs",
    serveros: { minVersion: "0.1.5" },
    publisher: { name: "ServerOS Test" },
    permissions: [],
    dependencies: options.dependencies ?? [],
    commands: options.command ? [options.command] : []
  }));
}

test("loads the project apps without registry errors", async () => {
  const registry = new AppRegistry();
  await registry.load();

  const ids = new Set(registry.all().map((app) => app.metadata.id));
  for (const id of ["my-app", "notes", "tasks", "terminal", "vault"]) {
    assert.equal(ids.has(id), true, `Expected ${id} to be registered`);
  }

  assert.deepEqual(registry.loadIssues(), []);
  assert.equal(registry.commands().length > 0, true);
});

test("rejects broken and conflicting apps without partial registration", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "serveros-registry-"));

  try {
    writeApp(root, "alpha", { id: "alpha", name: "Alpha", command: "shared" });
    writeApp(root, "beta", { id: "beta", name: "Beta", command: "shared" });
    writeApp(root, "gamma", { id: "gamma", name: "Gamma", command: "gamma", duplicateCommand: true });
    fs.mkdirSync(path.join(root, "missing-entry"));

    const registry = new AppRegistry({ appDirectories: [root] });
    await registry.load();

    assert.deepEqual(registry.all().map((app) => app.metadata.id), ["alpha"]);
    assert.equal(registry.getByCommand("shared")?.metadata.id, "alpha");
    assert.equal(registry.get("beta"), undefined);
    assert.equal(registry.get("gamma"), undefined);
    assert.equal(registry.loadIssues().some((issue) => issue.includes("Duplicate slash command name: /shared")), true);
    assert.equal(registry.loadIssues().some((issue) => issue.includes("manifest commands do not match runtime app")), true);
    assert.equal(registry.loadIssues().some((issue) => issue.includes("Missing serveros.app.json")), true);
    assert.equal(registry.loadIssueDetails().every((issue) => issue.status === "broken"), true);
    assert.equal(registry.loadIssueDetails().every((issue) => path.isAbsolute(issue.sourceDirectory)), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("combines apps from multiple application directories", async () => {
  const firstRoot = fs.mkdtempSync(path.join(os.tmpdir(), "serveros-apps-first-"));
  const secondRoot = fs.mkdtempSync(path.join(os.tmpdir(), "serveros-apps-second-"));

  try {
    writeApp(firstRoot, "first", { id: "first", name: "First" });
    writeApp(secondRoot, "second", { id: "second", name: "Second" });

    const registry = new AppRegistry({ appDirectories: [firstRoot, secondRoot] });
    await registry.load();

    assert.deepEqual(registry.all().map((app) => app.metadata.id), ["first", "second"]);
    assert.deepEqual(registry.loadIssues(), []);
  } finally {
    fs.rmSync(firstRoot, { recursive: true, force: true });
    fs.rmSync(secondRoot, { recursive: true, force: true });
  }
});

test("safe mode loads only explicitly allowed app folders", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "serveros-safe-mode-"));

  try {
    writeApp(root, "terminal", { id: "terminal", name: "Terminal" });
    writeApp(root, "community", { id: "community", name: "Community" });

    const registry = new AppRegistry({
      appDirectories: [root],
      safeMode: true,
      safeAppIds: ["terminal"]
    });
    await registry.load();

    assert.deepEqual(registry.all().map((app) => app.metadata.id), ["terminal"]);
    assert.deepEqual(registry.loadIssues(), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("rejects missing and circular dependency graphs", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "serveros-dependencies-"));

  try {
    writeApp(root, "base", { id: "base", name: "Base" });
    writeApp(root, "missing", { id: "missing", name: "Missing", dependencies: ["not-found"] });
    writeApp(root, "child", { id: "child", name: "Child", dependencies: ["missing"] });
    writeApp(root, "cycle-a", { id: "cycle-a", name: "Cycle A", dependencies: ["cycle-b"] });
    writeApp(root, "cycle-b", { id: "cycle-b", name: "Cycle B", dependencies: ["cycle-a"] });

    const registry = new AppRegistry({ appDirectories: [root] });
    await registry.load();

    assert.deepEqual(registry.all().map((app) => app.metadata.id), ["base"]);
    assert.equal(registry.loadIssues().some((issue) => issue.includes("missing: Missing required dependencies: not-found")), true);
    assert.equal(registry.loadIssues().some((issue) => issue.includes("child: Missing required dependencies: missing")), true);
    assert.equal(registry.loadIssues().filter((issue) => issue.includes("Dependency cycle detected")).length, 2);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
