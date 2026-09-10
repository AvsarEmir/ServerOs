import assert from "node:assert/strict";
import test from "node:test";
import app from "./index.js";

test("Notes exposes its runtime contract", () => {
  assert.equal(app.metadata.id, "notes");
  assert.equal(app.commands?.some((command) => command.toJSON().name === "note"), true);
  assert.equal(typeof app.open, "function");
});
