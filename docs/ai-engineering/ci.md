# CI Integration

Use `harness verify --profile ci` in CI and upload `.harness-engineer/` as an artifact so review retains evidence.

Interactive `install.sh` asks whether to enable this workflow for the current directory. Project owners can also run:

```bash
harness init --profile node --with-ci
```

That copies `docs/ai-engineering/github-actions-harness.yml` into `.github/workflows/harness.yml`. Pushing that workflow file to GitHub requires an account or token with `workflow` permission.
