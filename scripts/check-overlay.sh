#!/bin/bash
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
sandbox=$(mktemp -d /var/tmp/lumius-permission-test.XXXXXXXX)
trap '[[ "$sandbox" == /var/tmp/lumius-permission-test.* ]] && rm -rf -- "$sandbox"' EXIT
mkdir -p "$sandbox/project/scripts" "$sandbox/project/os/overlay/usr/bin"
cp "$root/scripts/install-overlay.sh" "$sandbox/project/scripts/"
printf 'test overlay payload\n' > "$sandbox/project/os/overlay/usr/bin/sample"
find "$sandbox/project/os/overlay" -type d -exec chmod 777 {} +
chmod 777 "$sandbox/project/os/overlay/usr/bin/sample"
chown -hR 1000:1000 "$sandbox/project/os/overlay"
export LUMIUS_ISO_WORK="$sandbox/work"
bash "$sandbox/project/scripts/install-overlay.sh" "$sandbox/work/chroot"
[[ $(stat -c %a "$sandbox/work/chroot") == 755 ]]
[[ $(stat -c %a "$sandbox/work/chroot/usr/bin") == 755 ]]
[[ $(stat -c %a "$sandbox/work/chroot/usr/bin/sample") == 644 ]]
[[ $(stat -c %u "$sandbox/work/chroot/usr/bin/sample") == 0 ]]
if bash "$sandbox/project/scripts/install-overlay.sh" / >/dev/null 2>&1; then
    echo 'Overlay accepted an unsafe target.' >&2
    exit 1
fi
echo 'NTFS-style 0777 overlay permissions normalize to 0755 directories / 0644 files; unsafe targets refused.'
