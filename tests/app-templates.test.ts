import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { APP_TEMPLATES } from "../scripts/app-templates.js";
import { commandNameFromAppId, toClassName, toTitle } from "../scripts/app-utils.js";

test("all app templates generate compilable TypeScript", () => {
  const directories: string[] = [];

  try {
    for (const template of APP_TEMPLATES) {
      const appId = `test-${template.id}`;
      const appName = toTitle(appId);
      const directory = path.resolve(process.cwd(), "src", "apps", `_template-smoke-${process.pid}-${template.id}`);
      directories.push(directory);
      fs.mkdirSync(directory, { recursive: true });

      const files = template.files({
        appId,
        appName,
        className: toClassName(appName),
        commandName: commandNameFromAppId(appId),
        author: "ServerOS Test"
      });

      for (const [fileName, content] of Object.entries(files)) {
        fs.writeFileSync(path.join(directory, fileName), content);
      }
    }

    const compiler = path.resolve(process.cwd(), "node_modules", "typescript", "bin", "tsc");
    const result = spawnSync(process.execPath, [compiler, "--noEmit"], {
      cwd: process.cwd(),
      encoding: "utf8"
    });

    assert.equal(result.status, 0, `${result.error?.message ?? ""}\n${result.stdout}\n${result.stderr}`);
  } finally {
    for (const directory of directories) {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  }
});
