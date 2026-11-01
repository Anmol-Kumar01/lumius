# Building and running Lumius on Ubuntu

This guide takes you from the source code to a running Lumius desktop on an Ubuntu 24.04 (amd64) computer. The build scripts target Debian 13, so the build itself runs inside a Debian 13 Docker container; only the virtual machine runs directly on Ubuntu.

```text
 Step 2  Browser preview      React UI only, fake data, seconds to start
 Step 3  Build in Docker      .deb app package, then the bootable ISO (30–90 min)
 Step 4  Virtual machine      Boot the ISO in QEMU, try it, install it
 Step 5  Real laptop          Only after Step 4 passes
```

## 1. One-time setup

**Keep the build copy on a Linux filesystem.** NTFS/exFAT drives (for example an external drive under `/media`) break Linux file ownership, and the ISO build refuses or produces a broken image. Clone into your home folder:

```bash
git clone https://github.com/Anmol-Kumar01/lumius.git ~/lumius
cd ~/lumius
```

Install Docker (skip if `docker run hello-world` already works) and the VM tools:

```bash
sudo apt install docker.io qemu-system-x86 ovmf qemu-utils
sudo usermod -aG docker,kvm "$USER"   # then log out and back in
```

You need about 40 GB of free disk space for the build and the VM disk.

## 2. Preview the UI in a browser

Use this for design work. It shows the shell with placeholder data and never touches your real files.

```bash
cd ~/lumius
nvm use 22            # Vite 7 needs Node 20.19+ or 22.12+
npm ci
npm run dev           # open http://127.0.0.1:1420
npm test              # browser checks (first time: npx playwright install chromium)
```

Useful URLs: `/?view=files`, `/?view=settings`, `/?view=island`, `/?view=dock`.

## 3. Build the app package and the ISO (inside Debian 13)

Start a privileged Debian 13 container with the project mounted. It is named so you can come back to it later without reinstalling the tools.

```bash
docker run -it --name lumius-build --privileged \
  -v "$HOME/lumius:/src" -w /src debian:trixie bash
```

Inside the container:

```bash
bash scripts/bootstrap-linux.sh   # build tools, Node, Rust, live-build (first time only)
source /root/.cargo/env
bash scripts/build-linux.sh       # tests + artifacts/Lumius_0.1.0_amd64.deb
bash scripts/build-iso.sh         # artifacts/lumius-0.1.0-amd64.iso
exit
```

To re-enter later: `docker start -ai lumius-build`. For a second ISO build in the same container, run `cd /var/tmp/lumius-iso && lb clean && cd /src && bash scripts/build-iso.sh`. `lb clean` keeps the downloaded packages, so the rebuild doesn't download them again. Don't use `rebuild-iso.sh`: live-build restores its cached base system and skips the desktop packages, producing an image without the desktop.

The container runs as root, so hand the files back to your user before working on the host again:

```bash
sudo chown -R "$USER:$USER" ~/lumius
```

Check the result:

```bash
ls -lh ~/lumius/artifacts/*.iso
cd ~/lumius/artifacts && sha256sum -c lumius-0.1.0-amd64.iso.sha256
```

## 4. Boot it in a virtual machine

```bash
cd ~/lumius
bash scripts/run-vm.sh live
```

A QEMU window opens with 4 GB RAM, 4 CPUs and UEFI. The script creates a 40 GB virtual disk at `artifacts/lumius-test.qcow2`, a file that never touches your real disk. If `/dev/kvm` is writable the VM is fast; otherwise it falls back to slow software emulation.

In the live desktop:

1. Try Files, Settings, the island (click it) and the dock.
2. Open **Install Lumius** from the dock and install to the virtual disk.
3. Shut the VM down, then boot the installed system without the ISO:

```bash
bash scripts/run-vm.sh installed
```

4. Create a file and change the wallpaper, then reboot and check that both survive.

If the screen goes black, the session has usually just locked itself; move the mouse or press a key.

## 5. A real laptop (only after the VM install works)

Writing the ISO to a USB stick **erases that stick**, and choosing “erase disk” in the installer **erases that computer's operating system and files**. Back up first, and test on a spare laptop.

```bash
lsblk                                   # find the USB stick, e.g. /dev/sdb — double-check the size
sudo dd if=artifacts/lumius-0.1.0-amd64.iso of=/dev/sdX bs=4M status=progress conv=fsync
```

Boot the laptop from USB (usually F12, F2 or Esc at power-on). Secure Boot may need to be disabled; that path is not validated yet.

## Optional: run the native app on Ubuntu while developing

This runs the real Files/Settings app against your real home folder, without building an ISO:

```bash
sudo apt install build-essential pkg-config libwebkit2gtk-4.1-dev libssl-dev \
  libdbus-1-dev librsvg2-dev libayatana-appindicator3-dev
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
npm run tauri dev                       # Files
npm run tauri -- dev -- --settings      # Settings
```

Don't run the `--shell` mode on your everyday desktop; it reserves screen edges for the bar, island and dock. Use the VM for that.

## What is verified and what isn't

See [VALIDATION.md](VALIDATION.md) for evidence. As of 0.1.0, an earlier ISO booted to the live desktop. A full installation to disk, booting the installed system, and laptop hardware have **not** been verified yet; those are the next milestones.
