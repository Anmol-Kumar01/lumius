#!/bin/bash
set -euo pipefail
[[ $(id -u) == 0 ]] || exit 1
root=$(cd "$(dirname "$0")/.." && pwd)
work=${LUMIUS_ISO_WORK:-/var/tmp/lumius-iso}
mkdir -p "$work" "$root/artifacts"
cd "$work"
bash "$root/scripts/configure-iso.sh"
mkdir -p config/package-lists config/includes.chroot config/hooks/live
cp "$root/os/packages.list.chroot" config/package-lists/lumius.list.chroot
bash "$root/scripts/install-overlay.sh" "$work/config/includes.chroot"
cp "$root/os/0100-lumius.hook.chroot" config/hooks/live/
chmod +x config/hooks/live/0100-lumius.hook.chroot
lb bootstrap
lb chroot
