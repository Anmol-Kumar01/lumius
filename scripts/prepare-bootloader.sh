#!/bin/bash
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
work=${LUMIUS_ISO_WORK:-/var/tmp/lumius-iso}
mkdir -p "$work/config/bootloaders/grub-pc"
cp -a /usr/share/live/build/bootloaders/grub-pc/. "$work/config/bootloaders/grub-pc/"
cp -a "$root/os/bootloaders/." "$work/config/bootloaders/"
sed -i '/^insmod play$/d; /^play 960 /d' "$work/config/bootloaders/grub-pc/config.cfg"
printf '\nset timeout=5\n' >> "$work/config/bootloaders/grub-pc/config.cfg"
find "$work/config/bootloaders" -type d -exec chmod 755 {} +
find "$work/config/bootloaders" -type f -exec chmod 644 {} +
