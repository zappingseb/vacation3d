<?php
/**
 * Plugin Name:       Vacation 3d MAP Vilnoess
 * Plugin URI:        https://github.com/zappingseb/vacation3d
 * Description:       3D-Karte (MapLibre GL, Gelände + Luftbild) der Geisler-Umrundung im Villnößtal, August 2026. Liefert den Gutenberg-Block "Vacation 3D Map" mit einem Dropdown der installierten Urlaube. Ein Plugin pro Urlaub: dieses hier bringt den Block-Code mit und registriert den Urlaub "vilnoess". Weitere Urlaubs-Plugins nach demselben Muster hängen sich in den Filter vacation3d_maps ein.
 * Version:           1.0.0
 * Author:            Sebastian Engel-Wolf
 * License:           GPL-2.0-or-later
 * Requires at least: 6.4
 * Requires PHP:      7.4
 *
 * Quelle:  https://github.com/zappingseb/vacation3d -> vacations/vilnoess.php (diese Datei),
 *          src/core, src/assets, data/vilnoess.js
 * Build:   ./build_plugin.sh vilnoess   -> plugins/vacation-3d-map-vilnoess/ + dist/*.zip
 * Deploy:  siehe README.md im Repo (FTP über das music_blog-Tooling oder Zip-Upload in wp-admin)
 * NICHT auf dem Server editieren -- der nächste Build/Deploy überschreibt alles.
 *
 * Ordner nach dem Build:
 *   vacation-3d-map-vilnoess.php  <- diese Datei: registriert den Urlaub (nur die ID)
 *   core/                          <- Block-Registrierung, Render-Callback, Editor-Script
 *                                     (identisch in jedem Urlaubs-Plugin, lädt nur einmal)
 *   assets/map.js, map.css         <- die Kartenlogik (src/assets im Repo)
 *   data/vilnoess.js               <- Tracks, Pausen, POIs und Kamera, generiert von clean_tool/clean_gpx.py
 *   data/vilnoess.json             <- die Quelle dafür (Kopie von vacations/vilnoess.json), liefert den Titel
 */

if (!defined('ABSPATH')) {
    exit;
}

require_once __DIR__ . '/core/vacation3d-core.php';

/**
 * Diesen Urlaub für den Block anmelden. Alles Inhaltliche (Titel, POIs, Pausen-Namen,
 * Kamera, Farben) steht in vacations/<id>.json im Repo und landet über clean_gpx.py in
 * data/<id>.js -- hier steht nur, WELCHER Urlaub das ist. Kein zweiter Datenort.
 */
add_filter('vacation3d_maps', function ($maps) {
    return vacation3d_register_vacation($maps, 'vilnoess', __FILE__, '1.0.0');
});
