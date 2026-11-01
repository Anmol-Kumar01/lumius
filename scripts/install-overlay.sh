#!/bin/bash
# Normalize Windows/NTFS metadata before copying into a Linux root filesystem.
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
work=$(realpath -m "${LUMIUS_ISO_WORK:-/var/tmp/lumius-iso}")
destination=$(realpath -m "$1")
[[ "$destination" == "$work/chroot" || "$destination" == "$work/config/includes.chroot" ]] || { echo 'Refusing an overlay destination outside the ISO workspace.' >&2; exit 1; }
mkdir -p "$destination"
stage=$(mktemp -d /var/tmp/lumius-overlay.XXXXXXXX)
trap '[[ "$stage" == /var/tmp/lumius-overlay.* ]] && rm -rf -- "$stage"' EXIT
cp -a "$root/os/overlay/." "$stage/"
chown -hR 0:0 "$stage"
find "$stage" -type d -exec chmod 755 {} +
find "$stage" -type f -exec chmod 644 {} +
cp -a "$stage/." "$destination/"
[[ $(stat -c %a "$destination") == 755 ]] || { echo 'Root overlay permissions are invalid.' >&2; exit 1; }
