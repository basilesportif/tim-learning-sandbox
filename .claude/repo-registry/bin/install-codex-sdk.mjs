#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const registryDir = path.resolve(__dirname, "..");
const packageJsonPath = path.join(registryDir, "package.json");

const packageJson = {
  name: "repo-registry-local-codex",
  private: true,
  version: "0.1.0",
  type: "module",
  dependencies: {
    "@openai/codex-sdk": "^0.124.0"
  }
};

await mkdir(registryDir, { recursive: true });
await writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");

const child = spawn("npm", ["install", "--prefix", registryDir], {
  cwd: registryDir,
  stdio: "inherit",
  env: process.env
});

const exitCode = await new Promise((resolve, reject) => {
  child.on("error", reject);
  child.on("exit", (code) => resolve(code ?? 1));
});

process.exit(exitCode);
