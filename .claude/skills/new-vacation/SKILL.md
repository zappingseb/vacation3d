---
name: new-vacation
description: Interview-driven workflow to add a new vacation (or redo an existing one) to the vacation3d WordPress plugin — collect GPX files, verify the day split, name the breaks, collect POIs, choose the camera, build, deploy. Use when the user says "new vacation", "neuer Urlaub", "add a trip", "add GPX", or wants to change POIs/breaks of an existing vacation.
---

# Add a vacation to vacation3d

This is done rarely, so ask rather than guess. One question block at a time, wait for the answer,
then continue. The data model is: `raw/<id>/*.gpx` (gitignored) + `vacations/<id>.json`
(the ONLY place for POIs, break names, camera) → `clean_tool/clean_gpx.py` → `data/<id>.js`.
Never put content into PHP.

## 1. Id and GPX files

Ask for a short id (lowercase ascii, e.g. `vilnoess`) and where the GPX files are. Copy them to
`raw/<id>/`. Ask what the trip is (title, dates) for the json `title`/`description`.

## 2. Day split — confirm with the user

Run `python3 clean_tool/clean_gpx.py --id <id>` (works without a json yet). It prints one line per
day with source file, points, km, ascent/descent and start–end time, then the breaks. Show that
table and ask: *are these the days as you remember them?* Typical problems and fixes:

- one file contains several days, or several files make one day → put `"days": "date"` in the
  json (or run with `--by-date`), which pools all points and splits by calendar date
- a file with a few stray points from the previous evening → already handled (gap > 3 h at the start)
- a day that should not be shown → delete/move that file out of `raw/<id>/`

## 3. Breaks — ask for each one whether it gets a label

For every printed `break: day D HH:MM UTC, N min, E m` ask: hut name / place, or leave it as an
unnamed pause? Named ones go into the json as `"breaks": { "D:N": "Label" }` (day:minutes) and
render orange with a label; unnamed ones stay small red dots. If two breaks sit at the same spot
(same coordinates a few minutes apart) point that out; usually only the longer one gets the name.

## 4. POIs

Ask for the places that must be labelled: huts, start, end, bus stops. For each: label, and
either coordinates (lat, lon — the user often pastes "lat, lon" from Google Maps; the json wants
`lon` and `lat` as separate numbers) or "start/end of day N" → `{ "label", "track": N-1, "at": "start"|"end" }`
(track index is 0-based). Offer the day starts/ends as candidates.

## 5. Camera and colours

Write the json with `overview` = center (lon, lat of the track bbox centre), zoom ≈ 12.5,
pitch ≈ 58, bearing so the camera looks *along* the main ridge (ask which side the viewer should
stand on, or take 160 like Villnöß). `follow` = `{ "zoom": 13.4, "pitch": 62 }`. One colour per day,
the defaults in `vacations/vilnoess.json` are fine. Then run the cleaner again, serve the demo
(`python3 -m http.server 8766`, `demo/index.html` — change its `data-vacation` to the new id or
add a second block) and check it in Chrome. Adjust camera until the whole route is visible; the
user decides. Remember the animation only runs while the tab is visible.

## 6. Plugin and deploy

Copy `vacations/vilnoess.php` to `vacations/<id>.php`, change *Plugin Name*, *Description* and
the id in `vacation3d_register_vacation(..., '<id>', ...)`. Then:

```bash
./build_plugin.sh <id>
cd ../music_blog && .venv/bin/python -m musicblog.publish plugin-push \
    --source ../vacation3d/plugins/vacation-3d-map-<id> --remote wp-content/plugins/vacation-3d-map-<id>
```

Activate via REST (`POST ?rest_route=/wp/v2/plugins/vacation-3d-map-<id>/vacation-3d-map-<id>`
with `{"status":"active"}`) or wp-admin. Create/update a private test post tagged "private"
containing `<!-- wp:vacation3d/map {"vacation":"<id>","height":600} /-->`, open it in Chrome,
check labels, breaks, camera flight. Optionally set the post header with
`python -m musicblog.publish header <post_id> <image>`.

## 7. Commit

Commit json, data js, the php and the built plugin folder (raw GPX is ignored). Author
"Sebastian Engel-Wolf <sebastian@mail-wolf.de>". Update README "vacations" list if there is one.
