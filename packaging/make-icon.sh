#!/bin/sh
# 使用 macOS 內建的 sips 與 iconutil 從 AppIcon.svg 重新產生 AppIcon.icns；只有修改 SVG 後才需重跑
set -eu
cd "$(dirname "$0")"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
sips -s format png AppIcon.svg --out "$work/1024.png" >/dev/null
set=$work/AppIcon.iconset
mkdir "$set"
for size in 16 32 128 256 512; do
	sips -z "$size" "$size" "$work/1024.png" --out "$set/icon_${size}x${size}.png" >/dev/null
	double=$((size * 2))
	sips -z "$double" "$double" "$work/1024.png" --out "$set/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$set" -o AppIcon.icns
echo "packaging/AppIcon.icns updated"
