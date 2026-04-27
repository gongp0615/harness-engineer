"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function hasScriptCommand() {
  return spawnSync("script", ["--version"], { encoding: "utf8" }).status === 0;
}

function readEnvFile(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const match = text.match(/^export HARNESS_INSTALL_CI='([^']+)'/m);
  assert.ok(match, text);
  return match[1];
}

function runTuiInPty(source, output, input) {
  const command = `stty cols 120 rows 30; node ${shellQuote(path.join(source, "scripts", "ci-setup-tui.js"))} ${shellQuote(output)}`;
  const feed = Array.from(input).map((char) => `sleep 0.1; printf ${shellQuote(char)}`).join("; ");
  return spawnSync("bash", ["-lc", `{ sleep 0.5; ${feed}; sleep 0.2; } | script -qfec ${shellQuote(command)} /dev/null`], {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"]
  });
}

test("CI setup TUI defaults to skipping CI files", { skip: !hasScriptCommand() }, () => {
  const source = path.join(__dirname, "..");
  const output = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "harness-ci-")), "ci.env");
  const result = runTuiInPty(source, output, "\r");

  assert.equal(result.status, 0, result.stderr);
  assert.equal(readEnvFile(output), "none");
  assert.match(result.stdout, /是否为当前项目添加 Harness CI 验证文件/);
  assert.match(result.stdout, /不添加 CI（推荐）/);
  assert.match(result.stdout, /GitHub Actions/);
  assert.match(result.stdout, /通用 CI 说明文件/);
});

test("CI setup TUI can select generic guidance", { skip: !hasScriptCommand() }, () => {
  const source = path.join(__dirname, "..");
  const output = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "harness-ci-")), "ci.env");
  const result = runTuiInPty(source, output, "3");

  assert.equal(result.status, 0, result.stderr);
  assert.equal(readEnvFile(output), "generic");
});
