import assert from "node:assert/strict";
import test from "node:test";
import app from "./index.js";

test("Tasks exposes its runtime contract", () => {
  assert.equal(app.metadata.id, "tasks");
  assert.equal(app.commands?.some((command) => command.toJSON().name === "task"), true);
  assert.equal(typeof app.open, "function");
});
