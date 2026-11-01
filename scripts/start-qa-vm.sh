#!/bin/bash
set -euo pipefail
umask 077
root=$(cd "$(dirname "$0")/.." && pwd)
mkdir -p "$root/artifacts"
disk="$root/artifacts/lumius-test.qcow2"
[[ -f "$disk" ]] || qemu-img create -f qcow2 "$disk" 40G
vars="$root/artifacts/OVMF_VARS.fd"
[[ -f "$vars" ]] || cp /usr/share/OVMF/OVMF_VARS_4M.fd "$vars"
args=()
[[ ${1:-live} != live ]] || args+=(-cdrom "$root/artifacts/lumius-0.1.0-amd64.iso" -boot d)
accel=tcg,thread=multi
[[ ! -w /dev/kvm ]] || accel=kvm
exec qemu-system-x86_64 -accel "$accel" -m 4096 -smp 4 -drive if=pflash,format=raw,readonly=on,file=/usr/share/OVMF/OVMF_CODE_4M.fd -drive "if=pflash,format=raw,file=$vars" -device virtio-vga -display none -device qemu-xhci -device usb-tablet -audiodev none,id=audio0 -device intel-hda -device hda-duplex,audiodev=audio0 -drive "file=$disk,format=qcow2,if=virtio" -nic user,model=virtio-net-pci -serial "file:$root/artifacts/vm-serial.log" -qmp unix:/var/tmp/lumius-qmp.sock,server=on,wait=off -chardev socket,path=/var/tmp/lumius-guest.sock,server=on,wait=off,id=guest0 -device virtio-serial -device virtserialport,chardev=guest0,name=org.qemu.guest_agent.0 "${args[@]}"
