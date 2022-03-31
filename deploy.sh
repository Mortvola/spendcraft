#!/bin/bash

. $HOME/.bash_aliases

npm run welcome-build
npm run client-build
npm run server-build

rm build.zip;
zip -r build build;
# to-debertas build.zip

scp -i ~/.ssh/debertas.pem build.zip ubuntu@ec2-54-190-121-102.us-west-2.compute.amazonaws.com:
