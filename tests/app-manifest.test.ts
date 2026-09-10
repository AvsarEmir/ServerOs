import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { validateAppDirectory, validateAppManifest } from "../src/core/runtime/AppManifest.js";

function validManifest() {
  return {
    schemaVersion: 1,
    id: "test-app",
    name: "Test App",
    version: "1.2.3",
    description: "A test app",
    icon: "🧩",
    category: "Custom",
    entry: "index.mjs",
    serveros: { minVersion: "0.1.5", maxVersionExclusive: "2.0.0" },
    publisher: { name: "ServerOS Test", github: "serveros-test" },
    permissions: ["storage:read"],
    dependencies: [],
    commands: ["testapp"],
    settings: {
      mode: {
        type: "select",
        label: "Mode",
        options: ["compact", "full"],
        default: "compact"
      }
    },
    resources: {
      storage: { maxBytes: 1024 },
      network: { hosts: ["api.example.com"] },
      events: { publishes: ["test.created"], subscribes: ["task.completed"] }
    },
    repository: "https://github.com/serveros-test/test-app",
    license: "MIT",
    releaseChannel: "stable"
  };
}

test("accepts a canonical manifest", () => {
  const result = validateAppManifest(validManifest(), {
    expectedAppId: "test-app",
    serverosVersion: "1.0.0"
  });
  assert.ok(result.manifest);
  assert.deepEqual(result.errors, []);
});

test("rejects unsafe, unsupported and incompatible manifest values", () => {
  const manifest = {
    ...validManifest(),
    id: "wrong-app",
    entry: "../outside.js",
    permissions: ["host:root"],
    unexpected: true,
    serveros: { minVersion: "2.0.0", maxVersionExclusive: "1.0.0" }
  };
  const result = validateAppManifest(manifest, {
    expectedAppId: "test-app",
    serverosVersion: "1.0.0"
  });
  assert.equal(result.manifest, undefined);
  assert.equal(result.errors.some((error) => error.includes("unsupported field")), true);
  assert.equal(result.errors.some((error) => error.includes("entry must be")), true);
  assert.equal(result.errors.some((error) => error.includes("unsupported permission")), true);
  assert.equal(result.errors.some((error) => error.includes("match app folder")), true);
  assert.equal(result.errors.some((error) => error.includes("must be newer")), true);
});

test("uses semantic prerelease ordering for compatibility", () => {
  const result = validateAppManifest({
    ...validManifest(),
    serveros: { minVersion: "1.0.0-beta.2", maxVersionExclusive: "1.0.0" }
  }, {
    serverosVersion: "1.0.0-beta.10"
  });
  assert.ok(result.manifest);
  assert.deepEqual(result.errors, []);
});

test("validates Ed25519 signature metadata", () => {
  const valid = validateAppManifest({
    ...validManifest(),
    signature: { algorithm: "Ed25519", keyId: `ed25519:${"a".repeat(64)}` }
  });
  assert.ok(valid.manifest);
  const invalid = validateAppManifest({
    ...validManifest(),
    signature: { algorithm: "RSA", keyId: "publisher-key" }
  });
  assert.equal(invalid.errors.some((error) => error.includes("signature.algorithm")), true);
  assert.equal(invalid.errors.some((error) => error.includes("signature.keyId")), true);
});

test("validates the entry module against canonical runtime metadata", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "serveros-manifest-"));
  try {
    const manifest = validManifest();
    fs.writeFileSync(path.join(root, "serveros.app.json"), JSON.stringify(manifest));
    fs.writeFileSync(path.join(root, "index.mjs"), `export default {
      metadata: {
        id: "test-app",
        name: "Test App",
        version: "1.2.4",
        description: "A test app",
        icon: "🧩",
        category: "Custom",
        author: "ServerOS Test",
        permissions: ["storage:read"],
        dependencies: []
      },
      commands: [{ toJSON() { return { name: "testapp" }; } }],
      settings: {
        mode: {
          type: "select",
          label: "Mode",
          options: ["compact", "full"],
          default: "compact"
        }
      },
      async open() {}
    };`);

    const result = await validateAppDirectory(root, {
      expectedAppId: "test-app",
      serverosVersion: "1.0.0"
    });
    assert.equal(result.runtimeApp?.metadata.id, "test-app");
    assert.equal(result.errors.some((error) => error.includes("manifest version does not match")), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
