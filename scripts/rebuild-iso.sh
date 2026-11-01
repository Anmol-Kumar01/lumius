#!/bin/bash
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
work=$(realpath "${LUMIUS_ISO_WORK:-/var/tmp/lumius-iso}")
[[ "$work" != / && -d "$work/.build" && -d "$work/config" ]] || { echo 'Not an existing Lumius build workspace.' >&2; exit 1; }
cd "$work"
# Only generated binary-image stages are reset; the Debian desktop chroot is reused.
lb clean --binary
exec bash "$root/scripts/build-iso.sh"
