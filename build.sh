#!/bin/bash

set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
cd "$SCRIPT_DIR"

npm run server-build
node installer/captureDeploymentManifests.mjs --write-build-source "$PWD/build/release-source.json"
node installer/releasePackage.mjs package --root "$PWD"
