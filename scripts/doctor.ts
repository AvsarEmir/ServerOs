import fs from "node:fs";
import path from "node:path";
import { AppRegistry } from "../src/core/runtime/AppRegistry.js";
import { currentServerOSVersion } from "../src/core/runtime/AppManifest.js";
import { APPS_DIR, hasFlag, walkFiles } from "./app-utils.js";

type DoctorStatus = "pass" | "warn" | "fail";

interface DoctorCheck {
  id: string;
  status: DoctorStatus;
  message: string;
}

interface DoctorReport {
  ok: boolean;
  projectDirectory: string;
  serverosVersion: string;
  checks: DoctorCheck[];
  summary: Record<DoctorStatus, number>;
}

function readJson(filePath: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function readEnvironmentKeys(filePath: string): Set<string> {
  if (!fs.existsSync(filePath)) {
    return new Set();
  }
  const keys = new Set<string>();
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (match) {
      keys.add(match[1]);
    }
  }
  return keys;
}

function add(checks: DoctorCheck[], id: string, status: DoctorStatus, message: string): void {
  checks.push({ id, status, message });
}

async function buildReport(): Promise<DoctorReport> {
  const checks: DoctorCheck[] = [];
  const projectDirectory = path.resolve(process.cwd());
  const packagePath = path.join(projectDirectory, "package.json");
  const lockPath = path.join(projectDirectory, "package-lock.json");
  const schemaPath = path.join(projectDirectory, "schemas/serveros.app.schema.json");
  const prismaSchemaPath = path.join(projectDirectory, "prisma/schema.prisma");
  const packageJson = readJson(packagePath);
  const lockJson = readJson(lockPath);
  const schemaJson = readJson(schemaPath);

  if (packageJson?.name === "serveros" && packageJson.version === currentServerOSVersion()) {
    add(checks, "package", "pass", `package.json identifies ServerOS ${currentServerOSVersion()}`);
  } else {
    add(checks, "package", "fail", "package.json is missing, invalid or inconsistent");
  }

  const nodeMajor = Number(process.versions.node.split(".")[0]);
  add(checks, "node", nodeMajor >= 20 ? "pass" : "fail", `Node.js ${process.versions.node}${nodeMajor >= 20 ? " satisfies >=20" : " is below the required version"}`);

  const lockVersion = isRecord(lockJson?.packages) && isRecord(lockJson.packages[""]) ? lockJson.packages[""].version : undefined;
  add(
    checks,
    "lockfile",
    lockJson && lockVersion === packageJson?.version ? "pass" : "fail",
    lockJson && lockVersion === packageJson?.version ? "package-lock.json matches package.json" : "package-lock.json is missing or version-mismatched"
  );

  add(checks, "manifest-schema", schemaJson?.title === "ServerOS App Manifest" ? "pass" : "fail", schemaJson?.title === "ServerOS App Manifest" ? "Canonical app manifest schema is readable" : "Canonical app manifest schema is missing or invalid");
  add(checks, "prisma-schema", fs.existsSync(prismaSchemaPath) ? "pass" : "fail", fs.existsSync(prismaSchemaPath) ? "Prisma schema is present" : "Prisma schema is missing");
  const prismaClientPath = path.join(projectDirectory, "node_modules/@prisma/client/index.js");
  add(checks, "prisma-client", fs.existsSync(prismaClientPath) ? "pass" : "fail", fs.existsSync(prismaClientPath) ? "Prisma client is generated" : "Prisma client is missing; run npm run db:generate");

  const exampleKeys = readEnvironmentKeys(path.join(projectDirectory, ".env.example"));
  const requiredExampleKeys = ["DISCORD_TOKEN", "DISCORD_CLIENT_ID", "DATABASE_URL", "APP_CRASH_THRESHOLD", "SERVEROS_SAFE_MODE"];
  const missingExampleKeys = requiredExampleKeys.filter((key) => !exampleKeys.has(key));
  add(checks, "env-example", missingExampleKeys.length ? "fail" : "pass", missingExampleKeys.length ? `.env.example is missing keys: ${missingExampleKeys.join(", ")}` : ".env.example documents required runtime settings");

  const envPath = path.join(projectDirectory, ".env");
  const envKeys = readEnvironmentKeys(envPath);
  const missingRuntimeKeys = ["DISCORD_TOKEN", "DISCORD_CLIENT_ID", "DATABASE_URL"].filter((key) => !envKeys.has(key));
  add(
    checks,
    "environment",
    !fs.existsSync(envPath) || missingRuntimeKeys.length ? "warn" : "pass",
    !fs.existsSync(envPath)
      ? ".env is absent; copy .env.example before starting the bot"
      : missingRuntimeKeys.length
        ? `.env is missing keys: ${missingRuntimeKeys.join(", ")}`
        : ".env contains the required key names"
  );

  if (!fs.existsSync(APPS_DIR)) {
    add(checks, "apps", "fail", "src/apps is missing");
  } else {
    const registry = new AppRegistry({ appDirectories: [APPS_DIR] });
    await registry.load();
    const issues = registry.loadIssues();
    add(checks, "apps", issues.length ? "fail" : "pass", issues.length ? `App validation errors: ${issues.join(" | ")}` : `${registry.all().length} app(s) load successfully`);

    const appDirectories = fs.readdirSync(APPS_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))
      .map((entry) => path.join(APPS_DIR, entry.name));
    const withoutTests = appDirectories
      .filter((directory) => !walkFiles(directory).some((file) => file.endsWith(".test.ts")))
      .map((directory) => path.basename(directory));
    add(checks, "app-tests", withoutTests.length ? "warn" : "pass", withoutTests.length ? `Apps without tests: ${withoutTests.join(", ")}` : "Every app has at least one test file");

    const distAppsDirectory = path.join(projectDirectory, "dist/apps");
    const staleCompiledApps = appDirectories
      .map((directory) => path.basename(directory))
      .filter((appId) => !fs.existsSync(path.join(distAppsDirectory, appId, "serveros.app.json")));
    add(checks, "dist", staleCompiledApps.length ? "warn" : "pass", staleCompiledApps.length ? `Compiled app output is missing for: ${staleCompiledApps.join(", ")}; run npm run build` : "Compiled app manifests are present");
  }

  add(checks, "git", fs.existsSync(path.join(projectDirectory, ".git")) ? "pass" : "warn", fs.existsSync(path.join(projectDirectory, ".git")) ? "Git repository metadata is present" : "Git repository is not initialized in this folder");

  const summary: Record<DoctorStatus, number> = { pass: 0, warn: 0, fail: 0 };
  for (const check of checks) {
    summary[check.status] += 1;
  }
  return {
    ok: summary.fail === 0,
    projectDirectory,
    serverosVersion: currentServerOSVersion(),
    checks,
    summary
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const report = await buildReport();
if (hasFlag("json")) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`ServerOS ${report.serverosVersion} project doctor`);
  for (const check of report.checks) {
    console.log(`${check.status.toUpperCase()} ${check.id}: ${check.message}`);
  }
  console.log(`${report.summary.pass} passed, ${report.summary.warn} warning(s), ${report.summary.fail} failure(s)`);
}
if (!report.ok) {
  process.exitCode = 1;
}
