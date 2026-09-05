# vacation3d — Claude Notes

3D hike maps (MapLibre GL terrain + Esri imagery) as a WordPress Gutenberg block, one small
plugin per vacation. Started 2026-09-04 as prototype in `~/Documents/git/3dmap` (retired),
continued here. Owner: Sebastian (zappingseb), blog https://engel-wolf.com (theme "engelwolf").

## Adding or changing a vacation → use the `new-vacation` skill

It is an interview: GPX files → confirm the day split → name each break or not → POIs →
camera → build → deploy → test post. Do not guess labels or coordinates, ask.

## Working rules

- ONE data source per vacation: `vacations/<id>.json` (title, POIs, break names, camera, colours)
  plus the GPX in `raw/<id>/`. `clean_tool/clean_gpx.py --id <id>` bakes both into `data/<id>.js`
  (tracks, breaks, interest_breaks, pois, config). PHP holds no content, only the id.
- Code: `src/assets/map.js|map.css` (map), `src/core/` (block). `plugins/` and `dist/` are build
  output of `./build_plugin.sh <id>`, gitignored: build before every deploy, never edit them, never
  edit files on the server. The deploy tool writes backups to `plugins/.remote-backup/`, also ignored.
- Committed per vacation: `vacations/<id>.json` (what you edit), `vacations/<id>.php` (WP header + id),
  `data/<id>.js` (generated, but the GPX it comes from is gitignored because of the timestamps).
- `demo/index.html` and the block pass only overrides in data-config (`hash`, `overview.zoom`).
- MapLibre is pinned to **5.24.0 UMD** (last non-ESM release); WP 6.4.7 has no script-module API.
- Commit as author "Sebastian Engel-Wolf <sebastian@mail-wolf.de>" (the repo's identity), push to main.

## Data pipeline

```bash
python3 clean_tool/clean_gpx.py --id vilnoess   # reads raw/vilnoess/*.gpx + vacations/vilnoess.json
./build_plugin.sh vilnoess                       # -> plugins/vacation-3d-map-vilnoess + dist/*.zip
python3 -m http.server 8766                      # demo: http://localhost:8766/demo/index.html
```
`data/<id>.js` = `window.VACATION3D_DATA[id] = {tracks, breaks, interest_breaks, pois, config}` plus
constants TRACKS / BREAKS / INTEREST_BREAKS / POIS. Break names in the json (`"breaks": {"2:54": "Geisleralm"}`,
day:minutes) move a pause from breaks to interest_breaks (orange, labelled). `"days": "date"` or
`--by-date` pools all GPX points and splits by calendar date.

## Deploy and test on the blog (it is a dev system, owner's words)

```bash
cd ~/Documents/git/music_blog
.venv/bin/python -m musicblog.publish plugin-push \
    --source ../vacation3d/plugins/vacation-3d-map-vilnoess \
    --remote wp-content/plugins/vacation-3d-map-vilnoess
```
FTP + health check + rollback come from the music_blog repo; its `.env` has WP_URL / WP_USER /
WP_PWD (application password) and the FTP login. WP REST works via `?rest_route=/wp/v2/...`
(pretty permalinks are off). Plugin activation via REST `plugins/<slug>/<slug>` works.

- Plugin slug on the server: `vacation-3d-map-vilnoess`, active since 2026-09-04.
- Test post: id 5064, https://engel-wolf.com/?p=5064, status private, tag "private" (id 460).
  Two blocks: zoom 12.0 at 600 px, and default zoom at 420 px. Owner logs into wp-admin in
  Chrome, so the Claude-in-Chrome tab can open private posts.
- Block: `vacation3d/map`, attributes vacation (id), height (px), zoom (0 = vacation default),
  align wide/full. Dynamic block, rendered in `vacation3d_render_block()`.

## Gotchas (all verified)

- MapLibre ≥ 5 treats GeoJSON z as absolute height → line hidden under exaggerated terrain.
  map.js strips z for the map (`flat()`), keeps it for the profile.
- Changing zoom AND pitch every animation frame on terrain crashes WebGL after seconds.
  Camera flight eases once (`easeTo`, then `camReady`) and afterwards only pans the center.
- rAF timestamps can precede performance.now() from the click → first frame only sets the reference.
- requestAnimationFrame pauses in hidden tabs: a "stalled" camera flight during browser tests
  usually means the tab was in the background. Check `document.visibilityState` first.
- Terrain looks flat until Mapterhorn DEM tiles arrive (5–10 s cold); a banner covers that.
- Two `raster-dem` sources (terrain + hillshade) or MapLibre warns.
- iOS has no Fullscreen API for elements → CSS fallback class `v3d-fs` (position fixed).
- Headless Chrome with `--virtual-time-budget` never reaches map `idle`; use the real Chrome tab.

## Ideas not done

Bus leg between St. Magdalena and Guggan (no GPX), photo markers from EXIF, fit-bounds camera
for narrow columns instead of the manual zoom attribute, CesiumJS variant with photorealistic tiles.
