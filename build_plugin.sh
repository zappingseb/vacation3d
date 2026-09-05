#!/usr/bin/env bash
# Assemble the deployable WordPress plugin for one vacation.
#   ./build_plugin.sh vilnoess
# -> plugins/vacation-3d-map-vilnoess/  (committed)  and  dist/vacation-3d-map-vilnoess.zip  (ignored)
# Sources: vacations/<id>.php (plugin header + config), src/core (block), src/assets (map), data/<id>.js (tracks).
set -euo pipefail
cd "$(dirname "$0")"
ID="${1:?usage: build_plugin.sh <vacation-id>}"
SLUG="vacation-3d-map-${ID}"
OUT="plugins/${SLUG}"
[ -f "vacations/${ID}.php" ] || { echo "missing vacations/${ID}.php"; exit 1; }
[ -f "vacations/${ID}.json" ] || { echo "missing vacations/${ID}.json"; exit 1; }
[ -f "data/${ID}.js" ] || { echo "missing data/${ID}.js -- run: python3 clean_tool/clean_gpx.py --id ${ID}"; exit 1; }
rm -rf "$OUT"; mkdir -p "$OUT/data" dist
cp "vacations/${ID}.php" "$OUT/${SLUG}.php"
cp -R src/core src/assets "$OUT/"
cp "data/${ID}.js" "$OUT/data/${ID}.js"
cp "vacations/${ID}.json" "$OUT/data/${ID}.json"
(cd plugins && rm -f "../dist/${SLUG}.zip" && zip -qr "../dist/${SLUG}.zip" "$SLUG" -x '*.DS_Store')
echo "built $OUT ($(du -sh "$OUT" | cut -f1)) and dist/${SLUG}.zip ($(du -sh "dist/${SLUG}.zip" | cut -f1))"
