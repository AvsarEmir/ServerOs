import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { publicKeyFingerprint, verifyAppPackage } from "../src/core/packages/AppPackage.js";
import { createZipArchive, readZipArchive, type ZipEntry } from "../src/core/packages/ZipArchive.js";

function packageArchive(entrySource = "export default {};"): Buffer {
  const manifest = Buffer.from(`${JSON.stringify({
    schemaVersion: 1,
    id: "test-app",
    name: "Test App",
    version: "1.0.0",
    description: "Test package",
    icon: "🧩",
    category: "Custom",
    entry: "dist/index.js",
    serveros: { minVersion: "0.1.5" },
    publisher: { name: "ServerOS Test" },
    permissions: [],
    dependencies: [],
    commands: []
  }, null, 2)}\n`);
  const bundle = Buffer.from(entrySource);
  const payload: ZipEntry[] = [
    { path: "serveros.app.json", data: manifest },
    { path: "dist/index.js", data: bundle }
  ];
  const checksums = payload.map((entry) => `${crypto.createHash("sha256").update(entry.data).digest("hex")}  ${entry.path}`).join("\n");
  return createZipArchive([...payload, { path: "CHECKSUM", data: Buffer.from(`${checksums}\n`) }]);
}

test("verifies a canonical ServerOS app package", () => {
  const archive = packageArchive();
  const result = verifyAppPackage(archive, { serverosVersion: "0.1.5" });
  assert.equal(result.manifest.id, "test-app");
  assert.equal(result.entries.length, 3);
  assert.match(result.archiveSha256, /^[a-f0-9]{64}$/);
  assert.equal(result.signaturePresent, false);
});

test("rejects package payloads that do not match CHECKSUM", () => {
  const good = packageArchive();
  const entries = readZipArchive(good).map((entry) => entry.path === "dist/index.js" ? { ...entry, data: Buffer.from("changed") } : entry);
  const changed = createZipArchive(entries);
  assert.throws(() => verifyAppPackage(changed), /CHECKSUM verification failed/);
});

test("verifies an Ed25519 publisher signature with a trusted key", () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
  const keyId = publicKeyFingerprint(publicKey);
  const manifest = Buffer.from(`${JSON.stringify({
    schemaVersion: 1,
    id: "signed-app",
    name: "Signed App",
    version: "1.0.0",
    description: "Signed package",
    icon: "🔏",
    category: "Custom",
    entry: "dist/index.js",
    serveros: { minVersion: "0.1.5" },
    publisher: { name: "ServerOS Test" },
    permissions: [],
    dependencies: [],
    commands: [],
    signature: { algorithm: "Ed25519", keyId }
  }, null, 2)}\n`);
  const bundle = Buffer.from("export default {};");
  const payload: ZipEntry[] = [
    { path: "serveros.app.json", data: manifest },
    { path: "dist/index.js", data: bundle }
  ];
  const checksumData = Buffer.from(`${payload.map((entry) => `${crypto.createHash("sha256").update(entry.data).digest("hex")}  ${entry.path}`).join("\n")}\n`);
  const signatureData = Buffer.from(`${JSON.stringify({
    schemaVersion: 1,
    algorithm: "Ed25519",
    keyId,
    value: crypto.sign(null, checksumData, privateKey).toString("base64")
  }, null, 2)}\n`);
  const archive = createZipArchive([
    ...payload,
    { path: "CHECKSUM", data: checksumData },
    { path: "SIGNATURE", data: signatureData }
  ]);

  const untrusted = verifyAppPackage(archive);
  assert.equal(untrusted.signaturePresent, true);
  assert.equal(untrusted.signatureVerified, false);
  const trusted = verifyAppPackage(archive, { trustedPublicKeys: { [keyId]: publicKey } });
  assert.equal(trusted.signatureVerified, true);
});
