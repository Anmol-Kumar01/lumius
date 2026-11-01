#!/bin/bash
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
source "$HOME/.cargo/env"
cd "$root/src-tauri"
cargo test --locked
echo 'Native filesystem tests passed. These do not replace a full desktop session test.'
