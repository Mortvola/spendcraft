#!/bin/bash
# SpendCraft managed rollback launcher, format 1.
set -euo pipefail

LAUNCHER_ID=unconfigured
if [ "$#" -ne 1 ] || { [ "$1" != --dry-run ] && [ "$1" != --execute ]; }; then
  echo "Usage: $0 --dry-run|--execute" >&2
  exit 1
fi
if [ -L "$0" ]; then
  echo 'Invoke the installed maintenance/rollback.sh file directly, not through a symlink.' >&2
  exit 1
fi
MAINTENANCE=$(cd -- "$(dirname -- "$0")" && pwd -P)
ROOT=$(dirname -- "$MAINTENANCE")
if [ "$LAUNCHER_ID" = unconfigured ]; then
  echo 'This launcher template must be installed by the SpendCraft installer.' >&2
  exit 1
fi
if [ -n "${SPENDCRAFT_ROOT:-}" ] && [ "$(cd -- "$SPENDCRAFT_ROOT" && pwd -P)" != "$ROOT" ]; then
  echo 'SPENDCRAFT_ROOT does not match this installed rollback launcher.' >&2
  exit 1
fi
cd -- "$MAINTENANCE"
exec node "$MAINTENANCE/rollback/launcher-$LAUNCHER_ID/launchRollback.mjs" --root "$ROOT" "$1"
