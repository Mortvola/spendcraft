#!/bin/bash

set -e

npm run server-build

node installer/captureDeploymentManifests.mjs --write-build-source "$PWD/build/release-source.json"
