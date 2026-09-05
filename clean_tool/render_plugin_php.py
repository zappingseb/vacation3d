#!/usr/bin/env python3
"""Render the plugin main file of one vacation from src/plugin.php.template.

Called by build_plugin.sh: render_plugin_php.py <id> <slug> <outdir>. Title and description
come from the config embedded in data/<id>.js; the version is today's date.
"""
import datetime, json, re, sys, unicodedata

vid, slug, out = sys.argv[1:4]
src = open(f"data/{vid}.js", encoding="utf-8").read()
data = json.loads(re.search(r"\] = (\{.*?\});\n", src, re.S).group(1))
cfg = data.get("config") or {}
title = cfg.get("title") or vid
# plugin name: first part of the title, German transliteration (Villnöß -> Villnoess), or config "pluginName"
short = re.split(r" [–-] ", title)[0]
for a, b in (("ä", "ae"), ("ö", "oe"), ("ü", "ue"), ("Ä", "Ae"), ("Ö", "Oe"), ("Ü", "Ue"), ("ß", "ss")):
    short = short.replace(a, b)
ascii_title = cfg.get("pluginName") or unicodedata.normalize("NFKD", short).encode("ascii", "ignore").decode()
desc = cfg.get("description") or f"3D-Karte der Wanderung {title}."
version = datetime.date.today().strftime("%Y.%m.%d")
php = (open("src/plugin.php.template", encoding="utf-8").read()
       .replace("{{ID}}", vid).replace("{{SLUG}}", slug)
       .replace("{{TITLE}}", title.replace("'", "\\'")).replace("{{TITLE_ASCII}}", ascii_title)
       .replace("{{DESCRIPTION}}", desc.replace("*/", "")).replace("{{VERSION}}", version))
open(f"{out}/{slug}.php", "w", encoding="utf-8").write(php)
print(f"plugin '{ascii_title}' v{version}: {len(data['tracks']['features'])} days, "
      f"{len(data.get('pois') or [])} pois, {len((data.get('interest_breaks') or {}).get('features', []))} named stops")
