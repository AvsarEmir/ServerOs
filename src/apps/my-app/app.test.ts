import assert from "node:assert/strict";
import test from "node:test";
import app from "./index.js";

test("My App exposes its runtime contract", () => {
  assert.equal(app.metadata.id, "my-app");
  assert.equal(app.metadata.template, "simple");
  assert.equal(app.commands?.some((command) => command.toJSON().name === "myapp"), true);
  assert.equal(typeof app.open, "function");
});
