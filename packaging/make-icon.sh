#!/bin/sh
# Regenerates packaging/AppIcon.icns from packaging/AppIcon.svg with macOS
# built-ins only (sips renders the SVG, iconutil packs the sizes). Only needed
# after editing the SVG; install.sh copies the committed .icns as is.
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
