#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const color = require("picocolors").createColors(true);

const outputPath = process.argv[2];
if (!outputPath) {
  console.error("Usage: ci-setup-tui.js <env-output-file>");
  process.exit(2);
}

const options = [
  {
    value: "none",
    label: "不添加 CI（推荐）",
    hint: "现在先跳过；之后可随时运行 harness init --ci github 或 --ci generic"
  },
  {
    value: "github",
    label: "GitHub Actions",
    hint: "在当前项目创建 .github/workflows/harness.yml，适合托管在 GitHub 的仓库"
  },
  {
    value: "generic",
    label: "通用 CI 说明文件",
    hint: "创建 harness/ci/harness-ci.md，适合 GitLab、Jenkins 或手动接入"
  }
];

let selectedIndex = 0;

function shellQuote(value) {
  return String(value).replace(/'/g, "'\\''");
}

function writeEnv(value) {
  fs.writeFileSync(outputPath, `export HARNESS_INSTALL_CI='${shellQuote(value)}'\n`, "utf8");
}

function cleanup() {
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  process.stdout.write("\x1b[?25h\x1b[0m\n");
}

function finish(value) {
  writeEnv(value);
  cleanup();
  process.exit(0);
}

function renderOption(option, index) {
  const selected = index === selectedIndex;
  const label = selected ? color.magenta(option.label) : color.green(option.label);
  return [
    `│ ${color.gray(`${index + 1}.`)}  ${label}`,
    `│     ${color.gray(option.hint)}`
  ].join("\n");
}

function render() {
  process.stdout.write("\x1b[2J\x1b[H\x1b[?25l");
  process.stdout.write(`${color.cyan("▌")} ${color.bgCyan(color.black(" CI 验证文件 "))}\n\n`);
  process.stdout.write(`│ ${color.green("是否为当前项目添加 Harness CI 验证文件？")}\n`);
  process.stdout.write("│\n");
  process.stdout.write(options.map(renderOption).join("\n"));
  process.stdout.write("\n│\n");
  process.stdout.write(`│ ${color.green("↑↓")} 选择   ${color.green("enter")} 确认   ${color.green("esc")} 跳过\n`);
}

function handleInput(chunk) {
  const text = chunk.toString("utf8");
  if (text === "\u001b") finish("none");
  if (text === "\u001b[A") {
    selectedIndex = Math.max(0, selectedIndex - 1);
    render();
    return;
  }
  if (text === "\u001b[B") {
    selectedIndex = Math.min(options.length - 1, selectedIndex + 1);
    render();
    return;
  }

  for (const char of text) {
    if (char === "\u0003") {
      cleanup();
      process.exit(130);
    }
    if (char === "\u001b") finish("none");
    if (char === "\r" || char === "\n") finish(options[selectedIndex].value);
    if (char === "1") finish("none");
    if (char === "2") finish("github");
    if (char === "3") finish("generic");
  }
  render();
}

if (!process.stdin.isTTY || !process.stdout.isTTY) {
  writeEnv("none");
  process.exit(0);
}

process.on("exit", () => {
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
});

process.stdin.setRawMode(true);
process.stdin.resume();
process.stdin.on("data", handleInput);
render();
