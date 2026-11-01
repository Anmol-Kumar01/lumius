# Lumius validation record

This report records observed results. Source availability and a successful app build do not by themselves prove that an ISO boots or installs.

## Verified on 2026-11-01

- Frontend production build and TypeScript check passed.
- Six Playwright browser checks passed: explicit preview labeling, directory navigation/list-grid switching, independent tab locations, island/Settings connections, persisted appearance/accessibility settings, unsupported system controls, visible mutation errors and compact viewport overflow.
- Native Linux Rust check passed on Debian 13 / WSL2.
- Eight native filesystem tests passed: valid names, ZIP path checks, no-overwrite rename, symlink-transfer refusal, ZIP traversal rejection, valid ZIP/text preview, byte-preserving copy/move/conflict handling and real trash/restore with collision refusal.
- Native Tauri application launched as a separate non-root Linux test user under Xvfb. Shell, Settings and Files windows opened. Files listed that account's actual directories.
- An automated native UI action created a real folder; the test checked the folder on disk and then removed that empty test folder.
- An optimized Debian application package was built; final integration packaging is tracked in build logs.

## Still required before calling the OS validated

- Live ISO boot to KDE/Lumius desktop, including compositor blur and window reservations.
- Calamares installation to an isolated blank virtual disk; installed boot without ISO.
- Persistence across installed-system reboot.
- Actual MPRIS playback and volume integration in the guest session.
- Fullscreen island reveal, display scaling and shell service restart in KDE.
- Removable-drive mounting and hardware backlight control where a device is available.
- Physical laptop and Secure Boot compatibility.

## Known boundaries

- Browser mode is a design preview. Its file list is explicitly labeled and system/file mutation actions fail visibly.
- Xvfb screenshots prove a native app session, not KWin backdrop blur.
- Glass is an original web/compositor approximation; exact Apple optical rendering is not implemented.
- ZIP extraction supports up to 4 GiB / 10,000 entries and rejects symlinks/traversal. Other archive formats open through system apps.
- Filename search is a manually rebuilt inventory of non-hidden home folders; stale entries are skipped, with up to 500 results.
- Transfer cancellation stops staging; interrupted staging files can remain after a crash. Recovery reports the interruption. A move whose source cleanup fails can leave the complete destination plus remaining source data; inspect both before retrying.
- Third-party applications retain their own internal interfaces.
- Multi-monitor layout, physical hardware, optical refraction in WebKit and accessibility beyond the implemented controls need further testing.
- Public ISO distribution additionally requires matching upstream source/license compliance; see THIRD_PARTY.md.
