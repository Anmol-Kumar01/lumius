#!/bin/bash
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
iso="$root/artifacts/lumius-0.1.0-amd64.iso"
disk="$root/artifacts/lumius-test.qcow2"
[[ -f "$disk" ]] || qemu-img create -f qcow2 "$disk" 40G
accel=tcg
[[ -w /dev/kvm ]] && accel=kvm
args=()
if [[ ${1:-live} == live ]]; then args+=(-cdrom "$iso" -boot d); fi
vars="$root/artifacts/OVMF_VARS.fd"
[[ -f "$vars" ]] || cp /usr/share/OVMF/OVMF_VARS_4M.fd "$vars"
exec qemu-system-x86_64 -accel "$accel" -m 4096 -smp 4 -drive if=pflash,format=raw,readonly=on,file=/usr/share/OVMF/OVMF_CODE_4M.fd -drive "if=pflash,format=raw,file=$vars" -device virtio-vga -display gtk -device qemu-xhci -device usb-tablet -audiodev none,id=audio0 -device intel-hda -device hda-duplex,audiodev=audio0 -drive "file=$disk,format=qcow2,if=virtio" -nic user,model=virtio-net-pci -serial "file:$root/artifacts/vm-serial.log" "${args[@]}"
