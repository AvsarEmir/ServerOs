import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { APP_TEMPLATES, getTemplate, type AppTemplateId } from "./app-templates.js";
import { argValue, appDir, commandNameFromAppId, normalizeAppId, toClassName, toTitle } from "./app-utils.js";
import { currentServerOSVersion, validateAppDirectory } from "../src/core/runtime/AppManifest.js";

async function promptMissing(rawName?: string, rawTemplate?: string, rawAuthor?: string) {
  const interactive = !rawName;
  const rl = readline.createInterface({ input, output });

  try {
    const name = rawName || (await rl.question("App name: "));
    const appId = normalizeAppId(name);
    if (!appId) {
      throw new Error("Invalid app name.");
    }

    const templateList = APP_TEMPLATES.map((template) => `${template.id} (${template.name})`).join(", ");
    const templateAnswer = rawTemplate || (interactive ? await rl.question(`Template [simple] — ${templateList}: `) : "simple") || "simple";
    const template = getTemplate(templateAnswer) ?? getTemplate("simple");
    if (!template) {
      throw new Error(`Unknown template: ${templateAnswer}`);
    }

    const author = rawAuthor || (interactive ? await rl.question("Author [ServerOS Developer]: ") : "ServerOS Developer") || "ServerOS Developer";

    return { appId, template, author };
  } finally {
    rl.close();
  }
}

const positionalName = process.argv[2]?.startsWith("--") ? undefined : process.argv[2];
const rawTemplate = argValue("template") as AppTemplateId | undefined;
const rawAuthor = argValue("author");

const { appId, template, author } = await promptMissing(positionalName, rawTemplate, rawAuthor);
const appName = toTitle(appId);
const className = toClassName(appName);
const commandName = commandNameFromAppId(appId);
const dir = appDir(appId);

if (fs.existsSync(dir)) {
  console.error(`App already exists: ${dir}`);
  process.exit(1);
}

fs.mkdirSync(dir, { recursive: true });

const files = template.files({ appId, appName, className, commandName, author });
for (const [fileName, content] of Object.entries(files)) {
  fs.writeFileSync(path.join(dir, fileName), content);
}

const manifest = {
  $schema: "../../../schemas/serveros.app.schema.json",
  schemaVersion: 1,
  id: appId,
  name: appName,
  version: "1.0.0",
  description: template.appDescription,
  icon: template.icon,
  category: template.category,
  entry: "index.ts",
  serveros: {
    minVersion: currentServerOSVersion()
  },
  publisher: {
    name: author
  },
  permissions: template.permissions,
  dependencies: [],
  commands: [commandName],
  resources: template.permissions.includes("storage:write")
    ? { storage: { maxBytes: 5242880 } }
    : undefined,
  license: "MIT",
  template: template.id,
  releaseChannel: "development"
};

const manifestPath = path.join(dir, "serveros.app.json");
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

const validation = await validateAppDirectory(dir, {
  expectedAppId: appId,
  serverosVersion: currentServerOSVersion()
});
if (!validation.runtimeApp || validation.errors.length) {
  fs.rmSync(dir, { recursive: true, force: true });
  throw new Error(`Generated app is invalid: ${validation.errors.join("; ")}`);
}

console.log(`Created ServerOS app: src/apps/${appId}`);
console.log(`Template: ${template.id} — ${template.description}`);
console.log("Next steps:");
console.log("1. npm run deploy:commands");
console.log("2. npm run dev");
console.log("3. Open /os action:apps in Discord");
