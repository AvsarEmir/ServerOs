import assert from "node:assert/strict";
import test from "node:test";
import app from "./index.js";

test("Terminal exposes its runtime contract", () => {
  assert.equal(app.metadata.id, "terminal");
  assert.equal(app.metadata.system, true);
  assert.equal(app.commands?.some((command) => command.toJSON().name === "terminal"), true);
  assert.equal(typeof app.open, "function");
});
