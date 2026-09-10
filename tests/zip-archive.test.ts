import assert from "node:assert/strict";
import test from "node:test";
import { createZipArchive, normalizeArchivePath, readZipArchive } from "../src/core/packages/ZipArchive.js";

test("creates deterministic ZIP archives independent of input order", () => {
  const first = createZipArchive([
    { path: "dist/index.js", data: Buffer.from("export default {};") },
    { path: "serveros.app.json", data: Buffer.from("{}\n") }
  ]);
  const second = createZipArchive([
    { path: "serveros.app.json", data: Buffer.from("{}\n") },
    { path: "dist/index.js", data: Buffer.from("export default {};") }
  ]);
  assert.deepEqual(first, second);
  assert.equal(first.readUInt32LE(0), 0x04034b50);
  assert.equal(first.readUInt32LE(first.length - 22), 0x06054b50);
  assert.deepEqual(readZipArchive(first).map((entry) => entry.path), ["dist/index.js", "serveros.app.json"]);
});

test("rejects corrupted ZIP entry data", () => {
  const archive = createZipArchive([{ path: "file.txt", data: Buffer.from("safe") }]);
  const corrupted = Buffer.from(archive);
  corrupted[30 + Buffer.byteLength("file.txt")] ^= 0xff;
  assert.throws(() => readZipArchive(corrupted), /integrity check failed/);
});

test("rejects duplicate and unsafe archive paths", () => {
  assert.throws(() => normalizeArchivePath("../outside"), /Unsafe archive path/);
  assert.throws(() => normalizeArchivePath("folder\\file"), /Unsafe archive path/);
  assert.throws(() => createZipArchive([
    { path: "same", data: Buffer.alloc(0) },
    { path: "same", data: Buffer.alloc(0) }
  ]), /Duplicate archive path/);
});
