# Running Lumius

## Try it in a virtual machine

Use the supplied amd64 ISO with an x86-64 UEFI virtual machine, 4 GiB RAM and a blank virtual disk of at least 30 GiB. The repository's `scripts/run-vm.sh live` creates a 40 GiB QEMU test disk without accessing physical disks.

The live session is temporary. It lets you try the desktop before installation; files and settings created in that live session are not configured to survive a reboot. Install onto the virtual disk to test persistence.

Open **Install Lumius** from the dock in the live session. Choose locale, keyboard and the blank virtual disk, create your own account, review the summary and install. Shut down, detach the ISO, and boot the virtual disk. The repository provides `scripts/run-vm.sh installed` for that second boot.

## Physical installation

First check `VALIDATION.md` for what has actually passed. A successful VM installation does not establish compatibility with a particular laptop or Secure Boot setup.

Writing an ISO to USB overwrites the selected USB. Choosing an installer's erase-disk option replaces the operating system and data on the selected disk. Back up data and verify the target device before either step. The project build/test scripts do not perform those physical-device operations.

## Everyday use

- Files operates on your account's real folders. Double-click to open; the bottom toolbar provides copy, cut, paste, rename, preview, ZIP extraction and trash.
- Trash can restore items when the original destination is free. It refuses collisions.
- For home-wide filename search, enable **Indexed search**, choose **Rebuild index**, enter a query and press Enter. Local folder filtering is available without an index.
- The island expands on click. Music controls use an MPRIS-compatible player; open Music, then play a local track. An original sample is included in the Music folder.
- Settings controls appearance and pins; complex device configuration opens KDE's native tools. Unsupported audio/backlight controls are disabled.
- Pin and reorder apps in Settings or by dragging icons in the dock/island. All three share the saved order.

## Recovering the shell

Open Konsole using KDE's runner (Alt+F2), then run:

```sh
systemctl --user reset-failed lumius-shell
systemctl --user restart lumius-shell
```

The KDE desktop remains available if the custom shell fails. Use its desktop context menu to add a standard panel when needed.
