#!/bin/bash

set -e

./build.sh

rm build.zip;
zip -r build build;

scp -i ~/.ssh/debertas.pem build.zip ubuntu@${SPENDCRAFT_SERVER}:

