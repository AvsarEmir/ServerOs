import fs from "node:fs";
import path from "node:path";
import { AppRegistry } from "../dist/core/runtime/AppRegistry.js";

const sourceAppsDirectory = path.resolve(process.cwd(), "src/apps");
const expectedAppIds = fs.readdirSync(sourceAppsDirectory, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))
  .map((entry) => entry.name)
  .sort();

const registry = new AppRegistry();
await registry.load();
const actualAppIds = registry.all().map((app) => app.metadata.id).sort();
const issues = registry.loadIssues();

if (issues.length || JSON.stringify(actualAppIds) !== JSON.stringify(expectedAppIds)) {
  console.error(JSON.stringify({ expectedAppIds, actualAppIds, issues }, null, 2));
  process.exit(1);
}

console.log(`Validated ${actualAppIds.length} compiled app(s): ${actualAppIds.join(", ")}`);
