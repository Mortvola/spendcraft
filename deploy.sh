#!/bin/bash

. $HOME/.bash_aliases

npm run welcome-build
npm run client-build
npm run server-build

rm build.zip;
zip -r build build;
to-debertas build.zip
