(() => {
  const byId = id => document.getElementById('livermore-' + id);
  const surface = byId('map');
  const tools = byId('tools');
  const fallback = byId('fallback');
  const status = byId('status');
  const fit = byId('fit');
  const zoomIn = byId('in');
  const zoomOut = byId('out');
  const scoreLegend = byId('score-legend');
  const studyLegend = byId('study-legend');
  const assetPath = './assets/livermore/';
  const candidateKey = byId('candidate-key');
  const resolution = byId('resolution');
  const scoreBands = [[1, '#691019', '<1'], [2, '#b82e32', '1–<2'], [4, '#dd5d3e', '2–<4'], [10, '#ec8d59', '4–<10'], [50, '#f0b27e', '10–<50'], [Infinity, '#e9cfab', '≥50']];
  const grids = [[1000, 0, '1 km'], [100, 13, '100 m'], [25, 15.5, '25 m']];
  const studyTracks = [
    { identifier: 'N9393T', anchor: 2, color: '#4275b4' },
    { identifier: 'N86LP', anchor: 9, color: '#873a9d', dashArray: '7 5', labelLeft: true },
  ];

  function showStatus(message) {
    status.textContent = message;
  }

  async function readJSON(name) {
    const response = await fetch(assetPath + name);
    if (!response.ok) throw new Error('Replay data could not load');
    return response.json();
  }

  function showScoreLegend(bands, note) {
    const items = bands.map(([label, color]) => {
      const item = document.createElement('li');
      item.style.setProperty('--swatch', color);
      item.textContent = label;
      return item;
    });
    byId('bands').replaceChildren(...items);
    byId('scale-note').textContent = note;
    surface.setAttribute('aria-describedby', 'livermore-help livermore-scale-note');
    scoreLegend.hidden = false;
  }

  function createScoreLayer(L, stage, scoreIndex, ringIndex) {
    const features = stage.rows.map(row => {
      if (!Number.isFinite(row[scoreIndex]) || row[ringIndex]?.length !== 5) throw new Error('Unexpected score cell');
      return { type: 'Feature', properties: { score: row[scoreIndex] },
        geometry: { type: 'Polygon', coordinates: [row[ringIndex]] } };
    });
    return L.geoJSON({ type: 'FeatureCollection', features }, {
      pane: 'livermore-score-' + stage.spacing_m,
      interactive: false,
      style: cell => ({
        color: '#26190e',
        weight: stage.spacing_m === 25 ? .85 : 1,
        opacity: .55,
        fillColor: scoreBands.find(([limit]) => cell.properties.score < limit)[1],
        fillOpacity: .76,
        smoothFactor: 0,
        className: 'livermore-grid-cell',
      }),
    });
  }

  function studyLabel(L, coordinates, track) {
    const position = coordinates[track.anchor];
    const next = coordinates[track.anchor + 1];
    const latLng = point => L.latLng(point[1], point[0]);
    const project = point => L.CRS.EPSG3857.project(latLng(point));
    // These samples are in the original KML time order. A north-pointing
    // icon turns to follow the next recorded segment in the map projection.
    const direction = project(next).subtract(project(position));
    const heading = Math.atan2(direction.x, direction.y) * 180 / Math.PI;
    const content = document.createElement('span');
    content.className = 'livermore-flight-label-body';
    content.setAttribute('aria-hidden', 'true');
    content.style.setProperty('--study-color', track.color);
    content.style.setProperty('--study-heading', `${heading}deg`);
    const badge = document.createElement('span');
    badge.className = 'livermore-flight-badge';
    const plane = document.createElement('span');
    plane.className = 'livermore-flight-plane';
    badge.append(plane);
    const label = document.createElement('span');
    label.className = 'livermore-flight-id';
    label.textContent = track.identifier;
    content.append(badge, label);

    return L.marker(latLng(position), {
      pane: 'livermore-study', interactive: false, keyboard: false,
      icon: L.divIcon({
        html: content, iconSize: [24, 24], iconAnchor: [12, 12],
        className: track.labelLeft ? 'livermore-flight-label livermore-flight-label-left' : 'livermore-flight-label',
      }),
    });
  }

  function createStudyLayer(L, tracks) {
    const matches = (feature, track) => feature.properties.case.startsWith(track.identifier + '_');
    const geometry = L.geoJSON(tracks, {
      pane: 'livermore-study',
      interactive: false,
      style: feature => ({
        ...studyTracks.find(track => matches(feature, track)),
        className: 'livermore-study-track', weight: 3, opacity: 1, smoothFactor: 0,
      }),
    });
    const labels = studyTracks.map(track => {
      const coordinates = tracks.find(feature => matches(feature, track))?.geometry?.coordinates;
      if (!coordinates || coordinates.length <= track.anchor + 1) throw new Error('Missing study path');
      return studyLabel(L, coordinates, track);
    });
    return L.layerGroup([geometry, ...labels]);
  }

  function pointLayer(L, feature, kind, label) {
    const coordinates = feature?.geometry?.coordinates;
    if (coordinates?.length !== 2 || !coordinates.every(Number.isFinite)) throw new Error('Missing point');
    const element = document.createElement('span');
    element.className = 'livermore-point livermore-point-' + kind;
    element.setAttribute('aria-hidden', 'true');
    return L.marker([coordinates[1], coordinates[0]], {
      pane: 'livermore-points',
      keyboard: true,
      title: label,
      icon: L.divIcon({ html: element, className: 'livermore-point-marker', iconSize: [20, 20], iconAnchor: [10, 10] }),
    }).bindTooltip(label, { direction: kind === 'estimate' ? 'right' : 'left' });
  }

  function addReplayGrid(L, map, grid) {
    const scoreIndex = grid.cell_row_columns.indexOf('training_mse_hz2');
    const ringIndex = grid.cell_row_columns.indexOf('closed_wgs84_lon_lat_ring');
    if (scoreIndex < 0 || ringIndex < 0) throw new Error('Unexpected score grid');
    const layers = grids.flatMap(([spacing, threshold, label]) => {
      const stage = grid.stages.find(stage => stage.spacing_m === spacing && stage.rows.length);
      return stage ? [{ layer: createScoreLayer(L, stage, scoreIndex, ringIndex), threshold, label }] : [];
    });
    if (!layers.length) return;
    const updateGrid = () => {
      let visible = '';
      for (const { layer, threshold, label } of layers) {
        if (map.getZoom() >= threshold) {
          if (!map.hasLayer(layer)) layer.addTo(map);
          visible = label;
        } else if (map.hasLayer(layer)) layer.remove();
      }
      const note = visible ? 'Finest grid shown: ' + visible : 'Zoom in to see the search grid.';
      if (resolution.textContent !== note) resolution.textContent = note;
    };
    showScoreLegend(scoreBands.map(([, color, label]) => [label, color]),
      'The 1 km grid searches all pairs. Finer grids use the locked winning pair and clock time. These scores show fit, not confidence.');
    map.on('zoomend', updateGrid);
    updateGrid();
  }

  async function createMap() {
    const replayName = surface.dataset.replay;
    const [study, results] = await Promise.all([
      readJSON('study-reference.geojson'),
      readJSON(replayName).catch(() => null),
    ]);
    const candidate = results?.markers?.model_best_fit;
    const replay = results?.schema === 'livermore-automatic-real-audio-map/v1' &&
      results.mode === 'full_day_all_pairs' && results.reference_used_in_fit === false &&
      results.verified === false && candidate?.geometry?.type === 'Point' &&
      candidate.properties?.verified === false ? results : null;
    const L = window.L;
    const projection = L.CRS.EPSG3857;
    const searchBoundary = replay?.search_boundary || await readJSON('search-boundary.json');
    const outlineOptions = { pane: 'livermore-boundary', interactive: false, style: { fill: false, smoothFactor: 0 } };
    const outline = L.geoJSON(searchBoundary, {
      ...outlineOptions, style: { ...outlineOptions.style, color: '#f4f4f4', weight: 1.8 },
    });
    const searchBounds = outline.getBounds();
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    surface.hidden = false;
    fallback.hidden = true;
    tools.hidden = false;

    const map = L.map(surface, {
      crs: projection,
      zoomControl: false,
      attributionControl: false,
      scrollWheelZoom: false,
      minZoom: 8,
      maxZoom: 18,
      maxBounds: searchBounds.pad(1),
      maxBoundsViscosity: 1,
      zoomSnap: .25,
      zoomAnimation: !reducedMotion,
      fadeAnimation: false,
    });
    let followingOverview = false;
    const fitSearch = () => {
      map.setMinZoom(8);
      map.fitBounds(searchBounds, { padding: [22, 22], animate: false });
      map.setMinZoom(Math.max(8, map.getZoom() - 1.25));
      followingOverview = true;
    };
    fitSearch();

    // The fitted overview follows the viewport until the visitor navigates the map.
    map.on('movestart zoomstart', () => { followingOverview = false; });
    map.on('resize', () => {
      if (followingOverview) fitSearch();
    });
    L.control.scale({ imperial: false, maxWidth: 86 }).addTo(map);

    const failedTiles = new Set();
    const scoreError = replay ? '' : 'The replay results couldn’t load.';
    const report = () => showStatus([scoreError, failedTiles.size ? 'Some terrain tiles couldn’t load.' : ''].filter(Boolean).join(' '));
    report();
    L.tileLayer('https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 18,
      maxNativeZoom: 15,
      noWrap: true,
      keepBuffer: 1,
      updateWhenIdle: true,
      updateWhenZooming: false,
    }).on({
      tileerror(event) { failedTiles.add(event.tile); report(); },
      tileunload(event) { if (failedTiles.delete(event.tile)) report(); },
    }).addTo(map);

    for (const [paneName, order] of [
      ['livermore-score-1000', 410], ['livermore-score-100', 420], ['livermore-score-25', 430],
      ['livermore-boundary', 450], ['livermore-study', 465], ['livermore-points', 480],
    ]) {
      const pane = map.createPane(paneName);
      pane.style.zIndex = order;
      if (paneName !== 'livermore-points') pane.style.pointerEvents = 'none';
    }
    const updateMapControls = () => {
      const zoom = map.getZoom();
      zoomIn.disabled = zoom >= map.getMaxZoom();
      zoomOut.disabled = zoom <= map.getMinZoom();
    };
    L.geoJSON(searchBoundary, {
      ...outlineOptions, style: { ...outlineOptions.style, color: '#252829', weight: 5 },
    }).addTo(map);
    outline.addTo(map);
    createStudyLayer(L, study.features.filter(feature => feature.properties.kind === 'track')).addTo(map);
    const observer = study.features.find(feature => feature.properties.kind === 'observer');
    pointLayer(L, observer, 'reference', 'Study-reported phone location').addTo(map);
    studyLegend.hidden = false;

    if (replay) {
      pointLayer(L, candidate, 'estimate', 'Best fit').addTo(map);
      candidateKey.hidden = false;
      if (replay.score_grid) addReplayGrid(L, map, replay.score_grid);
    }

    zoomIn.addEventListener('click', () => map.zoomIn());
    zoomOut.addEventListener('click', () => map.zoomOut());
    fit.addEventListener('click', fitSearch);
    surface.addEventListener('focus', () => map.scrollWheelZoom.enable());
    surface.addEventListener('blur', () => map.scrollWheelZoom.disable());
    map.on('zoomend', updateMapControls);
    updateMapControls();
  }

  createMap().catch(() => {
    surface.hidden = true;
    tools.hidden = true;
    fallback.hidden = false;
    studyLegend.hidden = true;
    scoreLegend.hidden = true;
    showStatus('The map could not load. Try refreshing the page.');
  });
})();

