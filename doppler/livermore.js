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
  const detail = byId('detail');
  const resolution = byId('resolution');
  const scoreBands = [[15, '#691019'], [20, '#b82e32'], [35, '#dd5d3e'], [100, '#ec8d59'], [500, '#f0b27e'], [Infinity, '#e9cfab']];
  const studyTracks = [
    { identifier: 'N9393T', anchor: 2, color: '#4275b4' },
    { identifier: 'N86LP', anchor: 9, color: '#873a9d', dashArray: '7 5', labelLeft: true },
  ];

  function showStatus(message) {
    status.textContent = message;
    status.hidden = !message;
  }

  async function readJSON(name) {
    const response = await fetch(assetPath + name);
    if (!response.ok) throw new Error('Replay data could not load');
    return response.json();
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
    const geometry = L.geoJSON(tracks, {
      pane: 'livermore-study',
      interactive: false,
      style: feature => ({
        ...studyTracks.find(track => feature.properties.id.startsWith(track.identifier + '-')),
        className: 'livermore-study-track', weight: 3, opacity: 1, smoothFactor: 0,
      }),
    });
    const labels = studyTracks.map(track => {
      const coordinates = tracks.features.find(feature => feature.properties.id.startsWith(track.identifier + '-'))?.geometry?.coordinates;
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

  async function createMap() {
    const data = await readJSON('livermore-assisted-real-audio-map-v1.json');
    const L = window.L;
    const stages = data.score_grid.stages;
    const columns = data.score_grid.cell_row_columns;
    const scoreIndex = columns.indexOf('training_mse_hz2');
    const ringIndex = columns.indexOf('closed_wgs84_lon_lat_ring');
    if (data.schema !== 'livermore-assisted-real-audio-map/v1' || data.reference_used_in_fit !== false ||
        data.markers.model_best_fit.properties.verified !== false ||
        scoreIndex < 0 || ringIndex < 0 || stages.map(stage => stage.spacing_m).join() !== '1000,100,25' ||
        stages.map(stage => stage.rows.length).join() !== '121,441,441') throw new Error('Unexpected example data');
    const projection = L.CRS.EPSG3857;
    const outlineOptions = { pane: 'livermore-boundary', interactive: false, style: { fill: false, smoothFactor: 0 } };
    const outline = L.geoJSON(data.search_boundary, {
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
    const report = () => showStatus(failedTiles.size ? 'Some terrain tiles could not load. The search cells and flight paths are still shown.' : '');
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
    const layers = stages.map(stage => createScoreLayer(L, stage, scoreIndex, ringIndex));
    layers[0].addTo(map);
    const updateMapControls = () => {
      const zoom = map.getZoom();
      zoomIn.disabled = zoom >= map.getMaxZoom();
      zoomOut.disabled = zoom <= map.getMinZoom();
      for (const [i, threshold] of [[1, 13], [2, 15.5]]) {
        if (zoom >= threshold && !map.hasLayer(layers[i])) layers[i].addTo(map);
        if (zoom < threshold && map.hasLayer(layers[i])) layers[i].remove();
      }
      const highest = zoom >= 15.5 ? '25 m' : zoom >= 13 ? '100 m' : '1 km';
      const label = 'Finest grid shown: ' + highest;
      if (resolution.textContent !== label) resolution.textContent = label;
    };
    L.geoJSON(data.search_boundary, {
      ...outlineOptions, style: { ...outlineOptions.style, color: '#252829', weight: 5 },
    }).addTo(map);
    outline.addTo(map);
    createStudyLayer(L, data.study_flight_paths).addTo(map);
    const reference = pointLayer(L, data.markers.published_recorder, 'reference', 'Published phone location').addTo(map);
    const estimate = pointLayer(L, data.markers.model_best_fit, 'estimate', 'Best-fit estimate (unverified)').addTo(map);
    studyLegend.hidden = false;

    detail.addEventListener('click', () => {
      const points = L.latLngBounds([reference.getLatLng(), estimate.getLatLng()]);
      map.setView(points.getCenter(), 16, { animate: false });
    });
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
    scoreLegend.hidden = true;
    showStatus('The map could not load. Try refreshing the page.');
  });
})();

