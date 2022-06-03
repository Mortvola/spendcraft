#!/bin/bash

set -e

./build.sh

rm build.zip;
zip -r build build;
# to-debertas build.zip

scp -i ~/.ssh/debertas.pem build.zip ubuntu@ec2-54-190-121-102.us-west-2.compute.amazonaws.com:
