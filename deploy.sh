#!/bin/bash

set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "Usage: $0 production|staging RELEASE_DIRECTORY" >&2
  exit 1
fi

case "$1" in
  production)
    : "${SPENDCRAFT_SERVER:?Set SPENDCRAFT_SERVER}"
    : "${SPENDCRAFT_SSH_KEY:?Set SPENDCRAFT_SSH_KEY}"
    DEPLOY_SERVER="$SPENDCRAFT_SERVER"
    DEPLOY_SSH_KEY="$SPENDCRAFT_SSH_KEY"
    ;;
  staging)
    : "${SPENDCRAFT_STAGING_SERVER:?Set SPENDCRAFT_STAGING_SERVER}"
    : "${SPENDCRAFT_STAGING_SSH_KEY:?Set SPENDCRAFT_STAGING_SSH_KEY}"
    DEPLOY_SERVER="$SPENDCRAFT_STAGING_SERVER"
    DEPLOY_SSH_KEY="$SPENDCRAFT_STAGING_SSH_KEY"
    ;;
  *)
    echo "Usage: $0 production|staging RELEASE_DIRECTORY" >&2
    exit 1
    ;;
esac

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
DEPLOY_DIR=$(mktemp -d "${TMPDIR:-/tmp}/spendcraft-deploy.XXXXXX")
trap 'rm -rf -- "$DEPLOY_DIR"' EXIT

node "$SCRIPT_DIR/installer/releasePackage.mjs" installer \
  --release "$2" --target "$1" --output "$DEPLOY_DIR/install.sh"

scp -i "$DEPLOY_SSH_KEY" "$DEPLOY_DIR/install.sh" "ubuntu@${DEPLOY_SERVER}:"
