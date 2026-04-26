#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const { Codex } = await import("@openai/codex-sdk");

function parseArgs(argv) {
  const args = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      args._.push(token);
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }

    args[key] = next;
    index += 1;
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const promptFile = args["prompt-file"];
const artifactPath = args["artifact"];
const model = args["model"];
const effort = args["effort"] || "xhigh";

if (!promptFile || !artifactPath || !model) {
  console.error("Usage: run-handoff.mjs --prompt-file <path> --artifact <path> --model <model> [--effort <effort>]");
  process.exit(1);
}

const prompt = await readFile(promptFile, "utf8");
const codexOpts = model ? { config: { model } } : {};
const codex = new Codex(codexOpts);

const threadOptions = {
  sandboxMode: "danger-full-access",
  approvalPolicy: "never",
  workingDirectory: process.cwd(),
  modelReasoningEffort: effort,
};
const artifactDir = path.dirname(path.resolve(artifactPath));
if (artifactDir !== process.cwd()) {
  threadOptions.additionalDirectories = [artifactDir];
}

const thread = codex.startThread(threadOptions);
const result = await thread.run(prompt);

const text =
  typeof result === "string" ? result :
  result?.finalResponse || result?.output_text || JSON.stringify(result, null, 2);

await writeFile(artifactPath, text.endsWith("\n") ? text : `${text}\n`, "utf8");
process.stdout.write(JSON.stringify({ artifactPath, model, effort }) + "\n");
