#!/bin/bash
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
for file in "$root"/scripts/*.sh "$root"/os/*.chroot; do
    bash -n "$file"
done
python3 -m py_compile "$root"/scripts/*.py
echo 'Shell syntax and Python compilation checks passed.'
