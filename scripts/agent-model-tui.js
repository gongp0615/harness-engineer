#!/usr/bin/env node
"use strict";

const fs = require("node:fs");

const outputPath = process.argv[2];
if (!outputPath) {
  console.error("Usage: agent-model-tui.js <env-output-file>");
  process.exit(2);
}

const agents = [
  { key: "planner", label: "Planner", fallback: "gpt-5.4" },
  { key: "executor", label: "Executor", fallback: "claude-sonnet-4.6" },
  { key: "verifier", label: "Verifier", fallback: "gpt-5.3-codex" },
  { key: "debugger", label: "Debugger", fallback: "gpt-5.4" },
  { key: "reviewer", label: "Reviewer", fallback: "gpt-5.4" }
];

const optionSpecs = [
  (agent) => ({ value: agent.fallback, label: `${agent.fallback} (Recommended)`, description: "Default selected for this Harness role." }),
  () => ({ value: "gpt-5.4", label: "gpt-5.4", description: "Strong planning, debugging, and review reasoning." }),
  () => ({ value: "gpt-5.3-codex", label: "gpt-5.3-codex", description: "Coding-focused model for implementation and verification." }),
  () => ({ value: "claude-sonnet-4.6", label: "claude-sonnet-4.6", description: "Balanced Claude model for broad engineering work." }),
  () => ({ value: "claude-haiku-4.5", label: "claude-haiku-4.5", description: "Fast Claude model for budget-sensitive runs." }),
  () => ({ value: "gemini-3.1-pro", label: "gemini-3.1-pro", description: "Broad reasoning fallback for mixed tasks." }),
  () => ({ value: "kimi-k2-thinking", label: "kimi-k2-thinking", description: "Reasoning-oriented Kimi model." }),
  () => ({ value: "__custom__", label: "Type your own answer", description: "Enter an exact CodeBuddy model id." })
];

const confirmTab = { key: "confirm", label: "Confirm" };
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

function render() {
  process.stdout.write("\x1b[2J\x1b[H\x1b[?25l");
  process.stdout.write(`${tabs.map((tab, index) => (index === activeTab ? `\x1b[7m ${tab.label} \x1b[0m` : ` ${tab.label} `)).join("  ")}\n\n`);

  if (customPrompt) {
    process.stdout.write(`Select model for Harness ${customPrompt.agent.label.toLowerCase()}\n\n`);
    process.stdout.write(`Custom model id: ${customPrompt.value}\n\n`);
    process.stdout.write("Enter accepts, Esc skips model config.\n");
    return;
  }

  const tab = tabs[activeTab];
  if (tab.key === "confirm") {
    process.stdout.write("Confirm Harness agent models\n\n");
    const nameWidth = Math.max(...agents.map((agent) => agent.label.length));
    for (const agent of agents) {
      process.stdout.write(`${agent.label.padEnd(nameWidth)}  ${selections[agent.key]}\n`);
    }
    process.stdout.write("\nEnter accepts these selections. Esc skips model config.\n");
    return;
  }

  process.stdout.write(`Select model for Harness ${tab.label.toLowerCase()}\n\n`);
  const options = optionsFor(tab);
  for (let index = 0; index < options.length; index += 1) {
    const marker = index === selectedIndexes[tab.key] ? ">" : " ";
    process.stdout.write(`${marker} ${options[index].label}\n`);
    process.stdout.write(`  ${options[index].description}\n`);
  }
  process.stdout.write("\nUp/Down selects. Tab/Right advances. Left goes back. Enter confirms. Esc skips.\n");
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
