#!/usr/bin/env node
"use strict";

const fs = require("node:fs");

const outputPath = process.argv[2];
if (!outputPath) {
  console.error("Usage: agent-model-tui.js <env-output-file>");
  process.exit(2);
}

const agents = [
  { key: "planner", label: "规划", fallback: "gpt-5.4" },
  { key: "executor", label: "执行", fallback: "claude-sonnet-4.6" },
  { key: "verifier", label: "验证", fallback: "gpt-5.3-codex" },
  { key: "debugger", label: "调试", fallback: "gpt-5.4" },
  { key: "reviewer", label: "评审", fallback: "gpt-5.4" }
];

const optionSpecs = [
  (agent) => ({ value: agent.fallback, label: `${agent.fallback}（推荐）`, description: "按当前 agent 职责选择的默认模型。" }),
  () => ({ value: "gpt-5.4", label: "gpt-5.4", description: "适合规划、调试和评审等高强度推理任务。" }),
  () => ({ value: "gpt-5.3-codex", label: "gpt-5.3-codex", description: "偏代码执行和验证的 Codex 模型。" }),
  () => ({ value: "claude-sonnet-4.6", label: "claude-sonnet-4.6", description: "均衡的 Claude 工程模型，适合执行实现。" }),
  () => ({ value: "claude-haiku-4.5", label: "claude-haiku-4.5", description: "更快、更省预算的 Claude 模型。" }),
  () => ({ value: "gemini-3.1-pro", label: "gemini-3.1-pro", description: "适合混合任务的通用推理备选。" }),
  () => ({ value: "kimi-k2-thinking", label: "kimi-k2-thinking", description: "偏深度思考的 Kimi 模型。" }),
  () => ({ value: "__custom__", label: "输入自定义模型", description: "手动输入一个准确的 CodeBuddy model id。" })
];

const confirmTab = { key: "confirm", label: "确认" };
const tabs = [...agents, confirmTab];
const selections = Object.fromEntries(agents.map((agent) => [agent.key, agent.fallback]));
const selectedIndexes = Object.fromEntries(agents.map((agent) => [agent.key, 0]));
let activeTab = 0;
let customPrompt = null;

function optionsFor(agent) {
  return optionSpecs.map((build) => build(agent));
}

function writeEnv(values) {
  const lines = Object.entries(values).map(([key, value]) => `export ${key}='${shellQuote(value)}'`);
  fs.writeFileSync(outputPath, `${lines.join("\n")}\n`, "utf8");
}

function shellQuote(value) {
  return String(value).replace(/'/g, "'\\''");
}

function finishWithSelections() {
  writeEnv({
    HARNESS_AGENT_MODEL_MODE: "custom",
    HARNESS_AGENT_MODEL_PLANNER: selections.planner,
    HARNESS_AGENT_MODEL_EXECUTOR: selections.executor,
    HARNESS_AGENT_MODEL_VERIFIER: selections.verifier,
    HARNESS_AGENT_MODEL_DEBUGGER: selections.debugger,
    HARNESS_AGENT_MODEL_REVIEWER: selections.reviewer
  });
  cleanup();
  process.exit(0);
}

function finishSkipped() {
  writeEnv({ HARNESS_AGENT_MODEL_MODE: "skip" });
  cleanup();
  process.exit(0);
}

function cleanup() {
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  process.stdout.write("\x1b[?25h\x1b[0m\n");
}

function visibleWidth(value) {
  return Array.from(String(value)).reduce((width, char) => width + (char.charCodeAt(0) > 0x7f ? 2 : 1), 0);
}

function padRight(value, width) {
  const text = String(value);
  return `${text}${" ".repeat(Math.max(0, width - visibleWidth(text)))}`;
}

function line(content = "", width = 76) {
  return `│ ${padRight(content, width - 4)} │\n`;
}

function divider(width = 76) {
  return `├${"─".repeat(width - 2)}┤\n`;
}

function topBorder(title, width = 76) {
  const text = ` ${title} `;
  return `┌${text}${"─".repeat(Math.max(0, width - visibleWidth(text) - 2))}┐\n`;
}

function bottomBorder(width = 76) {
  return `└${"─".repeat(width - 2)}┘\n`;
}

function renderTabs() {
  return tabs.map((tab, index) => {
    const label = index === activeTab ? `▶ ${tab.label}` : `  ${tab.label}`;
    return index === activeTab ? `\x1b[7m ${label} \x1b[0m` : ` ${label} `;
  }).join(" ");
}

function renderOption(option, selected) {
  const marker = selected ? "●" : "○";
  const label = selected ? `\x1b[7m ${marker} ${option.label} \x1b[0m` : `${marker} ${option.label}`;
  return [
    line(label),
    line(`   ${option.description}`)
  ].join("");
}

function render() {
  process.stdout.write("\x1b[2J\x1b[H\x1b[?25l");
  process.stdout.write(topBorder("Harness agent 模型选择"));
  process.stdout.write(line(renderTabs()));
  process.stdout.write(divider());

  if (customPrompt) {
    process.stdout.write(line(`为 Harness ${customPrompt.agent.label} agent 输入自定义模型`));
    process.stdout.write(line(""));
    process.stdout.write(line(`模型 ID: ${customPrompt.value}`));
    process.stdout.write(line(""));
    process.stdout.write(line("Enter 确认输入，Esc 跳过模型配置。"));
    process.stdout.write(bottomBorder());
    return;
  }

  const tab = tabs[activeTab];
  if (tab.key === "confirm") {
    process.stdout.write(line("确认 Harness agent 模型"));
    process.stdout.write(line(""));
    const nameWidth = Math.max(...agents.map((agent) => agent.label.length));
    for (const agent of agents) {
      process.stdout.write(line(`${agent.label.padEnd(nameWidth)}  ${selections[agent.key]}`));
    }
    process.stdout.write(line(""));
    process.stdout.write(line("Enter 接受这些选择。Esc 跳过模型配置。"));
    process.stdout.write(bottomBorder());
    return;
  }

  process.stdout.write(line(`为 Harness ${tab.label} agent 选择模型`));
  process.stdout.write(line(""));
  const options = optionsFor(tab);
  for (let index = 0; index < options.length; index += 1) {
    process.stdout.write(renderOption(options[index], index === selectedIndexes[tab.key]));
  }
  process.stdout.write(divider());
  process.stdout.write(line("↑/↓ 选择模型  Tab/→ 下一个标签  ← 上一个标签  Enter 确认  Esc 跳过模型配置"));
  process.stdout.write(bottomBorder());
}

function nextTab() {
  activeTab = Math.min(activeTab + 1, tabs.length - 1);
}

function previousTab() {
  activeTab = Math.max(activeTab - 1, 0);
}

function confirmCurrent() {
  const tab = tabs[activeTab];
  if (tab.key === "confirm") {
    finishWithSelections();
    return;
  }
  const options = optionsFor(tab);
  const option = options[selectedIndexes[tab.key]];
  if (option.value === "__custom__") {
    customPrompt = { agent: tab, value: "" };
    return;
  }
  selections[tab.key] = option.value;
  nextTab();
}

function acceptCustom() {
  const model = customPrompt.value.trim() || customPrompt.agent.fallback;
  selections[customPrompt.agent.key] = model;
  customPrompt = null;
  nextTab();
}

function handleInput(chunk) {
  const text = chunk.toString("utf8");
  if (text === "\u001b[A") {
    const tab = tabs[activeTab];
    if (tab.key !== "confirm") selectedIndexes[tab.key] = Math.max(selectedIndexes[tab.key] - 1, 0);
    render();
    return;
  }
  if (text === "\u001b[B") {
    const tab = tabs[activeTab];
    if (tab.key !== "confirm") selectedIndexes[tab.key] = Math.min(selectedIndexes[tab.key] + 1, optionsFor(tab).length - 1);
    render();
    return;
  }
  if (text === "\u001b[C") {
    nextTab();
    render();
    return;
  }
  if (text === "\u001b[D") {
    previousTab();
    render();
    return;
  }
  for (const char of text) {
    if (char === "\u0003") {
      cleanup();
      process.exit(130);
    }
    if (char === "\u001b") finishSkipped();

    if (customPrompt) {
      if (char === "\r" || char === "\n") {
        acceptCustom();
      } else if (char === "\u007f" || char === "\b") {
        customPrompt.value = customPrompt.value.slice(0, -1);
      } else if (char >= " ") {
        customPrompt.value += char;
      }
      render();
      continue;
    }

    const tab = tabs[activeTab];
    if (char === "\t") {
      nextTab();
    } else if (char === "\r" || char === "\n") {
      confirmCurrent();
    }
  }
  render();
}

process.on("exit", () => {
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
});

if (process.stdin.isTTY) process.stdin.setRawMode(true);
process.stdin.resume();
process.stdin.on("data", handleInput);
render();
