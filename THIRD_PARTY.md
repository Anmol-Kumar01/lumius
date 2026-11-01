# Third-party attribution

Lumius original application code is GPL-3.0-only; see LICENSE. Bundled operating-system packages retain their respective licenses.

## Nectar / Bloom

- Upstream: https://github.com/kua8/Nectar
- Audited revision: bc0fd846208327b79d21d6fde7d9378fcb1e3105
- License: GPL-3.0-only (upstream LICENSE is preserved as this repository's LICENSE).
- Copyright: Nectar contributors and original Bloom contributors, including Sehajveer Singh.
- Adaptation: `src/nectar-motion.ts` adapts the independent width/height spring transition from Nectar's `src/App.tsx`. Lumius uses a new layout and a separate Linux backend; Nectar's Windows backend is not bundled.
- Inspect the exact source: `git clone https://github.com/kua8/Nectar.git upstream/Nectar` then `git -C upstream/Nectar checkout bc0fd846208327b79d21d6fde7d9378fcb1e3105`.

## Other dependencies

The image hook adjusts Debian live-config's SDDM session mapping from `plasma.desktop` to `plasmax11.desktop` and selects the Lumius Calamares branding. The original package copyright/license notices remain installed; the exact modifications are in `os/0100-lumius.hook.chroot` and matching source versions are recorded in the ISO source-package manifest.

React, Tauri, Motion, Phosphor, Rust crates and Debian packages retain their upstream copyright notices and licenses. Dependency versions are recorded by package-lock.json and src-tauri/Cargo.lock. Debian package copyright texts are installed under `/usr/share/doc/*/copyright`.

## Distribution requirement

A repository with Lumius code alone is not the complete corresponding source for the ISO. Before public binary distribution, publish the exact Lumius source revision, build scripts, lockfiles, patches and corresponding sources for redistributed components as required by each license, alongside the binary download. Include Debian source package versions matching the actual ISO package manifest; retain build logs. Firmware may be redistributable without being open source and must be identified separately. No public release should be described as entirely free-software-only when non-free firmware is included.
