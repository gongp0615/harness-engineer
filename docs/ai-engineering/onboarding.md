# Onboarding

1. Run `harness doctor` after installing the plugin.
2. Run `harness init --profile node` for Node projects or `harness init --profile generic` otherwise. Use `harness init --profile node --with-ci` when the project should enable GitHub Actions CI.
3. Start work with `harness plan --task "<task>"`.
4. Run `harness verify --profile default` before review.
