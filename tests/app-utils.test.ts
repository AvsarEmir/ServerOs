import assert from "node:assert/strict";
import test from "node:test";
import {
  assertValidAppId,
  commandNameFromAppId,
  normalizeAppId,
  toClassName,
  toTitle
} from "../scripts/app-utils.js";

test("normalizes app names into valid identifiers", () => {
  assert.equal(normalizeAppId("  Hello World__42  "), "hello-world-42");
  assert.equal(normalizeAppId("one---two"), "one-two");
  assert.equal(normalizeAppId("A".repeat(40)).length, 32);
});

test("derives display, class and command names", () => {
  assert.equal(toTitle("team-notes"), "Team Notes");
  assert.equal(toClassName("Team Notes"), "TeamNotesApp");
  assert.equal(commandNameFromAppId("team-notes"), "teamnotes");
});

test("rejects invalid app identifiers", () => {
  assert.doesNotThrow(() => assertValidAppId("valid-app-2"));
  assert.throws(() => assertValidAppId("A"));
  assert.throws(() => assertValidAppId("invalid_app"));
});
