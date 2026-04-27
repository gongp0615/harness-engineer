"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

function readEnvFile(filePath) {
  const data = {};
  const text = fs.readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^(?:export )?([A-Z0-9_]+)='((?:'\\''|[^'])*)'$/);
    assert.ok(match, `invalid env line: ${line}`);
    data[match[1]] = match[2].replace(/'\\''/g, "'");
  }
  return data;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function hasScriptCommand() {
  return spawnSync("script", ["--version"], { encoding: "utf8" }).status === 0;
}

function runTuiInPty(source, output, input) {
  const command = `node ${shellQuote(path.join(source, "scripts", "agent-model-tui.js"))} ${shellQuote(output)}`;
  return spawnSync("script", ["-qfec", command, "/dev/null"], {
    input,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"]
  });
}

test("agent model TUI accepts role defaults through the confirm page", { skip: !hasScriptCommand() }, () => {
  const source = path.join(__dirname, "..");
  const output = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "harness-agent-models-")), "models.env");
  const input = "\t\t\t\t\t\r";
  const result = runTuiInPty(source, output, input);

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readEnvFile(output), {
    HARNESS_AGENT_MODEL_MODE: "custom",
    HARNESS_AGENT_MODEL_PLANNER: "gpt-5.4",
    HARNESS_AGENT_MODEL_EXECUTOR: "claude-sonnet-4.6",
    HARNESS_AGENT_MODEL_VERIFIER: "gpt-5.3-codex",
    HARNESS_AGENT_MODEL_DEBUGGER: "gpt-5.4",
    HARNESS_AGENT_MODEL_REVIEWER: "gpt-5.4"
  });
});

test("agent model TUI escape writes skip mode", { skip: !hasScriptCommand() }, () => {
  const source = path.join(__dirname, "..");
  const output = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "harness-agent-models-")), "models.env");
  const result = runTuiInPty(source, output, "\u001b");

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readEnvFile(output), {
    HARNESS_AGENT_MODEL_MODE: "skip"
  });
});
