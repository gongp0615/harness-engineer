# Autonomous Run Guide

Use `harness run` when a task is clear enough to execute but long enough to benefit from a bounded planner, executor, verifier, and fix loop.

```bash
harness run --task "add retry tests for failed checkout submissions"
```

Defaults:

- `--profile default`
- `--max-rounds 5`
- JSON output
- CodeBuddy headless full permission mode

Equivalent explicit form:

```bash
harness run --task "stabilize checkout retry handling" --profile ci --max-rounds 3 --json
```

Preflight without writing run state or invoking CodeBuddy:

```bash
harness run --task "stabilize checkout retry handling" --profile default --max-rounds 5 --dry-run
```

`--dry-run` reports profile readiness, CodeBuddy executable resolution, headless permission arguments, max rounds, and artifact paths. It exits non-zero when `ready` is false.

Before using a profile for autonomous mode, check it:

```bash
harness profile doctor default
```

Profiles with no executable required step are rejected. Empty profiles and optional-only profiles write `NO_VERIFICATION_STEPS` when used with `harness verify --profile <name>`.

The harness calls CodeBuddy as:

```text
codebuddy -p ... -y --permission-mode bypassPermissions --subagent-permission-mode bypassPermissions --agent <planner|executor|verifier>
```

Stop conditions:

- Required verification passes.
- The planner returns `ready_to_execute: false`, which stops at `SPEC_NEEDS_CLARIFICATION`.
- `--max-rounds` is reached.
- `codebuddy` or `cbc` cannot be found.
- A headless CodeBuddy call fails.
- The planner or verifier returns invalid JSON.
- The verifier returns `safe_to_continue: false`.

Agent output contracts:

- Planner JSON: `ready_to_execute`, `missing_requirements`, `spec_markdown`, `contract_markdown`, `summary`.
- Verifier JSON: `pass`, `safe_to_continue`, `summary`, `fix_instructions`.

Passing shell commands are necessary but not sufficient: the verifier must also return `pass: true`.

Artifacts:

- `.harness-engineer/spec.md`
- `.harness-engineer/contract.md`
- `.harness-engineer/run.json`
- `.harness-engineer/evaluation.json`
- `.harness-engineer/evidence.json`

Recovery:

```bash
harness status
harness recover
```

`status` reports the active run, round, last evaluator conclusion, and stop reason. `recover` gives the next action after interruption or `MAX_ROUNDS_REACHED`.

Resume from the next executor/verifier round:

```bash
harness run --resume --max-rounds 8
```

Resume reads `.harness-engineer/run.json`, `.harness-engineer/evaluation.json`, and `.harness-engineer/contract.md`. It does not rerun the planner, does not allow changing the task, and does not allow lowering `--max-rounds`.

Manual real CodeBuddy smoke:

1. Configure a disposable project with at least one passing `required: true` verification step.
2. Run `harness run --task "make a tiny harmless change" --dry-run` and confirm `ready: true`.
3. Run `harness run --task "make a tiny harmless change" --max-rounds 1`.
4. Inspect `.harness-engineer/run.json`, `spec.md`, `contract.md`, `evaluation.json`, and `evidence.json`.
5. Run `harness status` and `harness recover` to confirm stop reason and resume guidance.
