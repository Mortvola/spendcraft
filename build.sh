#!/bin/bash

set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
cd "$SCRIPT_DIR"

# Release dependencies must be installed in this checkout, never shared by symlink.
if [ -L node_modules ]; then
  echo 'Release build refuses a symlinked node_modules directory.' >&2
  exit 1
fi
if ! git diff --quiet HEAD -- package.json package-lock.json; then
  echo 'Release dependency manifests must match the committed HEAD.' >&2
  exit 1
fi
npm ci

npm run server-build
node installer/captureDeploymentManifests.mjs --write-build-source "$PWD/build/release-source.json"
node installer/releasePackage.mjs package --root "$PWD"
