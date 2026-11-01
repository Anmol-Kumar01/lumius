#!/bin/bash
set -euo pipefail
qa=/var/tmp/lumius-native-qa
mkdir -p "$HOME/Documents" "$HOME/Downloads" "$HOME/Music" "$HOME/Pictures" "$HOME/Desktop"
mkdir -p "$HOME/.config/lumius"
printf '%s\n' '{"glass":65,"reducedMotion":false,"reducedTransparency":false,"wallpaper":"aurora","pinned":["files","browser","music","terminal","settings"]}' > "$HOME/.config/lumius/settings.json"
printf 'This is a real file in the native Linux test account.\n' > "$HOME/Documents/Native-session.txt"
"$qa/lumius" --shell > "$qa/native.log" 2>&1 &
pid=$!
trap 'kill "$pid" 2>/dev/null || true' EXIT
for i in $(seq 1 40); do if xdotool search --name '^Lumius island$' >/dev/null 2>&1; then break; fi; sleep 1; done
kill -0 "$pid"
sleep 3
xdotool mousemove 720 20 click 1
"$qa/lumius" --settings >> "$qa/native.log" 2>&1
sleep 4
import -window root "$qa/native-settings.png"
"$qa/lumius" >> "$qa/native.log" 2>&1
sleep 4
wid=$(xdotool search --name '^Lumius files$' | head -1)
folder="Lumius-UI-QA-$(date +%s)"
xdotool mousemove --window "$wid" 110 145 click 1
sleep 1
xdotool type --clearmodifiers "$folder"
xdotool key Return
sleep 3
test -d "$HOME/$folder"
echo 'Native UI created a real folder successfully.'
import -window root "$qa/native-files.png"
rmdir "$HOME/$folder"
dock=$(xdotool search --name '^Lumius dock$' | head -1)
xdotool getwindowgeometry "$dock"
height=$(xdotool getwindowgeometry --shell "$dock" | sed -n 's/^HEIGHT=//p')
row_y=$((height - 31))
xwininfo -root -tree > "$qa/window-tree.txt"
import -window root "$qa/native-before-drag.png"
xdotool mousemove --window "$dock" 155 "$row_y" mousedown 1
sleep 1
xdotool mousemove --window "$dock" 170 "$row_y"
sleep 1
xdotool mousemove --window "$dock" 200 "$row_y"
sleep 1
xdotool mouseup 1
sleep 3
python3 -c 'import json,os; data=json.load(open(os.path.expanduser("~/.config/lumius/settings.json"))); assert data["pinned"][:2]==["browser","files"],data["pinned"]'
echo 'Native dock drag reordered and persisted app pins successfully.'
xdotool search --name '^Lumius' getwindowname > "$qa/windows.txt"
echo 'Native app launched and screenshots captured. Xvfb does not verify compositor blur.'
