<?php
/**
 * Vacation 3D Map -- gemeinsamer Block-Code aller Urlaubs-Plugins.
 *
 * Jedes Urlaubs-Plugin bringt diesen Ordner unverändert mit. Das erste Plugin,
 * das lädt, registriert den Block und stellt die Assets; die anderen sehen die
 * Konstante und überspringen den Teil. Welches Plugin "gewinnt", ist egal, die
 * Dateien sind identisch. Beim Aktualisieren des Core-Codes deshalb alle
 * Urlaubs-Plugins neu deployen.
 */

if (!defined('ABSPATH')) {
    exit;
}
if (defined('VACATION3D_CORE_LOADED')) {
    return;
}
define('VACATION3D_CORE_LOADED', true);
define('VACATION3D_CORE_VERSION', '1.0.0');
define('VACATION3D_CORE_DIR', __DIR__);
define('VACATION3D_MAPLIBRE_VERSION', '5.24.0');   // letzte UMD-Version; ab 6.x nur noch ESM

/** Alle registrierten Urlaube: id => array(title, data_url, version, config). */
function vacation3d_maps() {
    $maps = apply_filters('vacation3d_maps', array());
    return is_array($maps) ? $maps : array();
}

/** Helfer für die generierten Urlaubs-Plugins: trägt den Urlaub in die Liste ein. */
function vacation3d_register_vacation($maps, $id, $plugin_file, $title, $version = '1.0.0') {
    $maps[$id] = array(
        'title'    => $title !== '' ? $title : $id,
        'version'  => $version,
        'data_url' => plugins_url('data/' . $id . '.js', $plugin_file),
    );
    return $maps;
}

function vacation3d_asset_url($relative) {
    return plugins_url('assets/' . $relative, dirname(__FILE__));
}

/** Cache-Buster: Änderungsdatum der Datei, damit Browser nach einem Deploy nicht altes JS behalten. */
function vacation3d_asset_version($relative) {
    $file = dirname(VACATION3D_CORE_DIR) . '/assets/' . $relative;
    return is_readable($file) ? (string) filemtime($file) : VACATION3D_CORE_VERSION;
}

add_action('init', function () {
    wp_register_script(
        'vacation3d-editor',
        plugins_url('editor.js', __FILE__),
        array('wp-blocks', 'wp-element', 'wp-components', 'wp-block-editor', 'wp-i18n'),
        VACATION3D_CORE_VERSION,
        true
    );
    $choices = array();
    foreach (vacation3d_maps() as $id => $map) {
        $choices[] = array('value' => $id, 'label' => isset($map['title']) ? $map['title'] : $id);
    }
    wp_localize_script('vacation3d-editor', 'VACATION3D_MAPS', $choices);

    register_block_type(__DIR__ . '/block.json', array(
        'render_callback' => 'vacation3d_render_block',
    ));
});

/** Frontend-Assets nur laden, wenn ein Block auf der Seite ist (Render-Callback). */
function vacation3d_enqueue_frontend($id, $map) {
    $cdn = 'https://unpkg.com/maplibre-gl@' . VACATION3D_MAPLIBRE_VERSION . '/dist/';
    wp_enqueue_style('maplibre-gl', $cdn . 'maplibre-gl.css', array(), VACATION3D_MAPLIBRE_VERSION);
    wp_enqueue_script('maplibre-gl', $cdn . 'maplibre-gl.js', array(), VACATION3D_MAPLIBRE_VERSION, true);
    wp_enqueue_style('vacation3d-map', vacation3d_asset_url('map.css'), array('maplibre-gl'), vacation3d_asset_version('map.css'));
    wp_enqueue_script('vacation3d-map', vacation3d_asset_url('map.js'), array('maplibre-gl'), vacation3d_asset_version('map.js'), true);
    wp_enqueue_script(
        'vacation3d-data-' . $id,
        $map['data_url'],
        array(),
        isset($map['version']) ? $map['version'] : VACATION3D_CORE_VERSION,
        true
    );
}

function vacation3d_render_block($attributes) {
    $maps = vacation3d_maps();
    if (empty($maps)) {
        return '<p class="vacation3d-missing">Vacation 3D Map: kein Urlaubs-Plugin aktiv.</p>';
    }
    $id = isset($attributes['vacation']) ? (string) $attributes['vacation'] : '';
    if ($id === '' || !isset($maps[$id])) {
        $id = array_key_first($maps);
    }
    $map    = $maps[$id];
    $height = isset($attributes['height']) ? max(240, (int) $attributes['height']) : 600;
    // data-config trägt nur Block-Overrides; Inhalt und Kamera kommen aus data/<id>.js.
    // Block-Attribut "zoom" überschreibt den Startzoom des Urlaubs (0 = nicht gesetzt).
    $config = array();
    $zoom = isset($attributes['zoom']) ? (float) $attributes['zoom'] : 0;
    if ($zoom > 0) {
        $config['overview'] = array('zoom' => $zoom);
    }

    vacation3d_enqueue_frontend($id, $map);

    $classes = 'vacation3d-map';
    if (!empty($attributes['align'])) {
        $classes .= ' align' . sanitize_html_class($attributes['align']);
    }
    $debug = '';
    if (isset($_GET['v3ddebug'])) {
        // Fängt Fehler ab, die passieren, bevor map.js sein Log-Panel aufbauen kann (z. B. ein
        // Syntaxfehler in map.js selbst auf alten Browsern), und schreibt sie in den Block.
        $debug = '<script>window.__v3dErrors=window.__v3dErrors||[];window.addEventListener("error",function(e){var m=(e.message||"")+" @"+(e.filename||"").split("/").pop()+":"+e.lineno;window.__v3dErrors.push(m);var el=document.querySelector(".vacation3d-map");if(el&&!el.querySelector(".v3d-debug")){var p=document.createElement("pre");p.className="v3d-debug";p.style.cssText="position:absolute;left:0;right:0;bottom:0;max-height:45%;overflow:auto;z-index:5;background:rgba(0,0,0,.8);color:#f99;font:10px/1.35 Menlo,monospace;padding:6px 8px;white-space:pre-wrap;word-break:break-all;margin:0";el.appendChild(p);}var pp=el&&el.querySelector(".v3d-debug");if(pp){pp.textContent+="error: "+m+"\n";}});window.addEventListener("load",function(){setTimeout(function(){var el=document.querySelector(".vacation3d-map");if(el&&!el.vacation3d&&!el.querySelector(".v3d-debug")){var p=document.createElement("pre");p.className="v3d-debug";p.style.cssText="position:absolute;left:0;right:0;bottom:0;z-index:5;background:rgba(0,0,0,.8);color:#f99;font:10px Menlo,monospace;padding:6px 8px;margin:0";p.textContent="map.js did not mount within 4 s after load. maplibregl: "+typeof window.maplibregl+", data: "+typeof window.VACATION3D_DATA+", Vacation3D: "+typeof window.Vacation3D;el.appendChild(p);}},4000);});</script>';
    }
    return $debug . sprintf(
        '<div class="%s" data-vacation="%s" data-config="%s" style="height:%dpx"></div>',
        esc_attr($classes),
        esc_attr($id),
        esc_attr(wp_json_encode($config)),
        $height
    );
}
