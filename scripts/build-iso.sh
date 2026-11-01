#!/bin/bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
[[ $(id -u) == 0 ]] || { echo 'Run with sudo: live-build needs chroot/mount privileges.' >&2; exit 1; }
root=$(cd "$(dirname "$0")/.." && pwd)
deb=$(find "$root/artifacts" -maxdepth 1 -iname 'lumius*.deb' -print -quit)
[[ -n "$deb" ]] || { echo 'Build the native .deb first.' >&2; exit 1; }
work=${LUMIUS_ISO_WORK:-/var/tmp/lumius-iso}
mkdir -p "$work"
cd "$work"
[[ ! -e lumius-amd64.hybrid.iso ]] || { echo 'Existing ISO build present; choose a new LUMIUS_ISO_WORK directory.' >&2; exit 1; }
bash "$root/scripts/configure-iso.sh"
bash "$root/scripts/prepare-bootloader.sh"
mkdir -p config/package-lists config/packages.chroot config/includes.chroot config/hooks/live
cp "$root/os/packages.list.chroot" config/package-lists/lumius.list.chroot
cp "$deb" config/packages.chroot/
bash "$root/scripts/install-overlay.sh" "$work/config/includes.chroot"
cp "$root/os/0100-lumius.hook.chroot" config/hooks/live/
chmod +x config/hooks/live/0100-lumius.hook.chroot
lb bootstrap 2>&1 | tee "$root/artifacts/iso-build.log"
lb chroot 2>&1 | tee -a "$root/artifacts/iso-build.log"
# Refresh project assets when reusing a prewarmed desktop chroot.
bash "$root/scripts/install-overlay.sh" "$work/chroot"
chroot chroot sed -i 's/^branding: debian/branding: lumius/' /etc/calamares/settings.conf
# Reapply the project hook when a previous development chroot was prewarmed.
cp "$root/os/0100-lumius.hook.chroot" chroot/tmp/lumius-hook.sh
chroot chroot sh /tmp/lumius-hook.sh
rm chroot/tmp/lumius-hook.sh
# Explicit install also supports a prewarmed desktop chroot from prepare-desktop.sh.
cp "$deb" chroot/tmp/lumius.deb
chroot chroot dpkg -i /tmp/lumius.deb
cp -a chroot/etc/resolv.conf chroot/etc/resolv.conf.lumius-saved
rm chroot/etc/resolv.conf
cp /etc/resolv.conf chroot/etc/resolv.conf
trap 'mv -Tf chroot/etc/resolv.conf.lumius-saved chroot/etc/resolv.conf' EXIT
chroot chroot apt-get update
chroot chroot apt-get install -y qemu-guest-agent ntfs-3g exfatprogs console-setup
chroot chroot apt-get purge -y plasma-welcome
# Flathub gives Discover a full app catalogue; flatpak reads remotes.d on first use.
mkdir -p chroot/etc/flatpak/remotes.d
curl -fsSL https://dl.flathub.org/repo/flathub.flatpakrepo -o chroot/etc/flatpak/remotes.d/flathub.flatpakrepo
mv -Tf chroot/etc/resolv.conf.lumius-saved chroot/etc/resolv.conf
trap - EXIT
for directory in chroot chroot/usr chroot/usr/bin chroot/usr/sbin chroot/etc; do
    mode=$(stat -c %a "$directory")
    [[ $(stat -c %u "$directory") == 0 ]] || { echo "System directory is not owned by root: $directory" >&2; exit 1; }
    (( (8#$mode & 0022) == 0 )) || { echo "Unsafe system directory permissions: $directory ($mode)" >&2; exit 1; }
done
stat -c '%a %u:%g %n' chroot chroot/usr chroot/usr/bin chroot/usr/sbin chroot/etc > "$root/artifacts/root-permissions.txt"
chroot chroot dpkg-query -W > chroot.packages.live
chroot chroot dpkg-query -W -f='${source:Package}\t${source:Version}\n' | sort -u > "$root/artifacts/iso-source-packages.tsv"
rm chroot/tmp/lumius.deb
lb binary 2>&1 | tee -a "$root/artifacts/iso-build.log"
cp lumius-amd64.hybrid.iso "$root/artifacts/lumius-0.1.0-amd64.iso"
chroot chroot dpkg-query -W > "$root/artifacts/iso-packages.txt"
cd "$root/artifacts"
sha256sum lumius-0.1.0-amd64.iso > lumius-0.1.0-amd64.iso.sha256
echo 'ISO built. Boot and installation validation are still required.'
