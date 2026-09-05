#!/usr/bin/env python3
"""Clean the Garmin GPX tracks and export them for the 3D map.

Steps per track:
  1. parse <trkpt> (lat, lon, ele, time)
  2. drop exact duplicates and points with implausible speed (> 12 km/h on foot)
  3. collapse "standing around" clusters: consecutive points that stay within
     STOP_RADIUS m of a cluster anchor for >= STOP_SECONDS are replaced by their centroid
  4. drop micro-steps shorter than MIN_STEP m (GPS jitter while walking slowly)
  5. Douglas-Peucker simplification with DP_TOLERANCE m
  6. median-smooth the elevation (window 5)

Usage:  python3 clean_tool/clean_gpx.py --id vilnoess [--config vacation.json] [--raw raw/vilnoess]

Reads raw/<id>/*.gpx (or the --raw folder) plus a small vacation config and writes data/<id>.js,
the ONE file the plugin and the demo need:
  window.VACATION3D_DATA[<id>] = { tracks, breaks, interest_breaks, pois, config }
    tracks           one LineString per day (properties: day, date, dist_km, up_m, down_m, start, end)
    breaks           unnamed pauses >= 10 min            -> small red dots with popup
    interest_breaks  pauses named in config "breaks"     -> orange dot + label
    pois             labelled places, {label, lon, lat} or {label, track, at: "start"|"end"}
    config           title, description, days, breaks, colors, secondsPerDay, exaggeration, overview, follow

The config is a json file (see the new-vacation skill for the example) given with --config.
Without --config the tool reuses the config embedded in an existing data/<id>.js, so rerunning
after new GPX files or a cleaning tweak keeps POIs, names and camera. Without either it still
runs and prints days and breaks, which is how you find the day:minutes keys to name.

Day split: one GPX file = one day by default ("days": "file"); "days": "date" or --by-date pools
all points and splits by calendar date. Cleaned GPX copies go next to the raw files (gitignored).
"""
import re, glob, math, json, os, datetime, statistics

STOP_RADIUS = 15.0     # m
STOP_SECONDS = 120     # s
MIN_STEP = 3.0         # m
DP_TOLERANCE = 2.5     # m
MAX_SPEED = 12 / 3.6   # m/s

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
R = 6371000.0

def hav(a, b):
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    dl = math.radians(b[1] - a[1])
    x = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(x))

def parse(path):
    s = open(path, encoding="utf-8").read()
    pts = []
    for lat, lon, ele, t in re.findall(
            r'<trkpt lat="([^"]+)" lon="([^"]+)">\s*<ele>([^<]+)</ele>\s*<time>([^<]+)</time>', s):
        pts.append(dict(lat=float(lat), lon=float(lon), ele=float(ele),
                        t=datetime.datetime.fromisoformat(t.replace("Z", "+00:00"))))
    name = re.search(r"<trk>.*?<name>([^<]+)</name>", s, re.S)
    return (name.group(1) if name else os.path.basename(path)), pts

def ll(p): return (p["lat"], p["lon"])

def drop_dupes_and_outliers(pts):
    out = [pts[0]]
    for p in pts[1:]:
        q = out[-1]
        d = hav(ll(q), ll(p)); dt = (p["t"] - q["t"]).total_seconds()
        if d < 0.01 and dt <= 0:
            continue
        if dt > 0 and d / dt > MAX_SPEED:
            continue  # GPS jump
        out.append(p)
    return out

def collapse_stops(pts):
    out, i, n = [], 0, len(pts)
    while i < n:
        anchor = pts[i]; j = i
        while j + 1 < n and hav(ll(anchor), ll(pts[j + 1])) <= STOP_RADIUS:
            j += 1
        dur = (pts[j]["t"] - pts[i]["t"]).total_seconds()
        if j > i and dur >= STOP_SECONDS:
            cl = pts[i:j + 1]
            out.append(dict(lat=statistics.mean(p["lat"] for p in cl),
                            lon=statistics.mean(p["lon"] for p in cl),
                            ele=statistics.median(p["ele"] for p in cl),
                            t=cl[0]["t"], stop_s=dur))
            i = j + 1
        else:
            out.append(pts[i]); i += 1
    return out

def drop_micro_steps(pts):
    out = [pts[0]]
    for p in pts[1:-1]:
        if hav(ll(out[-1]), ll(p)) >= MIN_STEP:
            out.append(p)
    out.append(pts[-1])
    return out

def to_xy(p, ref):
    lat0 = math.radians(ref["lat"])
    return ((p["lon"] - ref["lon"]) * math.cos(lat0) * 111320.0, (p["lat"] - ref["lat"]) * 110540.0)

def douglas_peucker(pts, tol):
    ref = pts[0]
    xy = [to_xy(p, ref) for p in pts]
    keep = [False] * len(pts); keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        if b <= a + 1: continue
        ax, ay = xy[a]; bx, by = xy[b]
        dx, dy = bx - ax, by - ay; L2 = dx * dx + dy * dy
        best, bi = -1.0, -1
        for i in range(a + 1, b):
            px, py = xy[i]
            if L2 == 0: d = math.hypot(px - ax, py - ay)
            else:
                t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / L2))
                d = math.hypot(px - (ax + t * dx), py - (ay + t * dy))
            if d > best: best, bi = d, i
        if best > tol:
            keep[bi] = True; stack += [(a, bi), (bi, b)]
    # always keep stop points so they can be shown as markers
    return [p for p, k in zip(pts, keep) if k or "stop_s" in p]

def smooth_ele(pts, w=5):
    h = w // 2; e = [p["ele"] for p in pts]
    for i, p in enumerate(pts):
        p["ele"] = round(statistics.median(e[max(0, i - h):i + h + 1]), 1)
    return pts

def stats(pts):
    dist = sum(hav(ll(pts[i]), ll(pts[i + 1])) for i in range(len(pts) - 1))
    up = sum(max(0, pts[i + 1]["ele"] - pts[i]["ele"]) for i in range(len(pts) - 1))
    down = sum(max(0, pts[i]["ele"] - pts[i + 1]["ele"]) for i in range(len(pts) - 1))
    return dict(dist_km=round(dist / 1000, 2), up_m=round(up), down_m=round(down),
                min_ele=round(min(p["ele"] for p in pts)), max_ele=round(max(p["ele"] for p in pts)),
                start=pts[0]["t"].isoformat(), end=pts[-1]["t"].isoformat())

def write_gpx(path, name, pts):
    with open(path, "w", encoding="utf-8") as f:
        f.write('<?xml version="1.0" encoding="UTF-8"?>\n'
                '<gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1" creator="clean_gpx.py">\n'
                f'<trk><name>{name}</name><trkseg>\n')
        for p in pts:
            f.write(f'<trkpt lat="{p["lat"]:.7f}" lon="{p["lon"]:.7f}"><ele>{p["ele"]:.1f}</ele>'
                    f'<time>{p["t"].strftime("%Y-%m-%dT%H:%M:%SZ")}</time></trkpt>\n')
        f.write('</trkseg></trk>\n</gpx>\n')

def read_embedded_config(path):
    """Config and POIs from an existing data/<id>.js, so a rerun does not need the json again."""
    s = open(path, encoding="utf-8").read()
    m = re.search(r"window\.VACATION3D_DATA\[\"[^\"]+\"\] = (\{.*?\});\n", s, re.S)
    if not m:
        return {}
    d = json.loads(m.group(1))
    cfg = dict(d.get("config") or {})
    cfg["pois"] = d.get("pois") or []
    if "breaks" not in cfg:   # older files: rebuild the names from the labelled stops
        cfg["breaks"] = {f"{f['properties']['day']}:{f['properties']['minutes']}": f["properties"]["name"]
                         for f in (d.get("interest_breaks") or {}).get("features", [])}
    return cfg


def main():
    import argparse
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--id", required=True, help="vacation id, e.g. vilnoess (key in data/<id>.js)")
    ap.add_argument("--raw", default=None, help="folder with the raw GPX files (default raw/<id>)")
    ap.add_argument("--by-date", action="store_true", help="pool all files and split into days by calendar date")
    ap.add_argument("--config", default=None, help="vacation config json (title, pois, breaks, camera); "
                                                  "default: the config embedded in an existing data/<id>.js")
    args = ap.parse_args()
    out = os.path.join(ROOT, "data", f"{args.id}.js")
    if args.config:
        cfg = json.load(open(args.config, encoding="utf-8"))
        print(f"config from {args.config}")
    elif os.path.exists(out):
        cfg = read_embedded_config(out)
        print(f"config reused from {os.path.relpath(out, ROOT)}")
    else:
        cfg = {}
        print("note: no config -- running without POIs/break names, see the breaks below to name them")
    names = {}
    for key, label in (cfg.get("breaks") or {}).items():
        day, _, minutes = key.partition(":")
        names[(int(day), int(minutes))] = label.strip()
    by_date = args.by_date or cfg.get("days") == "date"
    vacation_id = args.id
    raw_dir = args.raw or os.path.join(ROOT, "raw", vacation_id)
    cleaned_dir = os.path.join(raw_dir, "cleaned"); os.makedirs(cleaned_dir, exist_ok=True)
    gpx_files = sorted(glob.glob(os.path.join(raw_dir, "*.gpx")))
    if not gpx_files:
        raise SystemExit(f"no *.gpx in {raw_dir}")
    features, stops = [], []
    if by_date:
        pool = []
        for path in gpx_files:
            pool += parse(path)[1]
        pool.sort(key=lambda p: p["t"])
        days_in = []
        for p in pool:
            key = p["t"].date().isoformat()
            if not days_in or days_in[-1][0] != key:
                days_in.append((key, []))
            days_in[-1][1].append(p)
        print(f"{len(gpx_files)} file(s) pooled into {len(days_in)} day(s) by date")
    else:
        days_in = [(os.path.basename(path), parse(path)[1]) for path in gpx_files]
    for idx, (label, raw) in enumerate(days_in):
        path = label
        pts = drop_dupes_and_outliers(raw)
        # the device kept a few fixes from the previous evening: drop everything
        # before a gap > 3 h if that leading part is only a handful of points
        for i in range(1, min(len(pts), 20)):
            if (pts[i]["t"] - pts[i - 1]["t"]).total_seconds() > 3 * 3600:
                pts = pts[i:]
                break
        pts = collapse_stops(pts)
        pts = drop_micro_steps(pts)
        pts = douglas_peucker(pts, DP_TOLERANCE)
        pts = smooth_ele(pts)
        day = pts[0]["t"].strftime("%Y-%m-%d")
        st = stats(pts)
        print(f"day {idx + 1} <- {path}: {len(raw)} -> {len(pts)} pts, {st['dist_km']} km, +{st['up_m']}/-{st['down_m']} m, "
              f"{st['start'][11:16]}-{st['end'][11:16]} UTC")
        write_gpx(os.path.join(cleaned_dir, f"day{idx + 1}_{day}.gpx"), f"Day {idx + 1} {day}", pts)
        features.append(dict(type="Feature",
                             properties=dict(day=idx + 1, date=day, name=f"Day {idx + 1}", **st),
                             geometry=dict(type="LineString",
                                           coordinates=[[round(p["lon"], 6), round(p["lat"], 6), p["ele"]] for p in pts])))
        for p in pts:
            if p.get("stop_s", 0) >= 600:  # only breaks of 10 min or more
                stops.append(dict(type="Feature",
                                  properties=dict(day=idx + 1, minutes=round(p["stop_s"] / 60),
                                                  time=p["t"].strftime("%H:%M"), ele=p["ele"]),
                                  geometry=dict(type="Point", coordinates=[round(p["lon"], 6), round(p["lat"], 6), p["ele"]])))
    for f in stops:
        label = names.pop((f["properties"]["day"], f["properties"]["minutes"]), None)
        if label:
            f["properties"]["name"] = label
        print("  break: day {day} {time} UTC, {minutes} min, {ele:.0f} m".format(**f["properties"])
              + (f"  -> {label}" if label else ""))
    for (day, minutes), label in names.items():
        print(f"WARNING: no break with day {day} and {minutes} min for --name {label}")
    config = {k: cfg[k] for k in ("title", "description", "days", "breaks", "colors", "secondsPerDay",
                                  "exaggeration", "overview", "follow") if k in cfg}
    pois = cfg.get("pois") or []
    for poi in pois:
        if "track" in poi and not (0 <= int(poi["track"]) < len(features)):
            print(f"WARNING: poi {poi.get('label')!r} refers to track {poi['track']}, but there are {len(features)} days")
    tracks = dict(type="FeatureCollection", features=features)
    breaks = dict(type="FeatureCollection", features=[f for f in stops if "name" not in f["properties"]])
    interest = dict(type="FeatureCollection", features=[f for f in stops if "name" in f["properties"]])
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        f.write("// generated by clean_gpx.py — do not edit by hand\n")
        # registry keyed by vacation id, so several vacation plugins can coexist on one page
        f.write("window.VACATION3D_DATA = window.VACATION3D_DATA || {};\n")
        f.write("window.VACATION3D_DATA[" + json.dumps(vacation_id) + "] = "
                + json.dumps(dict(tracks=tracks, breaks=breaks, interest_breaks=interest, pois=pois, config=config),
                             ensure_ascii=False) + ";\n")
        # plain constants for standalone pages
        for const, key in (("TRACKS", "tracks"), ("BREAKS", "breaks"), ("INTEREST_BREAKS", "interest_breaks"), ("POIS", "pois")):
            f.write(f"const {const} = window.VACATION3D_DATA[{json.dumps(vacation_id)}].{key};\n")
    print(f"{len(breaks['features'])} breaks, {len(interest['features'])} named stops, {len(pois)} pois -> {os.path.relpath(out, ROOT)}")

if __name__ == "__main__":
    main()
