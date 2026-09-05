# vacation3d

3D hike maps for a WordPress blog: GPX tracks draped over real terrain and satellite imagery,
huts and named stops labelled, a "camera flight" that walks a dot along the route, and an
elevation profile. One Gutenberg block, one small plugin per vacation.

![Overview of the Villnöß hike](docs/screenshot-overview.jpg)

Camera flight, 20 s per day, with pause / stop / 2× / next day and a live HUD. The fullscreen
button (top right) takes the whole block fullscreen, which is the only sensible way on a phone:

![Camera flight](docs/screenshot-play.jpg)

Built on [MapLibre GL JS](https://maplibre.org) with free tiles and **no API keys**:
[Mapterhorn](https://mapterhorn.com) elevation, Esri World Imagery.

## Repository layout

```
raw/<id>/*.gpx              your original GPX files, GITIGNORED (timestamps = where you were, when)
data/<id>.js                THE file of one vacation: tracks, breaks, interest_breaks, pois, config (generated)
clean_tool/clean_gpx.py     GPX + config json -> data/<id>.js (cleaning, stop detection, day split)
clean_tool/render_plugin_php.py   renders the plugin main file from the template (used by the build)
src/core/                   the Gutenberg block: PHP registration + render, block.json, editor.js
src/assets/map.js, map.css  the map itself (also used by the demo page)
src/plugin.php.template     WordPress plugin header, filled in per vacation at build time
build_plugin.sh             the "compiler": src + data -> plugins/<slug>/ and dist/<slug>.zip (gitignored)
demo/index.html             standalone page, same markup the block renders
.claude/skills/new-vacation Claude Code skill: the interview for adding a vacation
```

There is exactly one committed file per vacation, `data/<id>.js`. It embeds the small config
(title, POIs, break names, camera) it was generated from, so it can be regenerated without the
config file, and it contains the cleaned tracks, whose GPX sources are deliberately not in git.

## Build and update the plugin

The plugin is **compiled**: nothing in `plugins/` is source. Every change follows the same three steps.

```bash
# 1. data (only when tracks, POIs, names or camera change)
python3 clean_tool/clean_gpx.py --id vilnoess --config cfg.json   # cfg.json: see the skill / section below
python3 clean_tool/clean_gpx.py --id vilnoess                     # later reruns: config reused from data/vilnoess.js

# 2. build  ->  plugins/vacation-3d-map-vilnoess/  +  dist/vacation-3d-map-vilnoess.zip
./build_plugin.sh vilnoess

# 3. deploy (FTP with health check and rollback, from the music_blog repo) ...
cd ../music_blog && .venv/bin/python -m musicblog.publish plugin-push \
    --source ../vacation3d/plugins/vacation-3d-map-vilnoess \
    --remote wp-content/plugins/vacation-3d-map-vilnoess
#    ... or upload dist/vacation-3d-map-vilnoess.zip in wp-admin -> Plugins -> Upload
```

Activate once under *Plugins*. Code changes in `src/` need steps 2 and 3 for **every** vacation
plugin, because each one ships its own copy of `core/` and `assets/` (the first to load registers
the block, the others skip it).

In a post, add the block **Vacation 3D Map** (category Embeds, or type `/vacation`), pick the
vacation in the dropdown and set height and zoom in the sidebar. Zoom 0 uses the vacation's
default; a ~700 px wide post column wants about 0.5 less than full screen.

## From GPX to data

```bash
# 1. drop the GPX files into raw/<id>/ and run the cleaner once to see days and breaks
python3 clean_tool/clean_gpx.py --id vilnoess
#      day 2 <- Track_2026-08-17.gpx: 1570 -> 414 pts, 9.92 km, +446/-465 m, 06:19-12:12 UTC
#      break: day 2 10:06 UTC, 54 min, 2006 m
# 2. write a config json (title, pois, breaks {"2:54": "Geisleralm"}, camera, colours) and run
python3 clean_tool/clean_gpx.py --id vilnoess --config cfg.json
```

With Claude Code, say "new vacation": the `new-vacation` skill asks for the GPX files, shows the
day split for confirmation, asks for each break whether it gets a name, collects the POIs and the
camera, writes the config and runs everything. The complete Villnöß config is in the skill as example.

The cleaner removes GPS jumps, collapses "standing around" (≥ 2 min within 15 m) into a
single point, drops micro-steps, simplifies with Douglas-Peucker (2.5 m) and median-smooths
the elevation. Typical result: 1400 raw points → 300 per day.

### Data model (`data/<id>.js`)

```js
window.VACATION3D_DATA["vilnoess"] = {
  tracks:          FeatureCollection<LineString [lon, lat, ele]>, one feature per day
                   (properties: day, date, dist_km, up_m, down_m, start, end),
  breaks:          FeatureCollection<Point>  unnamed pauses ≥ 10 min       -> small red dots with popup
  interest_breaks: FeatureCollection<Point>  pauses named in the config    -> orange dot + label
  pois:            [ {label, lon, lat} | {label, track, at: "start"|"end"} ]  -> red dot + big label
  config:          { title, description, days, breaks, colors, secondsPerDay, exaggeration, overview, follow }
};
```

The block and the demo only pass presentation overrides (`overview.zoom` from the block's zoom
setting, `hash` for the demo). Day split: one GPX file = one day by default; `"days": "date"`
pools all points and splits by calendar date.

## Preview locally

```bash
python3 -m http.server 8766
open http://localhost:8766/demo/index.html
```

## Adding a vacation

`raw/<newid>/` with the GPX files, config json, cleaner, build, deploy, activate: see "Build and
update the plugin" above, or let the `new-vacation` skill do the interview. The block's dropdown
lists every active vacation plugin.

## Things learned the hard way

- MapLibre 6 is ESM-only; the plugin uses the last UMD release (5.24.0) via `wp_enqueue_script`.
- A GeoJSON z coordinate is treated as absolute height since MapLibre 5, so the track ends up
  *below* exaggerated terrain. The map strips z and keeps elevation for the profile only.
- Changing zoom **and** pitch every animation frame on 3D terrain crashes the WebGL renderer
  after a few seconds. The camera flight eases to its zoom/pitch once and then only pans.
- The terrain looks flat until the DEM tiles have arrived (5–10 s cold). A banner says so.
- Two `raster-dem` sources, one for terrain, one for hillshade, or MapLibre complains.

## License

MIT, see [LICENSE](LICENSE). Map data: © Esri, Maxar, Earthstar Geographics (imagery),
© Mapterhorn (elevation), MapLibre GL JS (BSD-3).
