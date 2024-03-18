#!/usr/bin/env bash

scriptdir="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "${scriptdir}"

gen_archive() {
  browser="${1}"

  # easier to see args in an array than a string
  args=()
  args+=("icons/")
  args+=("src/")
  args+=("manifest_${browser}.json")

  # exclude
  args+=("-x")
  args+=("*.DS_Store")
  args+=("*Thumbs.db")

  archive="archive_${browser}.zip"

  if [ -f "${archive}" ]; then
    rm "${archive}"
  fi

  zip -r "${archive}" "${args[@]}"
  printf "@ manifest_${browser}.json\n@=manifest.json\n" | zipnote -w "${archive}"
}

gen_archive chrome
gen_archive firefox
