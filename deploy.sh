#!/bin/bash

set -e

./build.sh

rm build.zip;
zip -r build build;

cp ./install.sh0 install.sh
base64 -i ./build.zip >> install.sh
chmod u+x install.sh

scp -i ~/.ssh/debertas.pem install.sh ubuntu@${SPENDCRAFT_SERVER}:

