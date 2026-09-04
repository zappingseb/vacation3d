<?php
/**
 * Plugin Name:       Vacation 3d MAP Vilnoess
 * Plugin URI:        https://github.com/zappingseb/3dmap
 * Description:       3D-Karte (MapLibre GL, Gelände + Luftbild) der Geisler-Umrundung im Villnößtal, August 2026. Liefert den Gutenberg-Block "Vacation 3D Map" mit einem Dropdown der installierten Urlaube. Ein Plugin pro Urlaub: dieses hier bringt den Block-Code mit und registriert den Urlaub "vilnoess". Weitere Urlaubs-Plugins nach demselben Muster hängen sich in den Filter vacation3d_maps ein.
 * Version:           1.0.0
 * Author:            Sebastian Engel-Wolf
 * License:           GPL-2.0-or-later
 * Requires at least: 6.4
 * Requires PHP:      7.4
 *
 * Quelle:  Repo 3dmap -> wordpress/vacation-3d-map-vilnoess/
 * Build:   ./build_plugin.sh   (kopiert web/map.js, web/map.css und tracks.js hierher)
 * Deploy:  aus dem music_blog-Repo heraus, siehe README.md in diesem Ordner
 *
 * Ordner:
 *   vacation-3d-map-vilnoess.php  <- diese Datei: registriert den Urlaub (Konfiguration unten)
 *   core/                          <- Block-Registrierung, Render-Callback, Editor-Script
 *                                     (identisch in jedem Urlaubs-Plugin, lädt nur einmal)
 *   assets/map.js, map.css         <- die Kartenlogik, generiert aus web/ im Repo
 *   data/vilnoess.js               <- die bereinigten GPX-Tracks als JS, generiert von clean_gpx.py
 */

if (!defined('ABSPATH')) {
    exit;
}

require_once __DIR__ . '/core/vacation3d-core.php';

/**
 * Diesen Urlaub für den Block anmelden. Der Schlüssel ('vilnoess') ist die ID,
 * die der Block als Attribut speichert, und muss zum Namen in data/vilnoess.js passen.
 */
add_filter('vacation3d_maps', function ($maps) {
    $maps['vilnoess'] = array(
        'title'    => 'Villnöß – Geisler-Umrundung 2026',
        'version'  => '1.0.0',
        'data_url' => plugins_url('data/vilnoess.js', __FILE__),
        'config'   => array(
            'title'          => 'Geisler-Umrundung, Villnöß',
            'colors'         => array('#ff3b1f', '#ffb020', '#25d0ff'),
            'secondsPerDay'  => 20,
            'exaggeration'   => 1.3,
            'overview'       => array('center' => array(11.762, 46.636), 'zoom' => 12.6, 'pitch' => 58, 'bearing' => 160),
            'follow'         => array('zoom' => 13.4, 'pitch' => 62),
            // Beschriftete Orte: feste Koordinaten oder Anfang/Ende eines Tages (0-basiert).
            'pois'           => array(
                array('label' => 'Guggan (Bus)',        'lon' => 11.794135, 'lat' => 46.661176),
                array('label' => 'Edelweißhütte',       'lon' => 11.768567, 'lat' => 46.666813),
                array('label' => 'Gampenalm',           'track' => 0, 'at' => 'end'),
                array('label' => 'Brogleshütte',        'track' => 1, 'at' => 'end'),
                array('label' => 'St. Magdalena (Bus)', 'track' => 2, 'at' => 'end'),
            ),
        ),
    );
    return $maps;
});
