#!/usr/bin/env bash
# Runs a VS Code test script under xvfb. GitHub's runners sometimes fail to start the
# VS Code window ("CodeWindow: detected unresponsive") before any test runs. That is
# retried; a run in which tests ran and failed is never retried, so real failures and
# flaky tests stay visible.
# usage: run-vscode-tests.sh <npm-script>
set -uo pipefail
script="$1"
log="$(mktemp)"
for attempt in 1 2 3; do
  if xvfb-run -a npm run "$script" 2>&1 | tee "$log"; then exit 0; fi
  if grep -qE "[0-9]+ (passing|failing)" "$log"; then
    echo "Tests ran and failed; not retrying."
    exit 1
  fi
  echo "::warning::VS Code did not start its tests (attempt $attempt of 3); retrying."
done
exit 1
