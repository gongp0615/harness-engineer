#!/usr/bin/env bash
set -euo pipefail

HARNESS_REPO="${HARNESS_REPO:-gongp0615/harness-for-codebuddy}"
HARNESS_REF="${HARNESS_REF:-main}"
CODEBUDDY_HOME="${CODEBUDDY_HOME:-$HOME/.codebuddy}"

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

need git
need node

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]:-$0}")" >/dev/null 2>&1 && pwd || true)"
if [ -n "$script_dir" ] && [ -f "$script_dir/.codebuddy-plugin/plugin.json" ]; then
  source_dir="$script_dir"
  cleanup() { :; }
else
  tmp="$(mktemp -d)"
  cleanup() { rm -rf "$tmp"; }
  trap cleanup EXIT
  echo "Installing harness-engineer from https://github.com/${HARNESS_REPO} (${HARNESS_REF})"
  git clone --depth 1 --branch "$HARNESS_REF" "https://github.com/${HARNESS_REPO}.git" "$tmp/harness-for-codebuddy"
  source_dir="$tmp/harness-for-codebuddy"
fi

node "$source_dir/scripts/cli.js" install --source "$source_dir" --home "$CODEBUDDY_HOME"

if command -v harness >/dev/null 2>&1; then
  harness doctor
else
  "$HOME/.local/bin/harness" doctor
  echo "Add \$HOME/.local/bin to PATH to use the 'harness' command directly."
fi

enable_ci="${HARNESS_INSTALL_ENABLE_CI:-}"
if [ -z "$enable_ci" ] && [ -t 0 ]; then
  printf "Enable Harness GitHub Actions CI workflow in the current directory? [y/N] "
  read -r answer || answer=""
  case "$answer" in
    y|Y|yes|YES) enable_ci="1" ;;
    *) enable_ci="0" ;;
  esac
fi

if [ "$enable_ci" = "1" ]; then
  node "$source_dir/scripts/cli.js" init --profile "${HARNESS_INIT_PROFILE:-node}" --with-ci
  echo "Created .github/workflows/harness.yml in the current directory."
else
  echo "Skipped GitHub Actions CI workflow setup. Run 'harness init --profile node --with-ci' later to enable it."
fi
