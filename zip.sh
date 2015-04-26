#!/usr/bin/env bash

# run this from the package directory

# easier to see args in an array than a string
ARGS=()
ARGS+=("icons/")
ARGS+=("src/")
ARGS+=("manifest.json")

# exclude
ARGS+=("-x")
ARGS+=("*.DS_Store")

rm archive.zip
zip -r archive.zip "${ARGS[@]}"

