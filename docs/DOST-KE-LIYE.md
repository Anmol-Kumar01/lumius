# Lumius — Dost ke liye simple explanation

**Date:** 1 November 2026 · **Version:** 0.1.0 (development preview)
**Repo:** https://github.com/Anmol-Kumar01/lumius

Yeh file simple bhasha mein batati hai ki maine Lumius kya banaya, kaun-kaun si cheezein use ki, kaise banaya, aur abhi kaam kahan tak pahuncha hai. Zyada detail chahiye toh [LUMIUS-COMPLETE-HANDOVER.md](LUMIUS-COMPLETE-HANDOVER.md) padhna.

---

## 1. Lumius kya hai? (ek line mein)

Lumius ek **Linux-based desktop OS** hai. Maine kernel zero se nahi likha — **Debian 13** ke upar apna khud ka design wala desktop banaya hai: frosted glass look, upar screen ke edge par ek kaala **"island"** (music, progress waghera dikhata hai), neeche **dock**, aur apne khud ke **Files** aur **Settings** apps. Isko ISO bana ke USB/VM se boot kar sakte ho aur disk par install bhi kar sakte ho (install wala part abhi testing mein hai).

Socho aise:

```text
Debian (kernel + drivers + packages)      <- pehle se bana hua, free
   + KDE Plasma / KWin (window system)    <- pehle se bana hua
   + Lumius shell, Files, Settings        <- yeh maine banaya
   = Lumius ISO (bootable OS image)
```

---

## 2. Kaun-kaun si cheezein (tools/tech) use ki

### App banane ke liye

| Cheez | Kya hai | Kahan use hua |
| --- | --- | --- |
| **React 19 + TypeScript** | UI banane ki library + typed JavaScript | Saari screens: Files, Settings, island, dock, bar |
| **Vite 7** | Fast dev server + build tool | `npm run dev` se browser mein preview |
| **CSS** | Styling | Glass/blur effect, rounded corners, shadows |
| **Motion** | Animation library | Smooth spring animations, dock icons drag karke reorder |
| **Phosphor Icons** | Icon set | Saare icons |
| **Tauri 2** | Web UI ko asli desktop app banata hai | React UI ko Linux app mein wrap karta hai |
| **Rust** | Fast, safe backend language | Asli files, settings, system controls |
| **SQLite** | Chhota database | File search ka index |
| **x11rb** (Rust) | X11 window system se baat karna | Dock/island ko screen par sahi jagah fix karna, blur |
| **Exa API** | Web search + answer API | "Ask" feature — sawaal poocho, sources ke saath jawab |

### OS banane ke liye

| Cheez | Kya hai | Kahan use hua |
| --- | --- | --- |
| **Debian 13 (trixie)** | Linux distribution | OS ka base |
| **KDE Plasma + KWin (X11)** | Desktop environment + window manager | Windows, blur, background desktop |
| **live-build** | Debian ka ISO banane ka tool | `lumius-0.1.0-amd64.iso` banata hai |
| **Calamares** | OS installer | "Install Lumius" button — disk par install |
| **GRUB** | Bootloader | Boot menu (Lumius theme ke saath) |
| **systemd user service** | Background process manager | Shell crash ho toh khud restart |
| **playerctl / wpctl / brightnessctl** | Linux command-line tools | Music control, volume, brightness |
| **Chromium, Firefox, VLC, Discover + Flathub** | Normal apps | Daily use ke liye bundled |

### Testing aur build ke liye

| Cheez | Kaam |
| --- | --- |
| **Playwright** | Browser mein UI ko automatically click karke test karta hai |
| **cargo test** | Rust backend ke tests |
| **Docker (Debian 13 container)** | Ubuntu par bhi Debian jaisa build environment |
| **QEMU** | Virtual machine — ISO ko bina laptop kharab kiye test karna |
| **GitHub Actions** | Har push par automatic build + tests ([check.yml](../.github/workflows/check.yml)) |
| **Claude Code** | AI coding assistant — code likhne, debug karne aur commits mein madad |

---

## 3. Sab connected kaise hai?

```text
React screens (Files / Settings / Island / Dock / Ask)
                 |
           src/bridge.ts        <- beech ka "pul"
          /              \
  Native app mein:      Browser preview mein:
  Tauri -> Rust         fake demo data (kuch bhi
  (asli kaam)           real computer par nahi badalta)
     |
  files.rs   -> files copy/move/trash/zip/search
  system.rs  -> settings, music, volume, brightness, Ask (Exa)
  x11.rs     -> dock/island ki position, blur, click-through
```

Simple rule: **UI sirf request bhejta hai, asli kaam Rust karta hai.** Isliye UI mein button banana kaafi nahi — Rust side bhi likhni padti hai.

---

## 4. Kaun si file kya karti hai

```text
lumius/
  src/                     <- Frontend (React)
    App.tsx                  Saari screens (sabse badi file)
    bridge.ts                UI <-> Rust ka connection + browser demo
    style.css, optics.css    Glass design
    GlassOptics.tsx          Glass refraction effect (SVG)
    nectar-motion.ts         Spring animation (Nectar project se, credit ke saath)
  src-tauri/               <- Backend (Rust)
    src/main.rs              Requests ko sahi function tak bhejta hai
    src/files.rs             File operations
    src/system.rs            Settings + Linux services + Ask
    src/x11.rs               Window placement / blur
    src/tests.rs             Rust tests
  os/                      <- OS image ki setting
    packages.list.chroot     ISO mein kaun se Debian packages jayenge
    0100-lumius.hook.chroot  Branding, login session, welcome file
    overlay/                 Files jo seedha OS ke andar copy hoti hain
    bootloaders/             Boot screen theme
  scripts/                 <- Build/test scripts (build-linux.sh, build-iso.sh, run-vm.sh...)
  tests/desktop.spec.ts    <- Playwright browser tests
  docs/                    <- Guides (BUILD, INSTALL, VALIDATION, HANDOVER)
  public/demo/             <- Demo wallpapers + sample music
```

---

## 5. Maine step-by-step kaise banaya

1. **Decide kiya** — kernel nahi likhna, Debian ke upar apna desktop banana hai. Tauri + Rust + React chuna.
2. **UI banaya** — glass design, Files, Settings, island, dock.
3. **Rust backend** — asli files copy/move/trash, ZIP extract, search, settings save.
4. **Safety daali** — copy pehle hidden jagah hoti hai phir final; existing file overwrite nahi hoti; ZIP mein `../` jaisi chaalaki block; symlinks refuse.
5. **Linux se joda** — music (MPRIS), volume (PipeWire), brightness, KDE settings.
6. **OS image** — live-build + Calamares + branding + boot theme se ISO banaya.
7. **QEMU mein boot kiya** — bugs mile aur fix kiye (neeche dekho).
8. **Glass UI refine kiya** — Chromium default browser, Discover app store + Flathub, lock/power buttons.
9. **Browser demo** — website par bhi chalne wala demo, fake files ke saath (copy, rename, music sab chalta hai).
10. **Ask feature (latest)** — top bar / dock / Settings se sawaal poocho, Exa web se jawab + clickable sources laata hai.

### Kuch interesting bugs jo fix kiye

- **NTFS drive ka permission bug** — external NTFS drive se files copy karne par Linux folders "sabke liye writable" ban gaye, aur OS ne live user banane se mana kar diya. Fix: ek script jo permissions theek karti hai, aur ek check jo galat permissions par build rok deta hai.
- **Plasma 6 session ka naam** — Debian ka purana config `plasma.desktop` dhoondh raha tha, Plasma 6 mein naam `plasmax11.desktop` hai. Patch kiya.
- **Dock drag nahi ho raha tha** — native app mein HTML drag-drop kaam nahi karta, toh Motion ka pointer-based reorder use kiya.
- **Black screenshots** — boot fail nahi tha, screen bas lock/sleep ho gayi thi.
- **Flatpak build mein nahi chalta** — isliye Flathub ko ek config file se add kiya jo pehli baar use par load hoti hai.

---

## 6. Git: commits, tags, aur secrets

**Commits ab tak (purane se naye):**

| Commit | Kya hua |
| --- | --- |
| `d4b0a60` | Initial commit |
| `dfadf43` | Lumius desktop, OS overlay aur ISO build pipeline |
| `3f58def` | README mein pipeline check line |
| `8b75ad2` | Glass UI refine, daily use ke layak banaya |
| `1c20313` | Browser preview ko working demo banaya |
| `e21c295` | Flathub add kiya |
| `9a29406` | Ask feature (Exa) |

**Tags:** Abhi koi git tag nahi banaya hai. Version number `0.1.0` [package.json](../package.json) aur [Cargo.toml](../src-tauri/Cargo.toml) mein likha hai. Jab install wala test pass ho jayega tab `v0.1.0` tag banane ka plan hai:

```bash
git tag -a v0.1.0 -m "Lumius 0.1.0"
git push origin v0.1.0
```

Har commit ke end mein `Co-Authored-By: Claude` line hai — matlab woh commit Claude Code ki madad se bana.

**Secrets:** Exa ki API key `.env.local` file mein hai, jo `.gitignore` mein hai — GitHub par kabhi nahi jaati. Browser demo mein key Vite ka dev server khud jodta hai, page tak nahi pahunchti. Native app mein key `EXA_API_KEY` environment variable ya Settings se save hoti hai (private file, sirf user padh sakta hai).

**Agent skill:** Exa API sahi tarike se use karne ke liye Claude Code mein `build-with-exa` skill install ki ([.agents/skills/build-with-exa](../.agents/skills/build-with-exa/SKILL.md)).

---

## 7. Abhi kaam kahan tak pahuncha?

| Cheez | Status |
| --- | --- |
| React UI build | ✅ Pass |
| Browser tests (9 Playwright tests) | ✅ Pass |
| Rust tests (8 tests) | ✅ Pass |
| Native app Linux par chalti hai, asli folder bana sakti hai | ✅ Checked |
| `.deb` app package | ✅ Ban gaya |
| ISO build (~3.1 GB) | ✅ Ban gaya |
| Purani ISO QEMU mein live desktop tak boot | ✅ Hua |
| Latest ISO ka fresh boot | ⏳ Baaki |
| Calamares se disk par poora install | ⏳ Baaki |
| Install ke baad bina ISO boot + reboot ke baad settings bachi rehna | ⏳ Baaki |
| Real music/volume VM mein | ⏳ Baaki |
| Asli laptop, Secure Boot, multi-monitor | ❌ Test nahi hua |

**Seedhi baat:** App aur ISO ban chuke hain, live desktop dikh chuka hai. **Agla bada step: VM mein poora install karke, ISO hata ke boot karna aur reboot test.** Yeh pass hone tak isko "ready OS" mat bolna — yeh developer preview hai.

---

## 8. Tum khud kaise chalao

**Sirf UI dekhna hai (2 minute):**

```bash
git clone https://github.com/Anmol-Kumar01/lumius.git
cd lumius
npm ci
npm run dev        # browser mein http://127.0.0.1:1420 kholo
```

Alag screens: `/?view=files`, `/?view=settings`, `/?view=island`, `/?view=dock`. Yeh demo hai — tumhare computer ki files ko chhuta bhi nahi.

Ask feature try karna ho toh project folder mein `.env.local` banao aur usmein `EXA_API_KEY=apni_key` likho, phir `npm run dev` restart karo.

**Tests chalane hain:**

```bash
npx playwright install chromium
npm test
```

**Poora OS build karke VM mein chalana hai:** [BUILD.md](BUILD.md) follow karo (Docker mein Debian 13, 30–90 minute lagte hain, ~40 GB jagah chahiye). Short mein:

```bash
bash scripts/build-linux.sh      # .deb app
sudo bash scripts/build-iso.sh   # ISO
bash scripts/run-vm.sh live      # QEMU mein boot
```

⚠️ Build hamesha Linux filesystem (jaise home folder) par karna, NTFS/exFAT external drive par nahi. Aur asli laptop par install sirf VM test pass hone ke baad.

---

## 9. License

Lumius ka code **GPL-3.0** (open source) hai. Ek chhota animation part [Nectar](https://github.com/kua8/Nectar) project se liya hai, poore credit ke saath — details [THIRD_PARTY.md](../THIRD_PARTY.md) mein. Koi Apple logo, font ya code use nahi kiya; glass look sirf inspiration hai.
