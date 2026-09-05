#!/usr/bin/env bash
# "Compile" the WordPress plugin of one vacation.
#   ./build_plugin.sh vilnoess
# Input:  data/<id>.js (from clean_tool/clean_gpx.py), src/core, src/assets, src/plugin.php.template
# Output: plugins/vacation-3d-map-<id>/  and  dist/vacation-3d-map-<id>.zip   (both gitignored)
set -euo pipefail
cd "$(dirname "$0")"
ID="${1:?usage: build_plugin.sh <vacation-id>}"
SLUG="vacation-3d-map-${ID}"
OUT="plugins/${SLUG}"
[ -f "data/${ID}.js" ] || { echo "missing data/${ID}.js -- run: python3 clean_tool/clean_gpx.py --id ${ID} --config <json>"; exit 1; }
rm -rf "$OUT"; mkdir -p "$OUT/data" dist
cp -R src/core src/assets "$OUT/"
cp "data/${ID}.js" "$OUT/data/${ID}.js"
python3 clean_tool/render_plugin_php.py "$ID" "$SLUG" "$OUT"
(cd plugins && rm -f "../dist/${SLUG}.zip" && zip -qr "../dist/${SLUG}.zip" "$SLUG" -x '*.DS_Store')
echo "built $OUT ($(du -sh "$OUT" | cut -f1)) and dist/${SLUG}.zip ($(du -sh "dist/${SLUG}.zip" | cut -f1))"
