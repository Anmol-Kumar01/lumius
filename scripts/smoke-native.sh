#!/bin/bash
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
qa=/var/tmp/lumius-native-qa
mkdir -p "$qa"
binary=${LUMIUS_SMOKE_BINARY:-"$root/src-tauri/target/release/lumius"}
[[ -x "$binary" ]] || binary="$root/src-tauri/target/debug/lumius"
cp "$binary" "$qa/lumius"
cp "$root/scripts/native-session-qa.sh" "$qa/session.sh"
chmod 755 "$qa" "$qa/lumius" "$qa/session.sh"
id lumius-test >/dev/null 2>&1 || useradd -m -s /bin/bash lumius-test
chown lumius-test:lumius-test "$qa"
install -d -m 700 -o lumius-test -g lumius-test "$qa/runtime"
runuser -u lumius-test -- env -u DBUS_SESSION_BUS_ADDRESS XDG_RUNTIME_DIR="$qa/runtime" GDK_BACKEND=x11 LIBGL_ALWAYS_SOFTWARE=1 LUMIUS_DIAGNOSTICS=1 dbus-run-session -- xvfb-run -a -s '-screen 0 1440x960x24' bash "$qa/session.sh"
cp "$qa"/*.png "$root/artifacts/"
cp "$qa/native.log" "$root/artifacts/native-session.log"
