#!/bin/bash

set -e

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 production|staging" >&2
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
    echo "Usage: $0 production|staging" >&2
    exit 1
    ;;
esac

./build.sh

rm -f build.zip;
zip -r build build > /dev/null;

sed "s/^INSTALL_TARGET=unconfigured$/INSTALL_TARGET=$1/" ./install.sh0 > install.sh
base64 -i ./build.zip >> install.sh
chmod u+x install.sh

scp -i "$DEPLOY_SSH_KEY" install.sh "ubuntu@${DEPLOY_SERVER}:"
