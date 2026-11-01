# Running Lumius on this Windows laptop

Lumius is a full Linux operating system (Debian 13 + KDE + the Lumius shell). It can't run as a Windows `.exe`. To use it as a real desktop rather than a browser preview, you boot the Lumius ISO in one of two ways:

| Way | What it feels like | Risk |
|---|---|---|
| **A. Virtual machine (VirtualBox)** | Lumius runs in a window, or full-screen like a second computer, alongside Windows | None. Your Windows files are not touched |
| **B. Dual boot** | Pick Lumius or Windows each time you power on | Can break Windows boot or lose data if done wrong. Not verified on real hardware yet |

Do A first. Only try B after A works end to end.

---

## Step 1. Build a fresh ISO from the latest code

The ISO in WSL (`/root/lumius-build/artifacts/lumius-0.1.0-amd64.iso`, built 1 Nov 02:22) is **older than** the Ask, AI layer, island power panel and VM boot-fix commits. Rebuild it so you get everything.

The source is on D:, an external USB drive that WSL can't see, so export it through C:. In **PowerShell** inside `D:\lumius`:

```powershell
git archive -o C:\Users\adity\lumius-src.tar HEAD
```

Then open the Debian shell as root:

```powershell
wsl -d Debian -u root
```

Inside Debian:

```bash
rm -rf /root/lumius-latest && mkdir /root/lumius-latest
tar -xf /mnt/c/Users/adity/lumius-src.tar -C /root/lumius-latest
cd /root/lumius-latest
source /root/.cargo/env
bash scripts/build-linux.sh                     # app package -> artifacts/Lumius_0.1.0_amd64.deb (~10 min)
cd /var/tmp/lumius-iso && lb clean && cd /root/lumius-latest
bash scripts/build-iso.sh                       # bootable ISO -> artifacts/lumius-0.1.0-amd64.iso (30-90 min)
cp artifacts/lumius-0.1.0-amd64.iso /mnt/c/Users/adity/Downloads/
exit
```

`lb clean` removes the old image but keeps downloaded Debian packages, so the rebuild is faster. You now have `C:\Users\adity\Downloads\lumius-0.1.0-amd64.iso` (about 3.3 GB).

> Already checked on 1 Nov: the current code passes the frontend build and all 26 Rust tests in this WSL Debian.

---

## Step 2 (Way A). Run it in VirtualBox

The existing `run-vm.sh` uses QEMU inside WSL. WSL has no `/dev/kvm`, so it uses software emulation and is very slow. VirtualBox on Windows uses hardware virtualization and is much faster.

1. Install **VirtualBox** (free) from virtualbox.org → *Windows hosts*.
2. **New** VM:
   - Name `Lumius`, ISO image: `C:\Users\adity\Downloads\lumius-0.1.0-amd64.iso`
   - Type **Linux**, Version **Debian (64-bit)**
   - Tick **Skip Unattended Installation**
   - Memory **8192 MB**, CPUs **4**, tick **Enable EFI** (required; Lumius is tested with UEFI)
   - New virtual hard disk **50 GB** (it's a file on C:, grows as used)
3. Before the first start, open **Settings → Display**: Graphics controller **VMSVGA**, Video memory **128 MB**.
4. **Start**. Pick the default live entry. You are now in the Lumius live desktop.
5. To make it permanent, open **Install Lumius** from the dock → language, keyboard → **Erase disk** (this is only the 50 GB virtual disk, not your laptop) → create your user → Install.
6. When it finishes, **shut down** the VM. In **Settings → Storage**, remove the ISO from the optical drive. Start again: it boots the installed Lumius.
7. Press **Right Ctrl + F** for full screen, so it feels like a separate computer. Press it again to go back to Windows.

Notes:
- A green turtle icon in the status bar means VirtualBox is running on top of Hyper-V (WSL2 turns it on). It still works, just a bit slower. **VMware Workstation Pro** (now free) is usually faster on Hyper-V machines. Use the same settings with *UEFI* firmware.
- If the screen goes black, the session has locked. Move the mouse.
- If the resolution is small, change it in **Settings → Display** inside Lumius (opens KDE's display module).

---

## Step 3. Turn on the features that need setup

| Feature | What to do |
|---|---|
| **Ask (web answers)** | Get a key at exa.ai, then in Lumius **Settings → Web answers** paste it. Without it, Ask shows "Add your Exa API key". |
| **Music in the island** | Open Music and play a track. A sample is in the Music folder. |
| **More apps** | Discover → Flathub is preconfigured. |
| **Shell crashed** | Alt+F2 → Konsole → `systemctl --user restart lumius-shell` |

---

## Step 4 (Way B, optional). Dual-boot on the laptop itself

Only after Step 2 installs and reboots correctly. **This step is not verified yet** (see `docs/VALIDATION.md`): real laptop hardware and Secure Boot have not been tested.

1. Back up everything important. Note your **BitLocker recovery key** (account.microsoft.com/devices/recoverykey) in case Windows asks for it after the change.
2. In Windows **Disk Management**, right-click C: → *Shrink Volume* → free about 60 GB (C: has ~127 GB free).
3. Write the ISO to a spare USB stick (8 GB+, it gets erased) with **Rufus** (GPT / UEFI, DD-image mode if asked).
4. Reboot, press **F12** (Lenovo boot menu) and pick the USB. If it won't boot, disable Secure Boot in BIOS (F2).
5. Try the live desktop first: Wi-Fi, sound, brightness, touchpad.
6. **Install Lumius** → choose **Install alongside** / the free space. **Do not pick "Erase disk"**, and **do not pick the WD Elements drive** (D:, your data and this project).
7. After install, a boot menu lets you choose Lumius or Windows.

---

## What's still unverified

Live boot is proven in QEMU. Not yet proven for the latest ISO: full install, booting the installed system, settings persisting across reboots, audio/MPRIS, real laptop hardware. If any of these fail in Step 2, report it before you try Step 4.
