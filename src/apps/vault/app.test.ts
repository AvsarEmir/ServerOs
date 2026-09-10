import assert from "node:assert/strict";
import test from "node:test";
import app from "./index.js";

test("Vault exposes its runtime contract", () => {
  assert.equal(app.metadata.id, "vault");
  assert.equal(app.commands?.some((command) => command.toJSON().name === "vault"), true);
  assert.equal(typeof app.open, "function");
});
