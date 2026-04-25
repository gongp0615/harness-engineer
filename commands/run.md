---
description: Run the autonomous Harness planner/executor/verifier loop for a task.
allowed-tools: Bash
---

Run `harness run --task "<task>" --profile default --max-rounds 5 --json`.
Use the user's task text as `<task>`. Report the run id, final status, stop reason, current round, and the latest evaluator summary.

If the user asks to preview readiness, run `harness run --task "<task>" --profile default --max-rounds 5 --dry-run --json` and report `ready`, profile diagnostics, CodeBuddy executable, and reasons.

If the user asks to continue an existing autonomous run, run `harness run --resume --max-rounds <n> --json` without changing the task.
