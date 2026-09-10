import fs from "node:fs";
import path from "node:path";

const projectDirectory = path.resolve(process.cwd());
const outputDirectory = path.resolve(projectDirectory, "dist");

if (path.dirname(outputDirectory) !== projectDirectory || path.basename(outputDirectory) !== "dist") {
  throw new Error(`Unsafe build output path: ${outputDirectory}`);
}

fs.rmSync(outputDirectory, { recursive: true, force: true });
