# Harness for CodeBuddy

Harness for CodeBuddy is a CodeBuddy Code CLI plugin that adds a small engineering control plane around coding sessions: planning, verification, recovery, profile diagnostics, policy gates, and bounded autonomous execution.

It is not a prompt pack. The package installs CodeBuddy slash commands, skills, agents, hooks, and a local `harness` CLI. Project state and evidence live in the target repository under `.harness-engineer/`.

中文文档见 [README.zh-CN.md](README.zh-CN.md).

## What It Provides

- Slash commands for init, plan, run, verify, status, recover, evidence, doctor, and policy checks.
- Planner, executor, verifier, and debugger agents for CodeBuddy.
- Hook-based safety gates for obviously destructive shell commands.
- Verification profiles in `harness/profiles/*.yaml`.
- Project state in `.harness-engineer/`: task state, plans, specs, contracts, evidence, evaluations, risks, and hook logs.
- A bounded autonomous loop: planner -> executor -> verifier -> fix.
- Profile diagnostics so empty verification cannot accidentally pass.

## Install

Install from GitHub:

```bash
curl -fsSL https://raw.githubusercontent.com/gongp0615/harness-for-codebuddy/refs/heads/main/install.sh | bash
```

Install from a local checkout:

```bash
bash install.sh
```

The installer registers a local CodeBuddy marketplace under:

```text
${CODEBUDDY_HOME:-$HOME/.codebuddy}/marketplaces/harness-engineer
```

It also updates:

```text
${CODEBUDDY_HOME:-$HOME/.codebuddy}/settings.json
```

Restart CodeBuddy Code CLI after installation or plugin updates.

Uninstall:

```bash
harness uninstall
```

Uninstall removes the local CodeBuddy marketplace entry, disables the plugin in CodeBuddy settings, deletes the installed plugin copy, and removes the local `harness` launcher. It does not delete project-level `.harness-engineer/` or `harness/` directories.

## First Run

Check the plugin installation:

```bash
harness doctor
```

Initialize a project:

```bash
harness init --profile node
```

For non-Node projects:

```bash
harness init --profile generic
```

Optional CI setup:

```bash
harness init --profile node --ci github
harness init --profile node --ci generic
```

Record a supervised plan:

```bash
harness plan --task "add retry tests for failed checkout submissions"
```

`harness plan` writes `plan.md`, `spec.md`, and `contract.md` under `.harness-engineer/`, so supervised and autonomous workflows share the same task semantics.

## Verification Profiles

Profiles live in `harness/profiles/*.yaml`.

Node example:

```yaml
name: default
steps:
  - name: test
    command: npm test
    required: true
```

C++ CMake example:

```yaml
name: default
steps:
  - name: configure
    command: cmake -S . -B build
    required: true
  - name: test
    command: cmake --build build && ctest --test-dir build --output-on-failure
    required: true
```

Gradual adoption for legacy projects:

```yaml
name: default
steps:
  - name: smoke
    command: ./scripts/smoke-test.sh
    required: true
  - name: lint-known-clean-area
    command: ./scripts/lint.sh src/new-module
    required: false
```

Use `required: true` for commands that must pass before review or autonomous completion. Use `required: false` only for advisory checks.

Inspect profiles:

```bash
harness profile list
harness profile show default
harness profile doctor default
```

Empty profiles and optional-only profiles fail closed. `harness verify --profile <name>` writes `NO_VERIFICATION_STEPS` evidence unless the profile contains at least one executable `required: true` step.

Run verification:

```bash
harness verify --profile default
```

Summarize evidence for review:

```bash
harness evidence --summary
```

## Autonomous Runs

Use autonomous mode only when the task is clear enough to execute without new requirements. For vague tasks, plan or clarify first.

Preview readiness without invoking CodeBuddy:

```bash
harness run --task "stabilize checkout retry handling" --profile default --max-rounds 5 --dry-run
```

Dry run does not write `.harness-engineer/run.json`. It reports the task, profile diagnostics, CodeBuddy executable, headless permission arguments, max rounds, artifact paths, and `ready`. If `ready=false`, the exit code is 1.

Start a bounded run:

```bash
harness run --task "stabilize checkout retry handling" --profile default --max-rounds 5
```

Harness invokes CodeBuddy headless:

```text
codebuddy -p ... -y --permission-mode bypassPermissions --subagent-permission-mode bypassPermissions --agent <planner|executor|verifier>
```

Use this only in repositories where that permission level is acceptable.

Autonomous artifacts:

```text
.harness-engineer/spec.md
.harness-engineer/contract.md
.harness-engineer/run.json
.harness-engineer/evaluation.json
.harness-engineer/evidence.json
```

Planner output must be strict JSON with:

```text
ready_to_execute, missing_requirements, spec_markdown, contract_markdown, summary
```

If `ready_to_execute=false`, the run stops at `SPEC_NEEDS_CLARIFICATION` and does not invoke the executor.

Verifier output must be strict JSON with:

```text
pass, safe_to_continue, summary, fix_instructions
```

Invalid verifier JSON stops the run with `verifier_invalid_json`. Passing shell commands alone are not enough; required verification must pass and the verifier must return `pass: true`.

Stop conditions:

- Required verification passes and verifier returns `pass: true`.
- Planner reports missing requirements.
- `--max-rounds` is reached.
- CodeBuddy cannot be found or a headless agent call fails.
- Planner or verifier JSON is invalid.
- Verifier returns `safe_to_continue: false`.

Resume a stopped run without rerunning the planner:

```bash
harness run --resume --max-rounds 8
```

Resume reads `.harness-engineer/run.json`, `evaluation.json`, and `contract.md`, then continues from the next executor/verifier round. It does not allow changing the task. `--max-rounds` can only stay the same or increase.

Check state and recovery guidance:

```bash
harness status
harness recover
```

## Safety Policy

The plugin registers CodeBuddy hooks for session lifecycle and tool-use checks. Hook events are written to:

```text
.harness-engineer/hook-events.jsonl
```

The default shell policy blocks a narrow set of destructive commands, including `git reset --hard`, `git clean -fdx`, and root-level `rm -rf /`. Project policies live in:

```text
harness/policies/
```

Run a policy check manually:

```bash
harness policy-check --command "git reset --hard"
```

## Manual CodeBuddy Smoke

Real CodeBuddy smoke testing is intentionally manual so automated tests do not depend on a local CodeBuddy installation.

1. In a disposable repository, configure a passing `required: true` profile.
2. Run `harness run --task "make a tiny harmless change" --dry-run` and confirm `ready: true`.
3. Run `harness run --task "make a tiny harmless change" --max-rounds 1`.
4. Confirm `.harness-engineer/run.json`, `spec.md`, `contract.md`, `evaluation.json`, and `evidence.json` exist.
5. Confirm `harness status` and `harness recover` report the stop reason and resume guidance.

## Repository Layout

```text
.codebuddy-plugin/          CodeBuddy plugin and marketplace manifests
agents/                     Planner, executor, verifier, debugger prompts
bin/harness                 CLI wrapper
commands/                   CodeBuddy slash commands
docs/                       User and AI engineering docs
harness/profiles/           Default verification profiles
harness/policies/           Default shell, approval, and file-scope policies
hooks/                      CodeBuddy hook registry and implementations
scripts/cli.js              harness CLI entrypoint
scripts/harness-engine/     State, profile, policy, and autonomous orchestration
skills/                     CodeBuddy workflow skills
tests/                      Node test suite
```

## Development

```bash
npm test
node scripts/cli.js doctor
node scripts/cli.js verify
```

This repository is a CodeBuddy-specific plugin package, not a cross-platform plugin bundle.
