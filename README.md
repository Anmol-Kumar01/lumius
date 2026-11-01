# Lumius

An installable Debian-based desktop project with a frosted glass shell, Files, Settings and a top-edge island. This source repository is under active implementation. Browser screenshots are design previews, not evidence of a booted OS.

## Build on Debian 13 amd64

On a Windows laptop, follow [docs/RUN-ON-WINDOWS.md](docs/RUN-ON-WINDOWS.md). On Ubuntu or another distribution, follow the step-by-step guide in [docs/BUILD.md](docs/BUILD.md), which builds inside a Debian 13 container.

```sh
sudo bash scripts/bootstrap-linux.sh
bash scripts/build-linux.sh
sudo bash scripts/build-iso.sh
bash scripts/run-vm.sh live
# Install inside the VM, shut down, then boot without the ISO:
bash scripts/run-vm.sh installed
```

Use a Linux filesystem for builds (for example `/root/lumius-build` in WSL), rather than an NTFS bind mount. ISO creation requires working chroot and mount support. The VM script uses KVM if available and falls back to slower TCG. Allocate at least 4 GiB to the VM and allow substantial disk space for Debian packages and build artifacts.

## Application development

```sh
npm ci
npm run dev          # labelled browser design preview
npm run tauri dev    # native Files application
npm run tauri -- dev -- --shell  # island and dock
npm run build
npm test
```

Native application supports `--shell` and `--settings`. A single-instance process shares transfer state between island, dock and Files windows. File operations run on worker threads. Copy/move stage data before committing, refuse existing destinations and expose progress/cancellation. ZIP extraction refuses path traversal and symlinks. Search uses an explicit home filename index excluding hidden directories.

Settings are stored in `$XDG_CONFIG_HOME/lumius/settings.json`; search index in `$XDG_CACHE_HOME/lumius/files.sqlite`. Linux services are accessed through fixed argument commands, never an interpolated shell. Complex display/network/Bluetooth settings open KDE modules. File preview is capped at 64 KiB for text. Images use Tauri's local asset protocol, never external pages.

## Recovery

The user service restarts the shell after failure. From Konsole:

```sh
systemctl --user restart lumius-shell
systemctl --user stop lumius-shell
```

KDE desktop remains available; its context menu can add a standard Plasma panel. Super/Meta+E or Konsole can launch native utilities. Browser UI cannot change host files or control system audio.

## Installation and release

Test on a blank QEMU virtual disk first. Real USB writing overwrites the chosen USB; installing to a physical disk can erase the existing OS and files. No physical disk operations are performed by the build scripts. Hardware compatibility and Secure Boot are not guaranteed by a successful VM boot.

See `docs/VALIDATION.md` for actual evidence and remaining checks; `THIRD_PARTY.md` for source/license distribution obligations. This project includes no Apple fonts, icons, logos or proprietary rendering code; glass effects approximate the requested visual direction.

_Pipeline check: pushed from Claude Code on 2026-11-01._
