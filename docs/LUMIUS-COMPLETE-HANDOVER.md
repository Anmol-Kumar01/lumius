# Lumius — Complete Project Handover

**Kiske liye:** Naya developer/friend jisko OS development ka experience nahi hai.  
**Language:** Hinglish.  
**Snapshot:** 1 November 2026 · Lumius 0.1.0 development preview.

> Custom desktop, Files, Settings aur Linux ISO build pipeline implement ho chuke hain. Ek earlier corrected image QEMU mein real live desktop tak boot hui. Latest ISO build/export bhi complete hai. **Latest image ka fresh boot, complete Calamares installation, ISO remove karke installed boot aur reboot persistence abhi verified nahi hain.** Isko production-ready Windows replacement mat samajhna.

---

## 1. Project ka purpose aur locked decisions

Lumius ek open-source, Linux-based desktop operating-system project hai. Humne Linux kernel zero se nahi likha. Debian ke kernel, drivers aur system packages ke upar apna desktop experience banaya hai.

User ka goal sirf animated website banana nahi tha. Intel/AMD laptop ke liye real files aur system services se connected OS showcase chahiye, jo eventually USB/ISO se boot aur disk par install ho sake. First showcase ka target 1–2 weeks tha; yeh target hai, completed release ka claim nahi.

Locked foundation:

- Debian stable **13 / trixie, amd64**.
- KDE Plasma + KWin, first release **X11 session**.
- Debian **live-build** se live/install ISO.
- **Calamares** installer.
- Custom shell/apps: **Tauri + Rust + React + TypeScript**.
- QEMU VM-first testing; physical laptop baad mein.
- Open-source application, **GPL-3.0-only** license.

Design direction:

- Light pastel frosted/liquid glass surfaces, rounded corners, edge highlights, shadows aur smooth motion.
- Apple Liquid Glass se inspired material direction; exact Apple proprietary rendering implemented nahi hai.
- Supplied screenshots layout, spacing aur hierarchy references hain. Files ka blue sidebar, quick access aur list layout unse guided hai.
- Dynamic Island top screen border se attached; dock bottom par.
- Lumius shell, Files aur Settings custom design follow karte hain. Firefox/VLC jaise third-party apps apna internal UI rakhte hain.
- Apple logos, proprietary fonts ya rendering code project mein copy nahi kiye gaye.

## 2. Basic terms — zero knowledge se samjho

| Term | Simple meaning | Lumius mein role |
| --- | --- | --- |
| Kernel | Hardware, memory aur processes manage karne wala core | Debian ka Linux kernel |
| Distribution/distro | Kernel + tools + packages + configuration | Customized Debian |
| Desktop environment | Desktop session aur common system UI | KDE Plasma |
| Window manager/compositor | Window placement aur visual composition | KWin |
| Shell | Desktop controls jo user ko dikhte hain | Bar, dock, island |
| Frontend | Visible app interface | React/TypeScript/CSS |
| Backend | Real file/system logic | Rust |
| Tauri | Web UI ko native application banane ka framework | Linux GTK/WebKit webview + Rust |
| RPC/IPC | UI aur backend ke beech requests | Tauri `rpc` command |
| ISO | Bootable OS image file | Lumius live image |
| Live session | Install kiye bina ISO se OS run karna | Temporary desktop |
| Installer | OS ko disk par install karne wala program | Calamares |
| VM | Computer ke andar simulated computer | QEMU |
| qcow2 | VM ki virtual disk file | `lumius-test.qcow2` |
| WSL2 | Windows ke andar Linux environment | Debian build environment |
| .deb | Debian application/package installer | Lumius native app package |
| MPRIS | Linux music players ka common control interface | Island metadata/playback |
| PipeWire | Linux audio infrastructure | Volume integration via `wpctl` |
| systemd user service | Logged-in user ka managed background process | Shell startup/restart |
| SHA-256 | File bytes ka fingerprint | Copy/download integrity check |

**Teen environments alag hain:** Windows host development computer hai; WSL Debian Linux build environment hai; QEMU guest actual Lumius test computer hai. WSL mein native app launch hona aur ISO se full OS boot hona alag checks hain.

## 3. Current status: implemented vs tested vs pending

| Area | Current evidence | Remaining work |
| --- | --- | --- |
| React UI | Production/TypeScript build aur six browser tests pass | Final guest visual review |
| Native application | Debian Linux compilation, optimized .deb built | Broader integration checks |
| Files backend | Eight native filesystem tests pass | Full interactive guest acceptance |
| Native UI | Non-root Xvfb real folder creation aur pin-drag persistence checked | Xvfb KWin blur prove nahi karta |
| ISO pipeline | Latest ~3.1 GB ISO successfully built | Latest untouched image fresh boot |
| Live desktop | Earlier corrected ISO QEMU desktop tak boot hui | Final rebuilt image retest |
| KWin | Actual guest DOCK type, blur and top reservation inspected; fixes implemented | Fullscreen/scales/overlap acceptance |
| Installer | Calamares package/config/Lumius branding present | Complete GUI installation not passed |
| Installed boot | No successful evidence yet | Install, detach ISO, boot disk |
| Reboot persistence | Saved settings mechanism implemented | Installed-system reboot test |
| Music/audio/backlight | Native service integrations implemented | Actual guest playback/volume; hardware later |
| Physical laptop | Not tested | Separate compatibility checks |
| Secure Boot | Not verified | Separate support/validation |
| Public release | Local source/artifacts exist | Source/license packaging and release review |

**Freshness note:** Current `docs/VALIDATION.md` saved copy kuch live-boot findings se purani hai: usmein live boot pending likha hai. Is handover ka distinction use karo: earlier corrected image live desktop reached; latest rebuilt image fresh boot pending. Installer/reboot success ka evidence abhi nahi hai.

## 4. Source aur artifacts kahan hain?

Original machine par:

| Location | Contents |
| --- | --- |
| `D:\lumius` | Main Windows source workspace; Git initialized |
| WSL `/root/lumius-build` | Linux ext4 build copy, dependencies, native target, artifacts |
| WSL `/var/tmp/lumius-iso` | live-build chroot/workspace/cache |
| `C:\Users\adity\Downloads\Lumius` | Exported ISO, checksum, launcher, guides |
| `D:\lumius\artifacts` | Screenshots/QA logs; final ISO necessarily yahan nahi hai |

Earlier export ke waqt D: unavailable thi; handover ke latest check mein available hai. Linux build safe thi, isliye ISO Downloads mein export hui. Yeh original machine ke paths hain; friend ke computer par automatically exist nahi honge.

Exported image:

- `lumius-0.1.0-amd64.iso`.
- Exact exported size **3,278,700,544 bytes**.
- Checksum `lumius-0.1.0-amd64.iso.sha256`.
- Windows-exported file ka SHA-256 comparison **True** tha.
- Hash match integrity prove karta hai; successful boot/install nahi.

Source map:

```text
lumius/
  src/
    App.tsx                    Files, Settings, island, dock, bar
    bridge.ts                  Native RPC vs explicit browser preview
    types.ts                   Frontend data shapes
    style.css                  Layout and materials
    optics.css                 Extra optical styling
    GlassOptics.tsx            SVG optical approximation
    Toggle.tsx                 Shared control
    nectar-motion.ts           Attributed adapted spring transition
  src-tauri/
    src/main.rs                RPC routing, windows, shared state
    src/files.rs               Files, transfers, trash, ZIP, index
    src/system.rs              Settings and Linux integrations
    src/x11.rs                 Panel regions, blur, reservations
    src/tests.rs               Native filesystem tests
    tauri.conf.json            Application/bundle/security config
    capabilities/default.json  Tauri capability permissions
    Cargo.toml / Cargo.lock    Rust dependencies
  os/
    packages.list.chroot       OS package list
    0100-lumius.hook.chroot     Branding/session/system hook
    bootloaders/               Boot menu assets/configuration
    overlay/                   Files placed into OS image
  scripts/                     Build, VM, QA, packaging tools
  tests/desktop.spec.ts        Browser checks
  docs/INSTALL.md              Use/install guide
  docs/VALIDATION.md           Saved evidence; see freshness note
  public/                      Logo/font stylesheet
  README.md
  THIRD_PARTY.md
  LICENSE
  package.json / package-lock.json
```

## 5. Architecture — sab connected kaise hai?

```text
React: Files / Settings / Island / Dock
                 |
           src/bridge.ts
                 |
      Tauri invoke rpc(command,args)
                 |
          Rust main.rs dispatch
          /          |           \
     files.rs    system.rs      x11.rs
       |             |             |
   Filesystem    Linux services    KWin/X11
   SQLite index  Settings JSON    Blur/input regions
   Transfers     MPRIS/audio      Panel reservations
```

Native Tauri app GTK/WebKit webview mein UI render karti hai. Rust backend actual operations execute karta hai. Heavy file operations worker threads par dispatch hote hain.

Single-instance flow se shell ke bar/island/dock aur Files/Settings same managed process/state se connected hain. Isliye Lumius Files se initiated transfer island mein show ho sakta hai. External file managers ke transfers capture nahi hote.

RPC response/input shape change karte waqt frontend aur backend dono update karo. UI button alone feature ko working nahi banata: native command, errors aur actual guest verification bhi chahiye.

Persisted data:

- Settings: `$XDG_CONFIG_HOME/lumius/settings.json`, normally `~/.config/lumius/settings.json`.
- Filename index: `$XDG_CACHE_HOME/lumius/files.sqlite`, normally `~/.cache/lumius/files.sqlite`.
- Transfer state shared process mein; interrupted-operation journal bhi use hota hai.
- Settings writes serialize/lock hote hain aur atomic JSON save hota hai.
- Windows shared saved appearance/pin state refresh karti hain.
- Live session temporary home hai; installed persistence ka substitute nahi.

## 6. Features ka actual scope

### Glass and shell

- Shared frosted surfaces, edge highlights, shadows, spring motion.
- KWin backdrop-blur property plus in-app CSS backdrop/filter effects.
- SVG filter se optional refraction approximation; exact Apple optics nahi.
- Reduced motion/transparency controls.
- Top bar, border-attached island aur bottom dock.
- X11 panel types/struts top/bottom area reserve karte hain.
- Input shape transparent surrounding panel area ko click-through banati hai.
- Fullscreen edge reveal code exists; complete acceptance pending.
- Multi-monitor and scale behavior thoroughly tested nahi.

### Island and dock

- Collapsed/expanded states.
- MPRIS metadata/playback through `playerctl`.
- Volume through `wpctl`; available backlight through `brightnessctl -c backlight`.
- Shared persisted pinned apps and pointer-based drag reorder.
- Files shortcut/app launch and Lumius transfer progress/cancellation.
- Unsupported controls disabled/error state dikhate hain.
- Latest code live session mein installer pin add karta hai; installed context mein installer launch refused hai.

### Lumius Files

- Real directories, home folders, breadcrumbs, tabs, back/forward.
- Independent tab locations, grid/list, sorting, local folder filter.
- New folder, rename, copy/move/paste, trash and restore.
- Default application se open.
- Text previews capped at 64 KiB; images local asset protocol se.
- Explicit manually rebuilt filename index: non-hidden home, maximum 500 search results.
- Mounted paths `/media` and `/run/media`; udiskie support included.
- ZIP extraction with traversal/symlink rejection and 4 GiB / 10,000-entry boundaries.
- Copy hidden staging area mein; completion par no-overwrite commit.
- Symlink transfers intentionally refused.
- Conflicts currently destination overwrite refuse karte hain; full overwrite/merge decision UI complete assume mat karo.
- Cancellation and interrupted operations surfaced. Crash ke baad staging files remain ho sakti hain.
- Move source-cleanup failure par destination complete plus remaining source data ho sakta hai; retry se pehle inspect karo.
- Permanent-delete confirmation original goal tha. Current native RPC trash/restore provide karta hai; complete permanent-delete UI claim mat karo.

### Lumius Settings

- Wallpaper presets, glass intensity, motion/transparency preferences.
- Shared dock/island pins/order.
- Supported audio/brightness controls.
- Complex display/network/Bluetooth configuration native KDE modules mein open hoti hai.
- Status/system information.
- KDE DBus se wallpaper apply; apply failure surfaced.
- Har laptop par har device supported hoga, yeh established nahi hai.

## 7. Ab tak humne kaunse steps liye?

1. Scope lock: scratch kernel ke bajay Debian-based installable showcase, custom connected apps/shell.
2. Empty `D:\lumius` workspace mein project/Git setup.
3. React/TypeScript/Vite frontend and Tauri/Rust native app.
4. Glass components, Files, Settings, dock/bar/island.
5. Explicit labelled browser preview separate from native real filesystem mode.
6. Native file safety, errors, search, settings and shared transfer state.
7. Linux service integrations/native windows.
8. Nectar audit, limited spring reuse with attribution; Windows backend excluded.
9. Debian 13 WSL2 and Linux build prerequisites installed.
10. Linux ext4 source copy; native tests/build and .deb package.
11. live-build/KDE X11/Calamares configuration, boot branding, wallpapers, original sample WAV, shell service/wrappers.
12. First ISO and QEMU UEFI boot debugging.
13. NTFS permission bug fixed; corrected image reached live desktop.
14. Guest KWin blur/placement/client discovery and native sizing fixes.
15. Browser checks, Rust tests, non-root native UI smoke.
16. Latest integration/cleanup fixes ke saath native package and ISO rebuilt; Downloads export/hash verified.
17. Next milestone: actual installer completion, installed disk boot and persistence.

## 8. Important debugging history

### NTFS metadata and broken live-user creation

NTFS overlay `cp -a` se Linux directories 0777/world-writable ho gayi thi. Perl/adduser ne insecure PATH directories ki wajah se live user creation refuse ki. First image ko desktop-boot success count mat karo.

Fix: `scripts/install-overlay.sh` Linux staging mein root:root ownership, directories 0755/files 0644 normalize karta hai. Build preflight directory ownership/modes check karta hai. `scripts/check-overlay.sh` regression test hai. Direct NTFS-to-image copy se helper bypass mat karo.

### Plasma X11 session mapping

Old live-config mapping `plasma.desktop` ko Plasma 6 X11 `plasmax11.desktop` se patch kiya. `kwin-x11` included hai. `plasma-workspace-x11` package name trixie par use mat karo; woh available nahi tha.

### KWin nested clients

Root child scan actual client windows miss kar raha tha because KWin wrappers deeper the. Fix `_NET_CLIENT_LIST` actual IDs, process ownership filtering and bare-Xvfb fallback. Applied-property cache repetitive frame/property churn avoid karta hai.

### GTK minimum panel height

Nonresizable windows unexpected 200px minimum height le rahe the. Explicit min 1x1 plus resizable true and desired dimensions use kiye.

### Native drag reorder

HTML5 drag/drop native WebKit mein expected behavior nahi de raha tha. Motion pointer-based Reorder components and click guard use kiye. Native persisted order checked.

### Black screenshots

Later black guest screenshots idle lock/DPMS ki wajah se the. `loginctl unlock-sessions` plus pointer/key activity se desktop visible hua. QA-only inhibitor script exists; permanent OS security behavior ke roop mein use mat karo.

### Chroot package prompts and DNS

Console setup prompts build hang kar sakte the; noninteractive env added. Chroot DNS temporarily replace/restore aur apt index refresh script handle karti hai. Dpkg lock files manually delete mat karo.

### Latest cleanup changes

Qt legacy font weight corrected, static font faces separated, KDE Welcome removed, udiskie floppy ignore, redundant installer desktop shortcuts cleanup, live-only installer pin/status. In changes ka final untouched ISO GUI review pending hai.

## 9. Original machine par abhi run karna

Double-click:

```text
C:\Users\adity\Downloads\Lumius\Start-Lumius.cmd
```

Equivalent Windows PowerShell:

```powershell
wsl -d Debian -u root -- bash /root/lumius-build/scripts/run-vm.sh live
```

QEMU window khulegi. Default live entry select karo/wait karo. Software emulation mein first boot minutes le sakti hai. Ek time par ek VM instance.

**Launcher original WSL/QEMU/build paths par depend karta hai. Sirf .cmd friend ko bhejne se OS nahi chalega.** Live changes shutdown par lost ho sakte hain. Virtual disk abhi installed/unvalidated hai; `installed` mode successful assume mat karo.

## 10. Friend ko exactly kya transfer karna hai?

### Sirf try karne ke liye

- Latest ISO and matching SHA-256 file.
- Yeh handover, install guide, known limitations.
- x86-64 UEFI VM: start with 4 GiB RAM and >=30 GiB blank virtual disk. Script 40 GiB disk use karti hai.
- Physical Windows disk ko VM disk ke roop mein attach mat karo.

### Development ke liye

- Complete source/configs/lockfiles: `src`, `src-tauri`, `os`, `scripts`, `tests`, `docs`, `public`, root files, LICENSE/THIRD_PARTY.
- Useful logs, package manifests and native/guest screenshots.
- Git history/remote if available. Snapshot mein Git initialized tha; finalized commit/public remote delivery established nahi thi.
- `node_modules`, Rust `target`, chroot and VM disk source development ke liye mandatory nahi; rebuild ho sakte hain.
- ISO source code ka substitute nahi; source folder bootable image ka substitute nahi.

`scripts/package-source.py` Git tracked-file list use karta hai. New intended files `git add` se include, diff review, phir helper run karo. Untracked files archive se miss ho sakti hain. ZIP extract karke contents verify karo.

## 11. Friend ke fresh computer par setup

### Windows + WSL2

PowerShell:

```powershell
wsl --install -d Debian
```

Installer maange toh restart/initial user setup complete karo. Original already-configured machine par reinstall needed nahi. GUI launch ke liye working WSLg/GUI access chahiye. Target Debian 13 amd64 hai; Linux terminal mein `cat /etc/os-release` and `uname -m` verify karo.

Source Linux home/ext4 mein rakho, jaise `~/lumius-build`; native/ISO heavy builds `/mnt/c` or `/mnt/d` par avoid karo. `/root/lumius-build` original machine ka path tha, requirement nahi.

### Debian 13 amd64 Linux machine

Source project folder mein terminal kholo. Internet, sudo/mount/chroot capability and substantial disk needed. Practical 40–60+ GiB headroom useful hai; actual size caches/artifacts par depend karegi.

```bash
sudo bash scripts/bootstrap-linux.sh
source "$HOME/.cargo/env"
node --version
npm --version
cargo --version
```

Vite 7 ke compatible Node version ki zarurat hai: Node 20.19+ or 22.12+ compatible release. Package dependency constraints/lockfiles check karo. Agar bootstrap Rust root account mein install kare aur development normal user se ho, us normal user ka Rust toolchain bhi set up karo. `cargo --version` verify hona chahiye.

### UI browser preview

```bash
npm ci
npm run dev
```

`http://127.0.0.1:1420` kholo. Yeh labelled design preview hai; actual host files mutate aur system hardware control nahi karta.

```bash
npm run build
npx playwright install chromium
npm test
```

Playwright Linux browser system dependencies environment ke hisaab se install karni pad sakti hain. Browser pass full OS pass nahi hai.

### Native application development

Working Linux GUI mein normal desktop user se:

```bash
source "$HOME/.cargo/env"
npm run tauri dev
# Settings:
npm run tauri -- dev -- --settings
# Shell, preferably separate development session/VM:
npm run tauri -- dev -- --shell
```

Root/guest-agent process ka DISPLAY/DBus normal desktop session jaisa nahi hota. Daily-use host shell ke upar experimental panels launch karne ke bajay isolated development environment use karo.

### Release application package

```bash
bash scripts/build-linux.sh
```

Frontend build, locked Rust tests, Tauri .deb release and hash/copy run hote hain. Output normally `artifacts/Lumius_0.1.0_amd64.deb` plus package checksum. **.deb app hai; complete bootable OS nahi.**

Optional checks:

```bash
bash scripts/check-source.sh
sudo bash scripts/check-overlay.sh
cd src-tauri
cargo test --locked
cd ..
```

Native smoke extra packages Xvfb/xvfb-run, xdotool, ImageMagick use karta hai. `sudo bash scripts/smoke-native.sh` development environment mein `lumius-test` user create/use karta hai. Xvfb render proof compositor blur proof nahi hai.

## 12. ISO build pipeline and scripts

```text
Debian packages + Lumius .deb + normalized overlay/hooks
                         |
                  Debian live-build
                         |
             SquashFS live filesystem
                + bootloader assets
                         |
              Bootable Lumius ISO
```

Fresh project build:

```bash
bash scripts/build-linux.sh
sudo bash scripts/build-iso.sh
```

| Script | Purpose |
| --- | --- |
| `bootstrap-linux.sh` | Linux prerequisites/toolchain |
| `build-linux.sh` | Native tests/.deb |
| `configure-iso.sh` | trixie amd64, archive areas, boot args, zstd |
| `prepare-bootloader.sh` | Boot menu config/assets |
| `install-overlay.sh` | Ownership/permissions normalization |
| `build-iso.sh` | Chroot/packages/overlay/image/manifests/hash |
| `rebuild-iso.sh` | Existing binary image stages reset/rebuild |
| `prepare-desktop.sh` | Optional prewarmed chroot |
| `run-vm.sh` | Visible QEMU live/installed VM |
| `start-qa-vm.sh` | Headless QA VM/local QMP and guest agent |
| `qa-vm.py` | QA screenshots/input/guest file and command tools |
| `package-source.py` | Tracked-file source ZIP |

Default workspace `/var/tmp/lumius-iso`; override `LUMIUS_ISO_WORK`. Existing completed image overwrite may intentionally be refused. Controlled development rebuild:

```bash
sudo bash scripts/rebuild-iso.sh
```

Windows/Linux dual-copy setup mein source sync karo. Original workflow Windows copy authoritative thi. Typical rsync exclusions `node_modules`, `target`, `upstream`, `.git`, `artifacts` the. Artifacts exclusion means final ISO/deb separately export karne hain. QEMU read karte hue same ISO overwrite mat karo; VM pehle shut down karo.

Outputs:

- `artifacts/lumius-0.1.0-amd64.iso` and `.iso.sha256`.
- Native `.deb`/checksum.
- `iso-packages.txt` and `iso-source-packages.tsv`.
- `root-permissions.txt` and build logs.

Configuration Debian `main contrib non-free-firmware` areas include karti hai. Entire image ko free-software-only mat claim karo.

## 13. Installer and acceptance — next developer ka first milestone

Linux graphical environment/project root:

```bash
bash scripts/run-vm.sh live
```

QEMU: 4 GiB, 4 vCPUs, UEFI OVMF, virtual disk/network. Writable `/dev/kvm` ho toh KVM, warna TCG. Existing disk reused hoti hai; har run blank nahi hoti.

1. Latest untouched ISO fresh boot; hash/date note karo.
2. KDE X11 and shell auto-start verify.
3. Files se test folder/file operations; errors record.
4. Settings change and cross-window state verify.
5. Actual live desktop se Install Lumius open; auth prompt appropriately handle.
6. Sirf isolated blank virtual disk choose; summary target inspect.
7. Account create, installer completion and logs capture.
8. Guest shutdown; ISO omit karke same disk launch:

```bash
bash scripts/run-vm.sh installed
```

9. Installed account mein file create, appearance/pins change, reboot and persistence verify.
10. Bundled local WAV VLC mein play: real island metadata/play/pause, volume verify.
11. Copy/move progress, cancel, conflict, trash/restore, search, tabs, previews, ZIP test.
12. KWin blur, overlapping/maximized windows, fullscreen edge reveal, display scales.
13. Isolated guest mein shell crash restart; permission/disk-full/interruption handling.
14. Exact image hash, test result and screenshots validation report mein save.

Earlier installer debug: guest-agent root/runuser context se `pkexec` launch attempt Not authorized hua. Direct root attempt startup logs tak gaya; complete UI/install prove nahi hui. Isko ordinary GUI-launched installer ka final verdict mat samajhna. Actual logged-in desktop launch path test abhi needed hai.

## 14. Existing test evidence

- Frontend production/TypeScript checks passed.
- Six Playwright checks: tabs, preview honesty, navigation/layout, island/settings links, persisted appearance/accessibility, unsupported controls/errors, compact overflow.
- Eight Rust tests: filename/ZIP safety, collision refusal, symlink refusal, traversal rejection, valid ZIP/text, byte-preserving copy/move and trash/restore.
- Native non-root Xvfb: real folder create/disk existence, pinned drag order persistence.
- Earlier corrected QEMU image reached live desktop.
- Actual guest inspected `_NET_WM_WINDOW_TYPE_DOCK`, top `_NET_WM_STRUT_PARTIAL`, `_KDE_NET_WM_BLUR_BEHIND_REGION`.
- Final rebuild completed; exported SHA-256 matched.

Evidence screenshots/logs `artifacts` mein. Examples `kwin-native-panels.png`, `live-files-now.png`, `native-files-latest.png`. Browser previews native OS proof nahi. Diagnostic guest mein app packages manually upgrade hue the; un screenshots ko latest untouched ISO proof label mat karo.

## 15. Troubleshooting and recovery

### Shell missing/crashed

KDE runner Alt+F2 se Konsole kholo. Logged-in user terminal:

```bash
systemctl --user status lumius-shell
journalctl --user -u lumius-shell -b --no-pager
systemctl --user reset-failed lumius-shell
systemctl --user restart lumius-shell
```

Service on-failure restart, 3-second delay and rate limit use karti hai. Mechanism present hai; actual guest crash acceptance pending. KDE fallback/context menu se standard panel available hai.

### Browser files actual nahi hain

Intentional preview mode. Native Tauri or actual OS VM use karo. Fake mutation success add karke working claim mat karo.

### Brightness unavailable

VM mein backlight absent ho sakti hai. Hardware/service/permissions inspect karo; unsupported state valid hai.

### Music state empty

MPRIS player mein active track chahiye. Normal user session mein `playerctl metadata` and `playerctl status` inspect karo. Different/root DBus session player ko nahi dekh sakta.

### Wallpaper saved but apply failed

Saved settings aur KDE apply separate steps hain. Error/DBus inspect karo; JSON save visual success nahi.

### VM black screen

Boot logs vs idle lock/DPMS differentiate karo. Previous QA unlock diagnostic `loginctl unlock-sessions` tha. Black screenshot alone boot failure prove nahi karti.

### Changes absent/ISO slow

Windows/Linux source copies and final image hash compare. Refresh scripts/hooks bypass mat karo. Linux filesystem, enough disk, logs and time do. Previous xz slower thi; now zstd level 12. Arbitrary lockfiles/caches delete mat karo.

## 16. License, Nectar and public source availability

Lumius original app **GPL-3.0-only**; LICENSE/THIRD_PARTY preserve karo.

Nectar: https://github.com/kua8/Nectar  
Audited revision: `bc0fd846208327b79d21d6fde7d9378fcb1e3105`.

`src/nectar-motion.ts` limited independent width/height spring adaptation hai. Nectar/Bloom contributor attribution preserved; Windows backend bundled nahi, Linux integrations separate hain.

React/Tauri/Motion/Rust/Debian packages apne licenses retain karte hain. Debian notices `/usr/share/doc/*/copyright`. Package manifests matching versions record karte hain.

Public ISO redistribution se pehle exact project source revision, patches, lockfiles aur redistributed components ki applicable source/license requirements complete karo. Sirf Lumius GitHub repo entire ISO ka complete corresponding source nahi. Manifests useful hain, matching source availability ka replacement nahi. Non-free firmware ko accurately identify karo. Abhi local delivery hai; complete compliant public release established nahi hai.

## 17. Next work, priority order

### P0 — OS release gates

- Latest untouched ISO fresh boot.
- Complete GUI installer to blank virtual disk.
- Installed boot without ISO.
- Files/settings persistence after installed reboot.
- Boot/install blockers resolve before more polish.

### P1 — Connected showcase acceptance

- Real MPRIS/volume playback.
- Transfer progress/cancel/conflicts/errors.
- Guest Files advanced features.
- Blur/overlap/maximize/fullscreen/scales.
- Service crash restart and unsupported hardware state.
- Latest cleanup/live installer pin review.

### P2 — Release/handover quality

- Refresh validation report with exact evidence.
- Consistent Git revision/source ZIP verify.
- ISO/deb/source checksums/manifests.
- Matching source/license packaging.
- Later physical hardware, multi-monitor, accessibility/performance, Secure Boot.

## 18. Friend ka first-day checklist

- [ ] Host vs WSL vs Lumius VM distinction samjha.
- [ ] ISO/checksum and complete source received.
- [ ] Hash verified.
- [ ] VM mein existing image behavior dekha.
- [ ] Browser preview vs native app distinguish kiya.
- [ ] Source map and RPC flow inspect kiya.
- [ ] Frontend build/tests run kiye.
- [ ] Debian native build establish ki.
- [ ] Installer/reboot gate next milestone set kiya.
- [ ] Changes and evidence source control/report mein record kiye.

**Accurate project description:** “Lumius is a Debian-based experimental desktop OS with a custom glass shell, native Files/Settings apps and an integrated top-edge island. A live desktop has been demonstrated; final installation and hardware validation are ongoing.”
