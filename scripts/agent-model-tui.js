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

function optionsFor(agent) {
  return [
    { value: agent.fallback, label: `${agent.fallback}（推荐）`, hint: "按当前 agent 职责选择的默认模型" },
    { value: "gpt-5.4", label: "gpt-5.4", hint: "适合规划、调试和评审等高强度推理任务" },
    { value: "gpt-5.3-codex", label: "gpt-5.3-codex", hint: "偏代码执行和验证的 Codex 模型" },
    { value: "claude-sonnet-4.6", label: "claude-sonnet-4.6", hint: "均衡的 Claude 工程模型，适合执行实现" },
    { value: "claude-haiku-4.5", label: "claude-haiku-4.5", hint: "更快、更省预算的 Claude 模型" },
    { value: "gemini-3.1-pro", label: "gemini-3.1-pro", hint: "适合混合任务的通用推理备选" },
    { value: "kimi-k2-thinking", label: "kimi-k2-thinking", hint: "偏深度思考的 Kimi 模型" },
    { value: "__custom__", label: "输入自定义模型", hint: "手动输入一个准确的 CodeBuddy model id" }
  ];
}

function shellQuote(value) {
  return String(value).replace(/'/g, "'\\''");
}

function writeEnv(values) {
  const lines = Object.entries(values).map(([key, value]) => `export ${key}='${shellQuote(value)}'`);
  fs.writeFileSync(outputPath, `${lines.join("\n")}\n`, "utf8");
}

function formatSelections(selections) {
  return agents.map((agent) => `${agent.label.padEnd(2)}  ${selections[agent.key]}`).join("\n");
}

async function main() {
  const [{ default: color }, prompts] = await Promise.all([
    import("picocolors"),
    import("@clack/prompts")
  ]);

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    writeEnv({ HARNESS_AGENT_MODEL_MODE: "skip" });
    return;
  }

  const selections = {};
  const flow = agents.map((agent) => agent.label).join(color.dim(" → "));
  prompts.intro(color.bgBlue(color.black(" Harness agent 模型配置 ")));
  prompts.note(flow, "选择流程");

  for (const agent of agents) {
    const selected = await prompts.select({
      message: `为 Harness ${agent.label} agent 选择模型`,
      options: optionsFor(agent),
      initialValue: agent.fallback
    });

    if (prompts.isCancel(selected)) {
      prompts.cancel("已跳过模型配置，将继承 CodeBuddy 默认值。");
      writeEnv({ HARNESS_AGENT_MODEL_MODE: "skip" });
      return;
    }

    if (selected === "__custom__") {
      const custom = await prompts.text({
        message: `输入 Harness ${agent.label} agent 的模型 ID`,
        placeholder: agent.fallback,
        defaultValue: agent.fallback,
        validate(value) {
          return value.trim() ? undefined : "请输入模型 ID，或按 Esc 跳过模型配置。";
        }
      });

      if (prompts.isCancel(custom)) {
        prompts.cancel("已跳过模型配置，将继承 CodeBuddy 默认值。");
        writeEnv({ HARNESS_AGENT_MODEL_MODE: "skip" });
        return;
      }
      selections[agent.key] = String(custom).trim() || agent.fallback;
    } else {
      selections[agent.key] = selected;
    }
  }

  prompts.note(formatSelections(selections), "确认 Harness agent 模型");
  const accepted = await prompts.select({
    message: "是否使用以上模型配置?",
    options: [
      { value: "accept", label: "确认使用", hint: "写入安装环境变量" },
      { value: "skip", label: "跳过模型配置", hint: "继承 CodeBuddy 默认值" }
    ],
    initialValue: "accept"
  });

  if (prompts.isCancel(accepted) || accepted === "skip") {
    prompts.cancel("已跳过模型配置，将继承 CodeBuddy 默认值。");
    writeEnv({ HARNESS_AGENT_MODEL_MODE: "skip" });
    return;
  }

  writeEnv({
    HARNESS_AGENT_MODEL_MODE: "custom",
    HARNESS_AGENT_MODEL_PLANNER: selections.planner,
    HARNESS_AGENT_MODEL_EXECUTOR: selections.executor,
    HARNESS_AGENT_MODEL_VERIFIER: selections.verifier,
    HARNESS_AGENT_MODEL_DEBUGGER: selections.debugger,
    HARNESS_AGENT_MODEL_REVIEWER: selections.reviewer
  });
  prompts.outro(color.green("Harness agent 模型配置已确认。"));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
