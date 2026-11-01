#!/bin/bash
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
source "$HOME/.cargo/env"
cd "$root"
chmod 644 LICENSE README.md THIRD_PARTY.md
find src-tauri/icons -type d -exec chmod 755 {} +
find src-tauri/icons -type f -exec chmod 644 {} +
npm ci
npm run build
cd src-tauri
cargo test --locked
cd ..
npm run tauri -- build --bundles deb
mkdir -p artifacts
cp src-tauri/target/release/bundle/deb/*.deb artifacts/
sha256sum artifacts/*.deb > artifacts/packages.sha256
