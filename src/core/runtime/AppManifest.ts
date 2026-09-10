import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { AppCategory, AppDependency, AppSettingsSchema, ServerOSApp } from "./types.js";
import { APP_PERMISSIONS, type AppPermission } from "../system/PermissionManager.js";

export const SERVEROS_MANIFEST_SCHEMA_VERSION = 1;

export const SERVEROS_CATEGORIES = [
  "System",
  "Productivity",
  "Project Management",
  "Knowledge",
  "Automation",
  "Moderation",
  "Utility",
  "Developer",
  "Community",
  "Analytics",
  "Custom"
] as const;

export interface ServerOSVersionRequirement {
  minVersion: string;
  maxVersionExclusive?: string;
}

export interface ServerOSPublisher {
  name: string;
  github?: string;
}

export interface ServerOSAppResources {
  storage?: {
    maxBytes?: number;
  };
  network?: {
    hosts: string[];
  };
  events?: {
    publishes?: string[];
    subscribes?: string[];
  };
}

export interface ServerOSPackageSignature {
  algorithm: "Ed25519";
  keyId: string;
}

export interface ServerOSAppManifest {
  $schema?: string;
  schemaVersion: 1;
  id: string;
  name: string;
  version: string;
  description: string;
  icon: string;
  category: AppCategory | string;
  entry: string;
  serveros: ServerOSVersionRequirement;
  publisher: ServerOSPublisher;
  system?: boolean;
  permissions: AppPermission[];
  dependencies: AppDependency[];
  commands: string[];
  settings?: AppSettingsSchema;
  resources?: ServerOSAppResources;
  repository?: string;
  support?: string;
  license?: string;
  template?: string;
  releaseChannel?: "stable" | "beta" | "development";
  signature?: ServerOSPackageSignature;
}

export interface AppManifestValidationOptions {
  appDirectory?: string;
  expectedAppId?: string;
  runtimeApp?: ServerOSApp;
  serverosVersion?: string;
}

export interface AppManifestValidationResult {
  manifest?: ServerOSAppManifest;
  errors: string[];
}

export interface AppDirectoryValidationResult extends AppManifestValidationResult {
  runtimeApp?: ServerOSApp;
}

const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const APP_ID_PATTERN = /^[a-z0-9-]{2,32}$/;
const COMMAND_PATTERN = /^[a-z0-9_-]{1,32}$/;
const MANIFEST_FIELDS = new Set([
  "$schema",
  "schemaVersion",
  "id",
  "name",
  "version",
  "description",
  "icon",
  "category",
  "entry",
  "serveros",
  "publisher",
  "system",
  "permissions",
  "dependencies",
  "commands",
  "settings",
  "resources",
  "repository",
  "support",
  "license",
  "template",
  "releaseChannel",
  "signature"
]);

export function currentServerOSVersion(): string {
  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
  const packagePath = path.resolve(moduleDirectory, "../../../package.json");
  const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8")) as { version?: string };
  return packageJson.version ?? "0.0.0";
}

export function loadAppManifest(manifestPath: string, options: AppManifestValidationOptions = {}): AppManifestValidationResult {
  if (!fs.existsSync(manifestPath)) {
    return { errors: ["Missing serveros.app.json"] };
  }

  let value: unknown;
  try {
    value = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (error) {
    return { errors: [`Invalid manifest JSON: ${error instanceof Error ? error.message : String(error)}`] };
  }

  return validateAppManifest(value, options);
}

export async function validateAppDirectory(
  appDirectory: string,
  options: Omit<AppManifestValidationOptions, "appDirectory" | "runtimeApp"> = {}
): Promise<AppDirectoryValidationResult> {
  const manifestPath = path.join(appDirectory, "serveros.app.json");
  const manifestResult = loadAppManifest(manifestPath, {
    ...options,
    appDirectory
  });
  if (!manifestResult.manifest) {
    return manifestResult;
  }

  let runtimeApp: ServerOSApp | undefined;
  try {
    const entryPath = path.resolve(appDirectory, manifestResult.manifest.entry);
    const imported = await import(pathToFileURL(entryPath).href);
    const runtimeResult = validateRuntimeApp(imported.default);
    if (!runtimeResult.runtimeApp) {
      return {
        manifest: manifestResult.manifest,
        errors: runtimeResult.errors
      };
    }
    runtimeApp = runtimeResult.runtimeApp;
  } catch (error) {
    return {
      manifest: manifestResult.manifest,
      errors: [`Entry import failed: ${error instanceof Error ? error.message : String(error)}`]
    };
  }

  const runtimeValidation = validateAppManifest(manifestResult.manifest, {
    ...options,
    appDirectory,
    runtimeApp
  });
  return runtimeValidation.manifest
    ? { manifest: runtimeValidation.manifest, runtimeApp, errors: [] }
    : { manifest: manifestResult.manifest, runtimeApp, errors: runtimeValidation.errors };
}

export function validateAppManifest(value: unknown, options: AppManifestValidationOptions = {}): AppManifestValidationResult {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return { errors: ["Manifest root must be an object"] };
  }

  rejectUnknownFields(value, MANIFEST_FIELDS, "manifest", errors);

  requireExactNumber(value, "schemaVersion", SERVEROS_MANIFEST_SCHEMA_VERSION, errors);
  requireString(value, "id", errors);
  requireString(value, "name", errors);
  requireString(value, "version", errors);
  requireString(value, "description", errors);
  requireString(value, "icon", errors);
  requireString(value, "category", errors);
  requireString(value, "entry", errors);

  if (value.$schema !== undefined && typeof value.$schema !== "string") {
    errors.push("$schema must be a string");
  }

  if (typeof value.id === "string" && !APP_ID_PATTERN.test(value.id)) {
    errors.push("id must use 2-32 lowercase letters, numbers or dashes");
  }
  if (typeof value.version === "string" && !SEMVER_PATTERN.test(value.version)) {
    errors.push("version must be valid semantic versioning");
  }
  if (typeof value.category === "string" && !SERVEROS_CATEGORIES.includes(value.category as (typeof SERVEROS_CATEGORIES)[number])) {
    errors.push(`category must be one of: ${SERVEROS_CATEGORIES.join(", ")}`);
  }
  if (typeof value.entry === "string" && !isSafeEntry(value.entry)) {
    errors.push("entry must be a relative .ts, .js or .mjs file inside the app directory");
  }
  validateStringLength(value, "name", 100, errors);
  validateStringLength(value, "description", 200, errors);
  validateStringLength(value, "icon", 32, errors);

  validateServerOSRequirement(value.serveros, errors);
  validatePublisher(value.publisher, errors);
  validatePermissions(value.permissions, errors);
  validateDependencies(value.dependencies, typeof value.id === "string" ? value.id : undefined, errors);
  validateCommands(value.commands, errors);
  validateSettings(value.settings, errors);
  validateOptionalUrl(value, "repository", errors);
  validateOptionalUrl(value, "support", errors);
  validateResources(value.resources, errors);
  validateSignature(value.signature, errors);
  validateOptionalString(value, "license", errors);
  validateOptionalString(value, "template", errors);

  if (value.system !== undefined && typeof value.system !== "boolean") {
    errors.push("system must be a boolean");
  }
  if (value.releaseChannel !== undefined && !["stable", "beta", "development"].includes(String(value.releaseChannel))) {
    errors.push("releaseChannel must be stable, beta or development");
  }

  if (typeof value.id === "string" && options.expectedAppId && value.id !== options.expectedAppId) {
    errors.push(`manifest id must match app folder: ${options.expectedAppId}`);
  }

  const manifest = errors.length ? undefined : value as unknown as ServerOSAppManifest;
  if (manifest && options.appDirectory) {
    const entryPath = path.resolve(options.appDirectory, manifest.entry);
    const relative = path.relative(path.resolve(options.appDirectory), entryPath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      errors.push("entry resolves outside the app directory");
    } else if (!fs.existsSync(entryPath)) {
      errors.push(`entry file does not exist: ${manifest.entry}`);
    }
  }

  if (manifest && options.serverosVersion) {
    validateCompatibility(manifest.serveros, options.serverosVersion, errors);
  }

  if (manifest && options.runtimeApp) {
    validateRuntimeMatch(manifest, options.runtimeApp, errors);
  }

  return errors.length ? { errors } : { manifest, errors: [] };
}

function validateSignature(value: unknown, errors: string[]): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    errors.push("signature must be an object");
    return;
  }
  rejectUnknownFields(value, new Set(["algorithm", "keyId"]), "signature", errors);
  if (value.algorithm !== "Ed25519") {
    errors.push("signature.algorithm must be Ed25519");
  }
  if (typeof value.keyId !== "string" || !/^ed25519:[a-f0-9]{64}$/.test(value.keyId)) {
    errors.push("signature.keyId must be an Ed25519 SHA-256 fingerprint");
  }
}

function validateServerOSRequirement(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push("serveros must be an object");
    return;
  }
  rejectUnknownFields(value, new Set(["minVersion", "maxVersionExclusive"]), "serveros", errors);
  requireString(value, "minVersion", errors, "serveros.minVersion");
  if (typeof value.minVersion === "string" && !SEMVER_PATTERN.test(value.minVersion)) {
    errors.push("serveros.minVersion must be valid semantic versioning");
  }
  if (value.maxVersionExclusive !== undefined) {
    if (typeof value.maxVersionExclusive !== "string" || !SEMVER_PATTERN.test(value.maxVersionExclusive)) {
      errors.push("serveros.maxVersionExclusive must be valid semantic versioning");
    }
  }
  if (
    typeof value.minVersion === "string"
    && SEMVER_PATTERN.test(value.minVersion)
    && typeof value.maxVersionExclusive === "string"
    && SEMVER_PATTERN.test(value.maxVersionExclusive)
    && compareVersions(value.minVersion, value.maxVersionExclusive) >= 0
  ) {
    errors.push("serveros.maxVersionExclusive must be newer than serveros.minVersion");
  }
}

function validatePublisher(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push("publisher must be an object");
    return;
  }
  rejectUnknownFields(value, new Set(["name", "github"]), "publisher", errors);
  requireString(value, "name", errors, "publisher.name");
  validateStringLength(value, "name", 100, errors, "publisher.name");
  if (value.github !== undefined && (typeof value.github !== "string" || !/^[A-Za-z0-9-]{1,39}$/.test(value.github))) {
    errors.push("publisher.github must be a valid GitHub owner name");
  }
}

function validatePermissions(value: unknown, errors: string[]): void {
  if (!Array.isArray(value)) {
    errors.push("permissions must be an array");
    return;
  }
  const seen = new Set<string>();
  for (const permission of value) {
    if (typeof permission !== "string" || !APP_PERMISSIONS.includes(permission as AppPermission)) {
      errors.push(`unsupported permission: ${String(permission)}`);
      continue;
    }
    if (seen.has(permission)) {
      errors.push(`duplicate permission: ${permission}`);
    }
    seen.add(permission);
  }
}

function validateDependencies(value: unknown, appId: string | undefined, errors: string[]): void {
  if (!Array.isArray(value)) {
    errors.push("dependencies must be an array");
    return;
  }
  const seen = new Set<string>();
  for (const dependency of value) {
    const id = typeof dependency === "string" ? dependency : isRecord(dependency) ? dependency.id : undefined;
    if (typeof id !== "string" || !APP_ID_PATTERN.test(id)) {
      errors.push(`invalid dependency id: ${String(id)}`);
      continue;
    }
    if (id === appId) {
      errors.push(`app cannot depend on itself: ${id}`);
    }
    if (seen.has(id)) {
      errors.push(`duplicate dependency: ${id}`);
    }
    seen.add(id);
    if (isRecord(dependency)) {
      rejectUnknownFields(dependency, new Set(["id", "optional", "reason"]), `dependency ${id}`, errors);
      if (dependency.optional !== undefined && typeof dependency.optional !== "boolean") {
        errors.push(`dependency ${id} optional must be a boolean`);
      }
      if (dependency.reason !== undefined && typeof dependency.reason !== "string") {
        errors.push(`dependency ${id} reason must be a string`);
      } else if (typeof dependency.reason === "string" && (!dependency.reason.trim() || dependency.reason.length > 200)) {
        errors.push(`dependency ${id} reason must contain 1-200 characters`);
      }
    }
  }
}

function validateSettings(value: unknown, errors: string[]): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    errors.push("settings must be an object");
    return;
  }
  for (const [key, definition] of Object.entries(value)) {
    if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(key)) {
      errors.push(`invalid setting key: ${key}`);
    }
    if (!isRecord(definition)) {
      errors.push(`setting ${key} must be an object`);
      continue;
    }
    rejectUnknownFields(definition, new Set(["type", "label", "description", "default", "options"]), `setting ${key}`, errors);
    if (!["boolean", "string", "number", "select"].includes(String(definition.type))) {
      errors.push(`setting ${key} has an invalid type`);
    }
    requireString(definition, "label", errors, `setting ${key}.label`);
    if (definition.description !== undefined && (typeof definition.description !== "string" || !definition.description.trim())) {
      errors.push(`setting ${key}.description must be a non-empty string`);
    }
    if (definition.options !== undefined) {
      if (!Array.isArray(definition.options) || definition.options.some((item) => typeof item !== "string" || !item.trim())) {
        errors.push(`setting ${key}.options must be an array of non-empty strings`);
      } else if (new Set(definition.options).size !== definition.options.length) {
        errors.push(`setting ${key}.options must not contain duplicates`);
      }
    }
    if (definition.type === "select" && (!Array.isArray(definition.options) || definition.options.length === 0)) {
      errors.push(`setting ${key} requires options when type is select`);
    }
  }
}

function validateCommands(value: unknown, errors: string[]): void {
  if (!Array.isArray(value)) {
    errors.push("commands must be an array");
    return;
  }
  const seen = new Set<string>();
  for (const command of value) {
    if (typeof command !== "string" || !COMMAND_PATTERN.test(command)) {
      errors.push(`invalid command name: ${String(command)}`);
      continue;
    }
    if (seen.has(command)) {
      errors.push(`duplicate command: ${command}`);
    }
    seen.add(command);
  }
}

function validateResources(value: unknown, errors: string[]): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    errors.push("resources must be an object");
    return;
  }
  rejectUnknownFields(value, new Set(["storage", "network", "events"]), "resources", errors);
  if (value.storage !== undefined) {
    if (!isRecord(value.storage)) {
      errors.push("resources.storage must be an object");
    } else {
      rejectUnknownFields(value.storage, new Set(["maxBytes"]), "resources.storage", errors);
      if (value.storage.maxBytes !== undefined && (!Number.isInteger(value.storage.maxBytes) || Number(value.storage.maxBytes) < 1)) {
        errors.push("resources.storage.maxBytes must be a positive integer");
      }
    }
  }
  if (value.network !== undefined) {
    if (!isRecord(value.network) || !Array.isArray(value.network.hosts) || value.network.hosts.some((host) => typeof host !== "string" || !host)) {
      errors.push("resources.network.hosts must be an array of host names");
    } else {
      rejectUnknownFields(value.network, new Set(["hosts"]), "resources.network", errors);
      if (new Set(value.network.hosts).size !== value.network.hosts.length) {
        errors.push("resources.network.hosts must not contain duplicates");
      }
    }
  }
  if (value.events !== undefined) {
    if (!isRecord(value.events)) {
      errors.push("resources.events must be an object");
    } else {
      rejectUnknownFields(value.events, new Set(["publishes", "subscribes"]), "resources.events", errors);
      validateOptionalStringArray(value.events, "publishes", errors, "resources.events.publishes");
      validateOptionalStringArray(value.events, "subscribes", errors, "resources.events.subscribes");
    }
  }
}

function validateCompatibility(requirement: ServerOSVersionRequirement, version: string, errors: string[]): void {
  if (!SEMVER_PATTERN.test(version)) {
    errors.push(`ServerOS version is invalid: ${version}`);
    return;
  }
  if (compareVersions(version, requirement.minVersion) < 0) {
    errors.push(`requires ServerOS ${requirement.minVersion} or newer`);
  }
  if (requirement.maxVersionExclusive && compareVersions(version, requirement.maxVersionExclusive) >= 0) {
    errors.push(`requires a ServerOS version below ${requirement.maxVersionExclusive}`);
  }
}

function validateRuntimeMatch(manifest: ServerOSAppManifest, app: ServerOSApp, errors: string[]): void {
  const comparisons: Array<[string, unknown, unknown]> = [
    ["id", manifest.id, app.metadata.id],
    ["name", manifest.name, app.metadata.name],
    ["version", manifest.version, app.metadata.version],
    ["description", manifest.description, app.metadata.description],
    ["icon", manifest.icon, app.metadata.icon],
    ["category", manifest.category, app.metadata.category],
    ["publisher.name", manifest.publisher.name, app.metadata.author],
    ["system", manifest.system ?? false, app.metadata.system ?? false],
    ["template", manifest.template, app.metadata.template]
  ];
  for (const [field, expected, actual] of comparisons) {
    if (expected !== actual) {
      errors.push(`manifest ${field} does not match runtime metadata`);
    }
  }

  compareStringSets("permissions", manifest.permissions, app.metadata.permissions ?? [], errors);
  compareStringSets("commands", manifest.commands, (app.commands ?? []).map((command) => String(command.toJSON().name ?? "")), errors);

  const manifestDependencies = manifest.dependencies.map(normalizeDependency).sort();
  const runtimeDependencies = (app.metadata.dependencies ?? []).map(normalizeDependency).sort();
  if (JSON.stringify(manifestDependencies) !== JSON.stringify(runtimeDependencies)) {
    errors.push("manifest dependencies do not match runtime metadata");
  }

  if (stableJson(manifest.settings ?? {}) !== stableJson(app.settings ?? {})) {
    errors.push("manifest settings do not match runtime app");
  }
}

function validateRuntimeApp(value: unknown): { runtimeApp?: ServerOSApp; errors: string[] } {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return { errors: ["Default export must be a ServerOS app object"] };
  }
  if (!isRecord(value.metadata)) {
    return { errors: ["Runtime app metadata must be an object"] };
  }
  for (const field of ["id", "name", "icon", "version", "description", "category"]) {
    if (typeof value.metadata[field] !== "string" || !String(value.metadata[field]).trim()) {
      errors.push(`runtime metadata.${field} must be a non-empty string`);
    }
  }
  if (typeof value.open !== "function" && (!isRecord(value.screens) || typeof value.screens.home !== "function")) {
    errors.push("runtime app must define open() or screens.home");
  }
  if (value.commands !== undefined) {
    if (!Array.isArray(value.commands)) {
      errors.push("runtime commands must be an array");
    } else if (value.commands.some((command) => !isRecord(command) || typeof command.toJSON !== "function")) {
      errors.push("every runtime command must provide toJSON()");
    }
  }
  return errors.length ? { errors } : { runtimeApp: value as unknown as ServerOSApp, errors: [] };
}

function normalizeDependency(dependency: AppDependency): string {
  if (typeof dependency === "string") {
    return `${dependency}:required:`;
  }
  return `${dependency.id}:${dependency.optional ? "optional" : "required"}:${dependency.reason ?? ""}`;
}

function compareStringSets(field: string, expected: string[], actual: string[], errors: string[]): void {
  if (JSON.stringify([...expected].sort()) !== JSON.stringify([...actual].sort())) {
    errors.push(`manifest ${field} do not match runtime app`);
  }
}

function compareVersions(left: string, right: string): number {
  const leftParts = left.split(/[+-]/, 1)[0].split(".").map(Number);
  const rightParts = right.split(/[+-]/, 1)[0].split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      return leftParts[index] - rightParts[index];
    }
  }
  const leftPrerelease = left.split("+", 1)[0].split("-").slice(1).join("-");
  const rightPrerelease = right.split("+", 1)[0].split("-").slice(1).join("-");
  if (!leftPrerelease && !rightPrerelease) return 0;
  if (!leftPrerelease) return 1;
  if (!rightPrerelease) return -1;
  const leftIdentifiers = leftPrerelease.split(".");
  const rightIdentifiers = rightPrerelease.split(".");
  for (let index = 0; index < Math.max(leftIdentifiers.length, rightIdentifiers.length); index += 1) {
    const leftIdentifier = leftIdentifiers[index];
    const rightIdentifier = rightIdentifiers[index];
    if (leftIdentifier === undefined) return -1;
    if (rightIdentifier === undefined) return 1;
    if (leftIdentifier === rightIdentifier) continue;
    const leftNumeric = /^\d+$/.test(leftIdentifier);
    const rightNumeric = /^\d+$/.test(rightIdentifier);
    if (leftNumeric && rightNumeric) return Number(leftIdentifier) - Number(rightIdentifier);
    if (leftNumeric) return -1;
    if (rightNumeric) return 1;
    return leftIdentifier.localeCompare(rightIdentifier);
  }
  return 0;
}

function isSafeEntry(entry: string): boolean {
  if (!entry || path.isAbsolute(entry) || entry.includes("\\")) {
    return false;
  }
  const normalized = path.posix.normalize(entry);
  return !normalized.startsWith("../") && normalized !== ".." && /\.(?:ts|js|mjs)$/.test(normalized);
}

function validateOptionalUrl(record: Record<string, unknown>, field: string, errors: string[]): void {
  const value = record[field];
  if (value === undefined) {
    return;
  }
  if (typeof value !== "string") {
    errors.push(`${field} must be an HTTPS URL`);
    return;
  }
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") {
      errors.push(`${field} must be an HTTPS URL`);
    }
  } catch {
    errors.push(`${field} must be an HTTPS URL`);
  }
}

function validateOptionalStringArray(record: Record<string, unknown>, field: string, errors: string[], label: string): void {
  const value = record[field];
  if (value !== undefined && (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item))) {
    errors.push(`${label} must be an array of strings`);
  } else if (Array.isArray(value) && new Set(value).size !== value.length) {
    errors.push(`${label} must not contain duplicates`);
  }
}

function validateOptionalString(record: Record<string, unknown>, field: string, errors: string[]): void {
  const value = record[field];
  if (value !== undefined && (typeof value !== "string" || !value.trim())) {
    errors.push(`${field} must be a non-empty string`);
  }
}

function validateStringLength(
  record: Record<string, unknown>,
  field: string,
  maxLength: number,
  errors: string[],
  label = field
): void {
  const value = record[field];
  if (typeof value === "string" && value.length > maxLength) {
    errors.push(`${label} must not exceed ${maxLength} characters`);
  }
}

function rejectUnknownFields(record: Record<string, unknown>, allowed: Set<string>, label: string, errors: string[]): void {
  for (const field of Object.keys(record)) {
    if (!allowed.has(field)) {
      errors.push(`${label} contains unsupported field: ${field}`);
    }
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function requireString(record: Record<string, unknown>, field: string, errors: string[], label = field): void {
  if (typeof record[field] !== "string" || !String(record[field]).trim()) {
    errors.push(`${label} must be a non-empty string`);
  }
}

function requireExactNumber(record: Record<string, unknown>, field: string, expected: number, errors: string[]): void {
  if (record[field] !== expected) {
    errors.push(`${field} must be ${expected}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
