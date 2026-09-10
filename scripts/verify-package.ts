import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { currentServerOSVersion } from "../src/core/runtime/AppManifest.js";
import { publicKeyFingerprint, verifyAppPackage } from "../src/core/packages/AppPackage.js";
import { argValue, hasFlag, positionalArgs } from "./app-utils.js";

function usage(): void {
  console.log(`Verify a ServerOS app package.\n\nUsage:\n  npm run app:verify-package <artifact.serveros-app>\n\nOptions:\n  --public-key <path>    Trusted Ed25519 SPKI public PEM key\n  --checksum <path>      External SHA-256 sidecar path\n  --require-signature    Fail unless the publisher signature is verified\n  --json                 Print a machine-readable report`);
}

function sha256(data: Buffer): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  usage();
  process.exit(0);
}

const packageInput = positionalArgs()[0];
if (!packageInput) {
  throw new Error("Package path is required");
}
const packagePath = path.resolve(process.cwd(), packageInput);
if (!fs.existsSync(packagePath)) {
  throw new Error(`Package does not exist: ${packagePath}`);
}
const archive = fs.readFileSync(packagePath);
const publicKeyInput = argValue("public-key");
let trustedPublicKeys: Record<string, crypto.KeyLike> | undefined;
if (publicKeyInput) {
  const publicKeyPath = path.resolve(process.cwd(), publicKeyInput);
  const publicKey = crypto.createPublicKey(fs.readFileSync(publicKeyPath));
  const keyId = publicKeyFingerprint(publicKey);
  trustedPublicKeys = { [keyId]: publicKey };
}

const verified = verifyAppPackage(archive, {
  serverosVersion: currentServerOSVersion(),
  trustedPublicKeys
});
const checksumInput = argValue("checksum");
const checksumPath = checksumInput ? path.resolve(process.cwd(), checksumInput) : `${packagePath}.sha256`;
let externalChecksumVerified = false;
if (fs.existsSync(checksumPath)) {
  const checksumLine = fs.readFileSync(checksumPath, "utf8").trim();
  const match = checksumLine.match(/^([a-f0-9]{64})(?:\s{2}|\s+)(.+)$/);
  if (!match || match[1] !== sha256(archive) || path.basename(match[2]) !== path.basename(packagePath)) {
    throw new Error("External SHA-256 checksum verification failed");
  }
  externalChecksumVerified = true;
}
if (hasFlag("require-signature") && !verified.signatureVerified) {
  throw new Error("A trusted, verified publisher signature is required");
}

const report = {
  valid: true,
  app: {
    id: verified.manifest.id,
    name: verified.manifest.name,
    version: verified.manifest.version,
    publisher: verified.manifest.publisher,
    permissions: verified.manifest.permissions,
    commands: verified.manifest.commands
  },
  archiveSha256: verified.archiveSha256,
  externalChecksumVerified,
  signaturePresent: verified.signaturePresent,
  signatureVerified: verified.signatureVerified,
  fileCount: verified.entries.length
};

if (hasFlag("json")) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`Valid ServerOS package: ${report.app.id} ${report.app.version}`);
  console.log(`Publisher: ${report.app.publisher.name}`);
  console.log(`Files: ${report.fileCount}`);
  console.log(`SHA-256: ${report.archiveSha256}`);
  console.log(`External checksum: ${externalChecksumVerified ? "verified" : "not provided"}`);
  console.log(`Publisher signature: ${verified.signatureVerified ? "verified" : verified.signaturePresent ? "present but no trusted key was provided" : "unsigned"}`);
}
