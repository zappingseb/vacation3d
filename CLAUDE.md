# vacation3d — Claude Notes

3D hike maps (MapLibre GL terrain + Esri imagery) as a WordPress Gutenberg block, one small
plugin per vacation. Started 2026-09-04 as prototype in `~/Documents/git/3dmap` (retired),
continued here. Owner: Sebastian (zappingseb), blog https://engel-wolf.com (theme "engelwolf").

## Working rules

- Source of truth: `src/assets/map.js|map.css` (map), `src/core/` (block), `vacations/<id>.php`
  (per-vacation config), `data/<id>.js` (generated). Never edit `plugins/` by hand: it is
  built by `./build_plugin.sh <id>` and committed. Never edit files on the server.
- Raw and cleaned GPX stay gitignored (`raw/`), they carry timestamps. Only `data/<id>.js` is committed.
- Config lives in PHP (`vacations/<id>.php`) and is mirrored in `demo/index.html` (data-config JSON).
  Change both.
- MapLibre is pinned to **5.24.0 UMD** (last non-ESM release); WP 6.4.7 has no script-module API.
- Commit as author "Sebastian Engel-Wolf <sebastian@mail-wolf.de>" (the repo's identity), push to main.

## Data pipeline

```bash
python3 clean_tool/clean_gpx.py --id vilnoess --name 2:54=Geisleralm --name 3:28=Waldschenke
./build_plugin.sh vilnoess          # -> plugins/vacation-3d-map-vilnoess + dist/*.zip
python3 -m http.server 8766         # demo: http://localhost:8766/demo/index.html
```
`data/<id>.js` = `window.VACATION3D_DATA[id] = {tracks, breaks, interest_breaks}` plus the
constants TRACKS / BREAKS / INTEREST_BREAKS. Named stops (`--name DAY:MIN=Label`) move from
breaks to interest_breaks and render once, orange with label.

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
