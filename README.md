# Harness for CodeBuddy

Harness for CodeBuddy is a **CodeBuddy Code CLI plugin** that adds a lightweight engineering control plane for day-to-day coding tasks.

It is not a generic prompt pack. The plugin bundles CodeBuddy slash commands, skills, agents, hooks, and a small `harness` CLI so CodeBuddy can plan work, preserve task state, run verification, and block obviously dangerous shell actions before they reach your project.

## What It Adds

- **Slash commands** for common engineering checkpoints:
  `/harness-engineer:plan`, `/harness-engineer:verify`, `/harness-engineer:status`, `/harness-engineer:doctor`, `/harness-engineer:recover`
- **Skills** that guide planning, execution, verification, status checks, recovery, and install diagnosis.
- **Role agents** for planner, executor, verifier, and debugger work.
- **Hooks** for CodeBuddy session lifecycle and tool-use gates.
- **Safety policy** that blocks high-risk shell commands such as `git reset --hard`, `git clean -fdx`, and root-level `rm -rf /`.
- **Verification discovery** for Node projects, running available scripts in this order: `typecheck`, `lint`, `test`, `build`.
- **Local marketplace installer** that registers the plugin in CodeBuddy settings.

## Typical Workflow

```text
/harness-engineer:plan add retry tests for failed checkout submissions
/harness-engineer:status
/harness-engineer:verify
/harness-engineer:recover
```

The intent is to keep a coding session honest:

1. Plan before edits when the task is non-trivial.
2. Execute in small, reversible steps.
3. Run the verification command that proves the change.
4. Report remaining risks instead of guessing.
5. Recover context after an interrupted session.

## Install

From GitHub:

```bash
curl -fsSL https://raw.githubusercontent.com/gongp0615/harness-for-codebuddy/refs/heads/main/install.sh | bash
```

From a local checkout:

```bash
bash install.sh
```

The installer writes a local CodeBuddy marketplace to:

```text
${CODEBUDDY_HOME:-$HOME/.codebuddy}/marketplaces/harness-engineer
```

It also updates:

```text
${CODEBUDDY_HOME:-$HOME/.codebuddy}/settings.json
```

After enabling or changing plugins, restart CodeBuddy Code CLI so it reloads plugin metadata.

## Verify Installation

```bash
harness doctor
```

Expected result: every check reports `"ok": true`.

You can also inspect current project state:

```bash
harness status
```

Run discovered project verification commands:

```bash
harness verify
```

## Plugin Contents

```text
.codebuddy-plugin/plugin.json   CodeBuddy plugin manifest
.codebuddy-plugin/marketplace.json
commands/                       User-triggered slash commands
skills/                         AI-selected workflow skills
agents/                         Planner/executor/verifier/debugger prompts
hooks/hooks.json                CodeBuddy hook registration
hooks/*.js                      Hook implementations and safety policy
scripts/cli.js                  harness CLI entrypoint
scripts/installer.js            local CodeBuddy marketplace installer
bin/harness                     CLI wrapper
```

## Hook Behavior

The plugin registers these CodeBuddy hook events:

- `SessionStart`
- `PreToolUse`
- `PostToolUse`
- `Stop`
- `PreCompact`

Hook events are recorded under the current project:

```text
.harness-engineer/hook-events.jsonl
```

`PreToolUse` includes a small safety policy for shell commands. It blocks a narrow set of destructive commands and lets normal tool use continue.

## Current Scope

This is an alpha plugin focused on supervised engineering sessions:

- Works best for bug fixes, small features, test additions, and review feedback.
- Verification discovery currently targets Node projects through `package.json` scripts.
- It does not replace CodeBuddy's built-in reasoning; it gives CodeBuddy stronger workflow structure and evidence gates.
- Live CodeBuddy UI behavior depends on CodeBuddy's plugin loader and hook implementation.

## Development

```bash
npm test
npm run harness -- doctor
node scripts/cli.js verify
```

This repository intentionally targets **CodeBuddy only**. Codex plugin compatibility is not maintained.
