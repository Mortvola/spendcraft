#!/bin/bash

set -e

#npm run welcome-build
npm run client-build
npm run server-build

mkdir ./build/public/.well-known
cp ./public/.well-known/apple-app-site-association ./build/public/.well-known/
