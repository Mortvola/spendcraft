#!/bin/bash

watchify -t [ babelify --presets [ @babel/preset-react @babel/env ] ] src/Main.js -o public/bundle.js -v
