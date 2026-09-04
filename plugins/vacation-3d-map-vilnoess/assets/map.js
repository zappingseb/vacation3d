/*
 * Vacation 3D Map -- MapLibre GL terrain map of a multi-day hike.
 *
 *   Vacation3D.mount(container, config, data)
 *
 * container: a block element; gets the map canvas, player, HUD and elevation profile injected.
 * config:    { title, colors[], secondsPerDay, exaggeration, overview{center,zoom,pitch,bearing},
 *              follow{zoom,pitch}, pois[ {label, lon, lat} | {label, track, at:'start'|'end'} ],
 *              autoplay?, hash? }
 * data:      { tracks: FeatureCollection<LineString [lon,lat,ele]>, breaks: FeatureCollection<Point>,
 *              interest_breaks: FeatureCollection<Point with properties.name> }
 *            as written by clean_tool/clean_gpx.py.
 *
 * Auto-init: every element .vacation3d-map[data-vacation][data-config] is mounted on DOMContentLoaded
 * with data from window.VACATION3D_DATA[data-vacation]. Needs the global `maplibregl` (UMD build).
 */
(function () {
  'use strict';

  const SVG = {
    play:  '<svg viewBox="0 0 24 24"><path d="M7 4v16l13-8z"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><path d="M6 4h4v16H6zm8 0h4v16h-4z"/></svg>',
    stop:  '<svg viewBox="0 0 24 24"><path d="M5 5h14v14H5z"/></svg>',
    ff:    '<svg viewBox="0 0 24 24"><path d="M3 5v14l8-7zm9 0v14l8-7z"/></svg>',
    next:  '<svg viewBox="0 0 24 24"><path d="M4 5v14l10-7zM16 5h3v14h-3z"/></svg>',
    mountain: '<svg viewBox="0 0 24 24"><path d="M2 20 L8 8 L12 14 L15 10 L22 20 Z"/></svg>',
    fsEnter: '<svg viewBox="0 0 24 24"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/></svg>',
    fsExit:  '<svg viewBox="0 0 24 24"><path d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5"/></svg>',
  };
  const DEFAULTS = {
    colors: ['#ff3b1f', '#ffb020', '#25d0ff', '#8cff5e', '#e07bff', '#ffffff'],
    secondsPerDay: 20,
    exaggeration: 1.3,
    follow: { zoom: 13.4, pitch: 62 },
    pois: [],
    imagery: {
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      attribution: 'Imagery © Esri, Maxar, Earthstar Geographics', maxzoom: 18,
    },
    dem: 'https://tiles.mapterhorn.com/tilejson.json',
  };

  // MapLibre >= 5 treats a z coordinate as absolute height, which would bury the line under
  // exaggerated terrain, so the map gets 2D copies; elevations stay in the data for the profile.
  function flat(fc) {
    const f2 = c => c.slice(0, 2);
    return { ...fc, features: fc.features.map(f => ({ ...f, geometry: { ...f.geometry,
      coordinates: f.geometry.type === 'Point' ? f2(f.geometry.coordinates) : f.geometry.coordinates.map(f2) } })) };
  }
  function haversine(a, b) {
    const R = 6371, dLat = (b[1] - a[1]) * Math.PI / 180, dLon = (b[0] - a[0]) * Math.PI / 180;
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * Math.PI / 180) * Math.cos(b[1] * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  }
  const lerp = (a, b, k) => a + (b - a) * k;
  function h(tag, cls, html) { const el = document.createElement(tag); if (cls) el.className = cls; if (html) el.innerHTML = html; return el; }

  // bounding box of all tracks -> fallback overview camera
  function boundsOf(tracks) {
    const b = new maplibregl.LngLatBounds();
    tracks.features.forEach(f => f.geometry.coordinates.forEach(c => b.extend([c[0], c[1]])));
    return b;
  }

  function mount(container, userConfig, data) {
    if (typeof maplibregl === 'undefined') { container.textContent = 'MapLibre GL fehlt.'; return null; }
    if (!data || !data.tracks) { container.textContent = 'Keine Track-Daten.'; return null; }
    const cfg = { ...DEFAULTS, ...userConfig, follow: { ...DEFAULTS.follow, ...(userConfig.follow || {}) } };
    const EMPTY = { type: 'FeatureCollection', features: [] };
    const TRACKS = data.tracks, BREAKS = data.breaks || EMPTY, INTEREST = data.interest_breaks || EMPTY;
    const COLORS = cfg.colors;

    // ---------------------------------------------------------------- DOM
    container.classList.add('vacation3d-map');
    container.innerHTML = '';
    const canvas = h('div', 'v3d-canvas');
    const loading = h('div', 'v3d-loading', 'Gelände und Luftbilder werden geladen …');
    const player = h('div', 'v3d-player'); player.dataset.state = 'idle';
    const btn = {};
    for (const [key, cls, title] of [['play', 'v3d-play', 'Kamerafahrt starten'], ['resume', 'v3d-resume', 'Weiter'], ['pause', 'v3d-pause', 'Pause'],
                                     ['stop', 'v3d-stop', 'Stop'], ['ff', 'v3d-ff', 'Doppelte Geschwindigkeit'], ['next', 'v3d-next', 'Nächster Tag']]) {
      btn[key] = h('button', cls, SVG[key === 'resume' ? 'play' : key]); btn[key].type = 'button'; btn[key].title = title; player.appendChild(btn[key]);
    }
    const hud = h('div', 'v3d-hud'); hud.hidden = true;
    const profileEl = h('div', 'v3d-profile'); profileEl.hidden = true;
    const cv = h('canvas'); profileEl.appendChild(cv);
    container.append(canvas, loading, player, hud, profileEl);

    // ---------------------------------------------------------------- map
    const overview = cfg.overview || (() => {
      const b = boundsOf(TRACKS), c = b.getCenter();
      return { center: [c.lng, c.lat], zoom: 12, pitch: 58, bearing: 0 };
    })();
    const lineColor = ['match', ['get', 'day']];
    TRACKS.features.forEach((f, i) => lineColor.push(f.properties.day, COLORS[i % COLORS.length]));
    lineColor.push('#fff');

    const map = new maplibregl.Map({
      container: canvas,
      ...overview,
      maxPitch: 85, maxZoom: 17,
      hash: !!cfg.hash,
      attributionControl: { compact: true },
      style: {
        version: 8,
        sources: {
          imagery: { type: 'raster', tileSize: 256, ...cfg.imagery },
          dem:     { type: 'raster-dem', url: cfg.dem },
          demHill: { type: 'raster-dem', url: cfg.dem },
          tracks:  { type: 'geojson', data: flat(TRACKS) },
          breaks:  { type: 'geojson', data: flat(BREAKS) },
        },
        layers: [
          { id: 'imagery', type: 'raster', source: 'imagery' },
          { id: 'hills', type: 'hillshade', source: 'demHill',
            paint: { 'hillshade-exaggeration': 0.35, 'hillshade-shadow-color': '#1a1f2e', 'hillshade-highlight-color': '#ffffff' } },
          { id: 'track-casing', type: 'line', source: 'tracks', layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: { 'line-color': '#000', 'line-width': 7, 'line-opacity': 0.55 } },
          { id: 'track', type: 'line', source: 'tracks', layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: { 'line-color': lineColor, 'line-width': 4 } },
          { id: 'breaks', type: 'circle', source: 'breaks',
            paint: { 'circle-radius': 5, 'circle-color': '#ff3b1f', 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5 } },
        ],
        terrain: { source: 'dem', exaggeration: cfg.exaggeration },
        sky: { 'sky-color': '#7fb2ff', 'horizon-color': '#dbe9ff', 'fog-color': '#c8d8ee', 'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.7, 'fog-ground-blend': 0.75 },
      },
    });
    // Fullscreen for the whole block (player, HUD and profile included). Phones cannot really use
    // the map inside a post column, and iOS has no Fullscreen API for plain elements, so there
    // is a CSS fallback: the container becomes position:fixed over the page.
    let fsBtn = null, savedHeight = '';
    const isFs = () => document.fullscreenElement === container || container.classList.contains('v3d-fs');
    const fsFallback = on => {
      if (on) { savedHeight = container.style.height; container.style.height = ''; container.classList.add('v3d-fs'); document.documentElement.classList.add('v3d-fs-page'); }
      else { container.classList.remove('v3d-fs'); document.documentElement.classList.remove('v3d-fs-page'); container.style.height = savedHeight; }
      map.resize();
    };
    const updateFsIcon = () => { if (fsBtn) { fsBtn.innerHTML = isFs() ? SVG.fsExit : SVG.fsEnter; fsBtn.title = isFs() ? 'Vollbild beenden' : 'Vollbild'; } };
    function toggleFullscreen() {
      if (isFs()) {
        if (document.fullscreenElement === container) document.exitFullscreen(); else fsFallback(false);
      } else if (container.requestFullscreen) {
        container.requestFullscreen().catch(() => fsFallback(true));
      } else {
        fsFallback(true);
      }
      setTimeout(updateFsIcon, 50);
    }
    document.addEventListener('fullscreenchange', () => { map.resize(); updateFsIcon(); });
    map.addControl({
      onAdd() {
        this.el = h('div', 'maplibregl-ctrl maplibregl-ctrl-group');
        fsBtn = h('button', 'v3d-fullscreen', SVG.fsEnter); fsBtn.type = 'button'; fsBtn.title = 'Vollbild';
        fsBtn.onclick = toggleFullscreen; this.el.appendChild(fsBtn); return this.el;
      },
      onRemove() { this.el.remove(); },
    }, 'top-right');
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    map.addControl({
      onAdd() {
        this.el = h('div', 'maplibregl-ctrl maplibregl-ctrl-group');
        this.btn = h('button', 'v3d-profile-toggle', SVG.mountain); this.btn.type = 'button'; this.btn.title = 'Höhenprofil ein/aus';
        this.btn.onclick = () => { profileEl.hidden = !profileEl.hidden; this.btn.classList.toggle('active', !profileEl.hidden); drawProfile(); };
        this.el.appendChild(this.btn); return this.el;
      },
      onRemove() { this.el.remove(); },
    }, 'top-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-right');

    // labelled places
    const trackPoint = (i, at) => { const c = TRACKS.features[i] && TRACKS.features[i].geometry.coordinates; return c && (at === 'start' ? c[0] : c[c.length - 1]); };
    for (const p of cfg.pois) {
      const pt = p.lon !== undefined ? [p.lon, p.lat] : trackPoint(p.track, p.at);
      if (!pt) continue;
      const el = h('div', 'v3d-poi', `<div class="dot"></div><div class="lbl">${p.label}</div>`);
      new maplibregl.Marker({ element: el, anchor: 'top' }).setLngLat([pt[0], pt[1]]).addTo(map);
    }
    // named stops (data.interest_breaks): labelled like the huts, smaller and orange
    for (const f of INTEREST.features) {
      const el = h('div', 'v3d-poi v3d-poi--break', `<div class="dot"></div><div class="lbl">${f.properties.name}</div>`);
      el.title = `Tag ${f.properties.day}, ${f.properties.time} UTC, Pause ${f.properties.minutes} min`;
      new maplibregl.Marker({ element: el, anchor: 'top' }).setLngLat([f.geometry.coordinates[0], f.geometry.coordinates[1]]).addTo(map);
    }
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false });
    map.on('mouseenter', 'breaks', e => {
      const p = e.features[0].properties;
      map.getCanvas().style.cursor = 'pointer';
      popup.setLngLat(e.lngLat).setHTML(`Tag ${p.day}, ${p.time} UTC<br>Pause ${p.minutes} min, ${Math.round(p.ele)} m`).addTo(map);
    });
    map.on('mouseleave', 'breaks', () => { map.getCanvas().style.cursor = ''; popup.remove(); });

    // ---------------------------------------------------------------- track geometry
    const DAYS = TRACKS.features.map(f => {
      const c = f.geometry.coordinates, cum = [0];
      for (let i = 1; i < c.length; i++) cum.push(cum[i - 1] + haversine(c[i - 1], c[i]));
      return { day: f.properties.day, coords: c, cum, len: cum[cum.length - 1], start: new Date(f.properties.start), endT: new Date(f.properties.end) };
    });
    let offset = 0;
    const PROFILE = DAYS.flatMap(d => { const o = offset; offset += d.len; return d.coords.map((p, i) => ({ x: o + d.cum[i], ele: p[2], lonlat: [p[0], p[1]], day: d.day })); });
    const TOTAL_KM = offset;

    // position on a day at fraction f of its length: [lon, lat, ele, wallclock]
    function positionAt(d, f) {
      if (!d || !d.coords.length) return [overview.center[0], overview.center[1], 0, new Date(0)];
      if (d.coords.length === 1) return [...d.coords[0], d.start];
      const target = Math.min(1, Math.max(0, f)) * d.len;
      let i = 1; while (i < d.cum.length - 1 && d.cum[i] < target) i++;
      const t = (target - d.cum[i - 1]) / Math.max(1e-9, d.cum[i] - d.cum[i - 1]);
      const a = d.coords[i - 1], b = d.coords[i];
      const clock = new Date(d.start.getTime() + f * (d.endT - d.start));
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, clock];
    }

    // ---------------------------------------------------------------- player
    const hikerEl = h('div', 'v3d-hiker');
    const hiker = new maplibregl.Marker({ element: hikerEl });
    const SPD = cfg.secondsPerDay, TOTAL_S = SPD * DAYS.length;
    let state = 'idle', elapsed = 0, lastFrame = null, raf = 0, follow = true, cursorKm = null, speed = 1, camReady = false, frameNo = 0;

    function setState(s) { state = s; player.dataset.state = s; hud.hidden = s === 'idle'; }
    function frame(now) {
      if (state !== 'playing') return;
      raf = requestAnimationFrame(frame);           // schedule first, so an error below never kills the loop
      // rAF timestamps can lie slightly before a performance.now() taken in the click handler,
      // so the first frame after (re)start only sets the reference and dt is clamped to [0, 0.1]
      if (lastFrame !== null) elapsed += speed * Math.min(0.1, Math.max(0, (now - lastFrame) / 1000));
      lastFrame = now;
      render();
    }
    function render() {
      if (elapsed >= TOTAL_S) { stop(); return; }
      const di = Math.min(DAYS.length - 1, Math.max(0, Math.floor(elapsed / SPD)));
      const d = DAYS[di], f = Math.min(1, Math.max(0, elapsed / SPD - di));
      const [lon, lat, ele, clock] = positionAt(d, f);
      hiker.setLngLat([lon, lat]);
      hikerEl.style.borderColor = COLORS[di % COLORS.length];
      hud.textContent = `Tag ${d.day} · ${clock.toISOString().slice(11, 16)} UTC · ${Math.round(ele)} m · ${(d.len * f).toFixed(1)} km`;
      cursorKm = DAYS.slice(0, di).reduce((s, x) => s + x.len, 0) + f * d.len;
      // Camera: zoom/pitch are eased ONCE when playback starts (see play); per frame only the center
      // is panned. Changing zoom and pitch every frame on 3D terrain re-meshes the DEM continuously
      // and crashes the WebGL renderer after a few seconds.
      if (follow && camReady && !map.isMoving()) {
        const c = map.getCenter();
        map.jumpTo({ center: [lerp(c.lng, lon, 0.08), lerp(c.lat, lat, 0.08)] });
      }
      if (!profileEl.hidden && (frameNo++ % 4 === 0)) drawProfile();
    }
    function play() {
      if (state === 'playing') return;
      if (state === 'idle') {
        elapsed = 0; follow = true; camReady = false;
        const [lon, lat] = positionAt(DAYS[0], 0);
        hiker.setLngLat([lon, lat]).addTo(map);
        map.easeTo({ center: [lon, lat], zoom: cfg.follow.zoom, pitch: cfg.follow.pitch, duration: 1500 });
        map.once('moveend', () => { camReady = true; });
      }
      setState('playing'); lastFrame = null; cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
    }
    function pause() { if (state !== 'playing') return; setState('paused'); cancelAnimationFrame(raf); }
    function stop() {
      if (state === 'idle') return;
      setState('idle'); cancelAnimationFrame(raf); hiker.remove(); cursorKm = null; camReady = false; drawProfile();
      map.flyTo({ ...overview, duration: 2000 });
    }
    btn.play.onclick = play; btn.resume.onclick = play; btn.pause.onclick = pause; btn.stop.onclick = stop;
    btn.ff.onclick = () => { speed = speed === 1 ? 2 : 1; btn.ff.classList.toggle('active', speed === 2); };
    btn.next.onclick = () => {
      if (state === 'idle') return;
      elapsed = (Math.floor(elapsed / SPD) + 1) * SPD;   // start of the next day, or past the end -> stop
      follow = true; render();
    };
    // the user takes over the camera: only events with an originalEvent come from the user
    for (const ev of ['dragstart', 'rotatestart', 'pitchstart', 'zoomstart']) map.on(ev, e => { if (e.originalEvent) follow = false; });
    map.on('wheel', () => { follow = false; });
    if (cfg.autoplay) map.once('idle', play);

    // ---------------------------------------------------------------- elevation profile
    const ctx = cv.getContext('2d');
    const hoverMarker = new maplibregl.Marker({ color: '#fff', scale: 0.7 });
    function drawProfile() {
      if (profileEl.hidden || !PROFILE.length) return;
      const dpr = window.devicePixelRatio || 1;
      cv.width = cv.clientWidth * dpr; cv.height = cv.clientHeight * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const W = cv.clientWidth, H = cv.clientHeight, pad = { l: 44, r: 10, t: 10, b: 18 };
      const emin = Math.floor(Math.min(...PROFILE.map(p => p.ele)) / 100) * 100, emax = Math.ceil(Math.max(...PROFILE.map(p => p.ele)) / 100) * 100;
      const X = v => pad.l + v / TOTAL_KM * (W - pad.l - pad.r), Y = e => pad.t + (1 - (e - emin) / (emax - emin)) * (H - pad.t - pad.b);
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#aab6c6'; ctx.font = '10px sans-serif'; ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.lineWidth = 1;
      for (let e = emin; e <= emax; e += 200) { ctx.fillText(e + ' m', 4, Y(e) + 3); ctx.beginPath(); ctx.moveTo(pad.l, Y(e)); ctx.lineTo(W - pad.r, Y(e)); ctx.stroke(); }
      for (let k = 0; k <= TOTAL_KM; k += 2) ctx.fillText(k + ' km', X(k) - 8, H - 5);
      let cur = null;
      PROFILE.forEach((p, i) => {
        if (p.day !== cur) { if (cur !== null) { ctx.lineTo(X(PROFILE[i - 1].x), Y(emin)); ctx.closePath(); ctx.fill(); }
          cur = p.day; ctx.fillStyle = COLORS[(cur - 1) % COLORS.length] + 'aa'; ctx.beginPath(); ctx.moveTo(X(p.x), Y(emin)); }
        ctx.lineTo(X(p.x), Y(p.ele));
      });
      ctx.lineTo(X(TOTAL_KM), Y(emin)); ctx.closePath(); ctx.fill();
      if (cursorKm !== null) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X(cursorKm), pad.t); ctx.lineTo(X(cursorKm), H - pad.b); ctx.stroke(); }
    }
    cv.onmousemove = ev => {
      const W = cv.clientWidth, km = (ev.offsetX - 44) / (W - 54) * TOTAL_KM;
      let best = PROFILE[0]; for (const p of PROFILE) if (Math.abs(p.x - km) < Math.abs(best.x - km)) best = p;
      hoverMarker.setLngLat(best.lonlat).addTo(map);
      hoverMarker.getElement().title = `${best.x.toFixed(1)} km, ${Math.round(best.ele)} m`;
    };
    cv.onmouseleave = () => hoverMarker.remove();
    new ResizeObserver(() => { map.resize(); drawProfile(); }).observe(container);

    // the terrain looks flat until the elevation tiles are in; say so instead of showing a flat map
    const loadPoll = setInterval(() => {
      if (map.loaded() && map.areTilesLoaded() && map.isSourceLoaded('dem')) { loading.hidden = true; clearInterval(loadPoll); }
    }, 500);

    const api = { map, play, pause, stop, toggleFullscreen, get state() { return state; }, get elapsed() { return elapsed; } };
    container.vacation3d = api;
    return api;
  }

  function autoInit() {
    document.querySelectorAll('.vacation3d-map[data-vacation]').forEach(el => {
      if (el.vacation3d) return;
      const id = el.dataset.vacation, registry = window.VACATION3D_DATA || {};
      let cfg = {}; try { cfg = JSON.parse(el.dataset.config || '{}'); } catch (e) { /* keep defaults */ }
      if (!registry[id]) { el.textContent = `Keine Daten für "${id}".`; return; }
      mount(el, cfg, registry[id]);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', autoInit); else autoInit();
  window.addEventListener('load', autoInit);   // data script may come after this one

  window.Vacation3D = { mount, autoInit, DEFAULTS };
})();
