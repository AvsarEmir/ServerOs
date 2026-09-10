import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { build } from "esbuild";
import { currentServerOSVersion, validateAppDirectory } from "../src/core/runtime/AppManifest.js";
import { publicKeyFingerprint, verifyAppPackage } from "../src/core/packages/AppPackage.js";
import { createZipArchive, normalizeArchivePath, type ZipEntry } from "../src/core/packages/ZipArchive.js";
import { appDir, argValue, assertValidAppId, hasFlag, positionalArgs, walkFiles } from "./app-utils.js";

const MAX_FILES = 500;
const MAX_UNPACKED_BYTES = 25 * 1024 * 1024;

function usage(): void {
  console.log(`Package a ServerOS app.\n\nUsage:\n  npm run app:package <app-id>\n\nOptions:\n  --out <path>                  Output file or directory\n  --expected-version <version>  Require an exact manifest version\n  --force                       Replace an existing artifact\n  --skip-tests                  Skip app tests\n  --verify-only                 Build and verify without writing files\n  --sign-key <path>             Ed25519 PKCS8 private PEM key\n  --sign-key-env <name>         Environment variable containing a private PEM key\n  --sign-passphrase-env <name>  Environment variable containing the key passphrase\n\nExamples:\n  npm run app:package notes\n  npm run app:package my-app -- --out releases\n  npm run app:package my-app -- --sign-key publisher.private.pem`);
}

function sha256(data: Buffer): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function collectDirectory(directory: string, archiveRoot: string): ZipEntry[] {
  if (!fs.existsSync(directory)) {
    return [];
  }
  return walkFiles(directory).map((file) => {
    const stats = fs.lstatSync(file);
    if (stats.isSymbolicLink()) {
      throw new Error(`Symbolic links are not allowed in packages: ${file}`);
    }
    const relative = path.relative(directory, file).split(path.sep).join("/");
    return {
      path: normalizeArchivePath(`${archiveRoot}/${relative}`),
      data: fs.readFileSync(file)
    };
  });
}

function resolveOutputPath(appId: string, version: string): string {
  const defaultName = `${appId}-${version}.serveros-app`;
  const requested = argValue("out");
  if (!requested) {
    return path.resolve(process.cwd(), "packages", defaultName);
  }
  const resolved = path.resolve(process.cwd(), requested);
  return resolved.toLowerCase().endsWith(".serveros-app") ? resolved : path.join(resolved, defaultName);
}

function runTests(directory: string): void {
  const testFiles = walkFiles(directory).filter((file) => file.endsWith(".test.ts")).sort();
  if (!testFiles.length) {
    throw new Error("App has no test files. Add a .test.ts file or use --skip-tests.");
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
    throw new Error("App tests failed");
  }
}

async function main(): Promise<void> {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    usage();
    return;
  }
  const appId = positionalArgs()[0];
  if (!appId) {
    throw new Error("App id is required. Run npm run app:package -- --help for usage.");
  }
  assertValidAppId(appId);
  const sourceDirectory = appDir(appId);
  if (!fs.existsSync(sourceDirectory)) {
    throw new Error(`App does not exist: src/apps/${appId}`);
  }

  const validation = await validateAppDirectory(sourceDirectory, {
    expectedAppId: appId,
    serverosVersion: currentServerOSVersion()
  });
  if (!validation.manifest || !validation.runtimeApp || validation.errors.length) {
    throw new Error(`App validation failed: ${validation.errors.join("; ")}`);
  }
  const expectedVersion = argValue("expected-version");
  if (expectedVersion && validation.manifest.version !== expectedVersion) {
    throw new Error(`Manifest version ${validation.manifest.version} does not match expected version ${expectedVersion}`);
  }
  if (!hasFlag("skip-tests")) {
    runTests(sourceDirectory);
  }

  const signingKeyPath = argValue("sign-key");
  const signingKeyEnvironmentName = argValue("sign-key-env");
  if (signingKeyPath && signingKeyEnvironmentName) {
    throw new Error("Use either --sign-key or --sign-key-env, not both");
  }
  let signingKey: crypto.KeyObject | undefined;
  let signingKeyId: string | undefined;
  if (signingKeyPath || signingKeyEnvironmentName) {
    let signingKeyData: Buffer | string;
    if (signingKeyPath) {
      const resolvedKeyPath = path.resolve(process.cwd(), signingKeyPath);
      if (!fs.existsSync(resolvedKeyPath)) {
        throw new Error(`Signing key does not exist: ${resolvedKeyPath}`);
      }
      signingKeyData = fs.readFileSync(resolvedKeyPath);
    } else {
      const environmentValue = process.env[signingKeyEnvironmentName!];
      if (!environmentValue) {
        throw new Error(`Signing key environment variable is missing: ${signingKeyEnvironmentName}`);
      }
      signingKeyData = environmentValue;
    }
    const passphraseEnvironmentName = argValue("sign-passphrase-env");
    const passphrase = passphraseEnvironmentName ? process.env[passphraseEnvironmentName] : undefined;
    if (passphraseEnvironmentName && !passphrase) {
      throw new Error(`Signing passphrase environment variable is missing: ${passphraseEnvironmentName}`);
    }
    signingKey = crypto.createPrivateKey(passphrase
      ? { key: signingKeyData, format: "pem", passphrase }
      : { key: signingKeyData, format: "pem" });
    if (signingKey.asymmetricKeyType !== "ed25519") {
      throw new Error("Signing key must be Ed25519");
    }
    signingKeyId = publicKeyFingerprint(crypto.createPublicKey(signingKey));
  }

  const buildResult = await build({
    entryPoints: [path.resolve(sourceDirectory, validation.manifest.entry)],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    write: false,
    sourcemap: false,
    legalComments: "none",
    external: ["discord.js"]
  });
  const bundled = buildResult.outputFiles?.[0]?.contents;
  if (!bundled) {
    throw new Error("App bundle was not produced");
  }

  const packagedManifest = {
    ...validation.manifest,
    $schema: "https://serveros.dev/schemas/serveros.app.schema.json",
    entry: "dist/index.js",
    signature: signingKeyId ? { algorithm: "Ed25519" as const, keyId: signingKeyId } : undefined
  };
  const entries: ZipEntry[] = [
    { path: "serveros.app.json", data: Buffer.from(`${JSON.stringify(packagedManifest, null, 2)}\n`) },
    { path: "dist/index.js", data: Buffer.from(bundled) },
    ...collectDirectory(path.join(sourceDirectory, "assets"), "assets"),
    ...collectDirectory(path.join(sourceDirectory, "migrations"), "migrations")
  ].sort((left, right) => Buffer.compare(Buffer.from(left.path), Buffer.from(right.path)));
  if (entries.length > MAX_FILES) {
    throw new Error(`Package contains ${entries.length} files; maximum is ${MAX_FILES}`);
  }
  const unpackedBytes = entries.reduce((total, entry) => total + entry.data.length, 0);
  if (unpackedBytes > MAX_UNPACKED_BYTES) {
    throw new Error(`Package is ${unpackedBytes} bytes unpacked; maximum is ${MAX_UNPACKED_BYTES}`);
  }

  const checksum = entries.map((entry) => `${sha256(entry.data)}  ${entry.path}`).join("\n");
  const checksumData = Buffer.from(`${checksum}\n`);
  entries.push({ path: "CHECKSUM", data: checksumData });
  if (signingKey && signingKeyId) {
    const signature = crypto.sign(null, checksumData, signingKey);
    entries.push({
      path: "SIGNATURE",
      data: Buffer.from(`${JSON.stringify({
        schemaVersion: 1,
        algorithm: "Ed25519",
        keyId: signingKeyId,
        value: signature.toString("base64")
      }, null, 2)}\n`)
    });
  }
  const archive = createZipArchive(entries);
  const trustedPublicKeys = signingKey && signingKeyId
    ? { [signingKeyId]: crypto.createPublicKey(signingKey) }
    : undefined;
  const verified = verifyAppPackage(archive, {
    serverosVersion: currentServerOSVersion(),
    maxFiles: MAX_FILES,
    maxUnpackedBytes: MAX_UNPACKED_BYTES,
    trustedPublicKeys
  });
  const archiveHash = verified.archiveSha256;
  if (hasFlag("verify-only")) {
    console.log(`Verified package build for ${appId} ${validation.manifest.version}`);
    console.log(`SHA-256: ${archiveHash}`);
    console.log(`Files: ${entries.length}, unpacked bytes: ${unpackedBytes}`);
    return;
  }
  const outputPath = resolveOutputPath(appId, validation.manifest.version);
  const checksumPath = `${outputPath}.sha256`;
  if (!hasFlag("force") && (fs.existsSync(outputPath) || fs.existsSync(checksumPath))) {
    throw new Error(`Package already exists: ${outputPath}. Use --force to replace it.`);
  }

  const outputDirectory = path.dirname(outputPath);
  fs.mkdirSync(outputDirectory, { recursive: true });
  const temporarySuffix = `.tmp-${process.pid}-${crypto.randomBytes(8).toString("hex")}`;
  const temporaryArchive = `${outputPath}${temporarySuffix}`;
  const temporaryChecksum = `${checksumPath}${temporarySuffix}`;
  try {
    fs.writeFileSync(temporaryArchive, archive);
    fs.writeFileSync(temporaryChecksum, `${archiveHash}  ${path.basename(outputPath)}\n`);
    if (hasFlag("force")) {
      fs.rmSync(outputPath, { force: true });
      fs.rmSync(checksumPath, { force: true });
    }
    fs.renameSync(temporaryArchive, outputPath);
    fs.renameSync(temporaryChecksum, checksumPath);
  } finally {
    fs.rmSync(temporaryArchive, { force: true });
    fs.rmSync(temporaryChecksum, { force: true });
  }

  console.log(`Packaged ${appId} ${validation.manifest.version}`);
  console.log(`Artifact: ${outputPath}`);
  console.log(`SHA-256: ${archiveHash}`);
  console.log(`Files: ${entries.length}, unpacked bytes: ${unpackedBytes}`);
  console.log(`Signature: ${verified.signatureVerified ? `verified ${signingKeyId}` : "unsigned development package"}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
