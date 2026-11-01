#!/bin/bash
set -euo pipefail
if [[ $(id -u) != 0 ]]; then echo 'Run with sudo on Debian 13.' >&2; exit 1; fi
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y build-essential pkg-config libwebkit2gtk-4.1-dev libssl-dev libdbus-1-dev librsvg2-dev libayatana-appindicator3-dev patchelf curl git nodejs npm live-build debootstrap squashfs-tools xorriso grub-pc-bin grub-efi-amd64-bin mtools dosfstools syslinux-common syslinux isolinux qemu-system-x86 ovmf rsync
if ! command -v rustup >/dev/null; then curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal; fi
echo 'Linux prerequisites installed. Source $HOME/.cargo/env before building.'
