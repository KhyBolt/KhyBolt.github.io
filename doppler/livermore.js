(() => {
  const byId = id => document.getElementById('livermore-' + id);
  const surface = byId('map');
  const tools = byId('tools');
  const fallback = byId('fallback');
  const status = byId('status');
  const fit = byId('fit');
  const zoomIn = byId('in');
  const zoomOut = byId('out');
  const scoreButton = byId('scores');
  const scoreLegend = byId('score-legend');
  const studyButton = byId('study');
  const studyLegend = byId('study-legend');
  const assetPath = './assets/livermore/';
  const scoreAsset = 'livermore-adsblol-coarse-fit-v2.png';

  function showStatus(message) {
    status.textContent = message;
    status.hidden = !message;
  }

  async function readJSON(name) {
    const response = await fetch(assetPath + name);
    if (!response.ok) throw new Error('Replay data could not load');
    return response.json();
  }

  function createMesh(L, projection, perimeter, segments) {
    // Each side has the same 1 km samples. Join the half-cell boundaries
    // from opposite edges in the map projection, including half-width edge cells.
    const edgeMidpoint = (segment, direction) => {
      const a = projection.project(L.latLng(perimeter[segment][1], perimeter[segment][0]));
      const b = projection.project(L.latLng(perimeter[segment + direction][1], perimeter[segment + direction][0]));
      return projection.unproject(a.add(b).divideBy(2));
    };
    const mesh = L.layerGroup();
    const style = { color: '#162920', weight: 1, opacity: .38, interactive: false, pane: 'livermore-mesh' };
    for (let i = 0; i < segments; i++) {
      const south = edgeMidpoint(i, 1);
      const north = edgeMidpoint(3 * segments - i, -1);
      const west = edgeMidpoint(4 * segments - i, -1);
      const east = edgeMidpoint(segments + i, 1);
      L.polyline([south, north], style).addTo(mesh);
      L.polyline([west, east], style).addTo(mesh);
    }
    return mesh;
  }

  function createStudyLayer(L, references) {
    const validPosition = position => Array.isArray(position) && position.length === 2 &&
      position.every(Number.isFinite) && Math.abs(position[0]) <= 180 && Math.abs(position[1]) <= 90;
    const features = references.features;
    const validTrack = (feature, excerpt) => feature?.properties?.excerpt === excerpt &&
      feature.geometry?.type === 'LineString' && Array.isArray(feature.geometry.coordinates) &&
      feature.geometry.coordinates.length >= 2 && feature.geometry.coordinates.every(validPosition);
    if (references.type !== 'FeatureCollection' || features?.length !== 3 ||
        !validTrack(features[0], 1) || !validTrack(features[1], 2) ||
        features[2]?.properties?.kind !== 'observer' || features[2]?.geometry?.type !== 'Point' ||
        !validPosition(features[2].geometry.coordinates)) throw new Error('Unexpected study geometry');

    const tracks = [{ color: '#4275b4' }, { color: '#873a9d', dashArray: '7 5' }];
    return L.geoJSON(references, {
      pane: 'livermore-study',
      interactive: false,
      style: feature => feature.geometry.type === 'LineString'
        ? { ...tracks[feature.properties.excerpt - 1], className: 'livermore-study-track', weight: 3, opacity: 1, smoothFactor: 0 }
        : { className: 'livermore-study-observer', color: '#182a21', fillColor: '#fff8d6', weight: 2, fillOpacity: 1 },
      pointToLayer: (_feature, latlng) => L.circleMarker(latlng, {
        pane: 'livermore-study', interactive: false, radius: 6,
      }),
    });
  }

  async function createMap() {
    const [footprint, overlay] = await Promise.all([
      readJSON('search-boundary.json'),
      readJSON('overlay-metadata.json'),
    ]);
    const L = window.L;
    const [columns, rows] = overlay.sampling.dimensions_nodes;
    const perimeter = footprint.coordinates?.[0];
    const segments = columns - 1;
    if (overlay.image_crs !== 'EPSG:3857' || footprint.type !== 'Polygon' || columns !== rows ||
        segments !== 10 || overlay.sampling.coarse_node_spacing_m !== 1000 ||
        perimeter?.length !== 4 * segments + 1) throw new Error('Unexpected replay geometry');

    const projection = L.CRS.EPSG3857;
    const [west, south, east, north] = overlay.bounds_3857;
    const imageBounds = L.latLngBounds(
      projection.unproject(L.point(west, south)),
      projection.unproject(L.point(east, north)),
    );
    const outlineOptions = { pane: 'livermore-boundary', interactive: false, style: { fill: false, smoothFactor: 0 } };
    const outline = L.geoJSON(footprint, { ...outlineOptions,
      style: { ...outlineOptions.style, color: '#f6fff9', weight: 1.8 },
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
      maxZoom: 16,
      maxBounds: searchBounds.pad(1),
      maxBoundsViscosity: 1,
      zoomSnap: .25,
      zoomAnimation: !reducedMotion,
      fadeAnimation: !reducedMotion,
    });
    const fitSearch = () => {
      map.setMinZoom(8);
      map.fitBounds(searchBounds, { padding: [22, 22], animate: false });
      map.setMinZoom(Math.max(8, map.getZoom() - 1.25));
    };
    fitSearch();
    map.on('resize', fitSearch);
    L.control.scale({ imperial: false, maxWidth: 86 }).addTo(map);

    const failedTiles = new Set();
    let scoreUnavailable = false;
    let studyUnavailable = false;
    const report = () => showStatus([
      failedTiles.size ? 'Some terrain tiles could not load. The search boundary is still visible.' : '',
      scoreUnavailable ? 'Saved fit scores could not load.' : '',
      studyUnavailable ? 'Study references could not load.' : '',
    ].filter(Boolean).join(' '));

    L.tileLayer('https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 16,
      maxNativeZoom: 15,
      noWrap: true,
      keepBuffer: 1,
      updateWhenIdle: true,
      updateWhenZooming: false,
    }).on({
      tileerror(event) { failedTiles.add(event.tile); report(); },
      tileunload(event) { if (failedTiles.delete(event.tile)) report(); },
    }).addTo(map);

    for (const [paneName, order] of [['livermore-mesh', 430], ['livermore-boundary', 450], ['livermore-study', 465]]) {
      const pane = map.createPane(paneName);
      pane.style.zIndex = order;
      pane.style.pointerEvents = 'none';
    }
    const mesh = createMesh(L, projection, perimeter, segments);
    const scores = L.imageOverlay(assetPath + scoreAsset, imageBounds, { interactive: false, alt: '' });
    const updateMapControls = () => {
      zoomIn.disabled = map.getZoom() >= map.getMaxZoom();
      zoomOut.disabled = map.getZoom() <= map.getMinZoom();
      const meshVisible = map.getZoom() >= 13 && map.hasLayer(scores) && !scoreUnavailable;
      if (meshVisible && !map.hasLayer(mesh)) mesh.addTo(map);
      else if (!meshVisible && map.hasLayer(mesh)) mesh.remove();
    };
    scores.on('error', () => {
      scoreUnavailable = true;
      scores.remove();
      scoreLegend.hidden = true;
      scoreButton.setAttribute('aria-pressed', 'false');
      scoreButton.disabled = true;
      updateMapControls();
      report();
    }).addTo(map);
    L.geoJSON(footprint, { ...outlineOptions,
      style: { ...outlineOptions.style, color: '#14221c', weight: 5 },
    }).addTo(map);
    outline.addTo(map);

    zoomIn.addEventListener('click', () => map.zoomIn());
    zoomOut.addEventListener('click', () => map.zoomOut());
    fit.addEventListener('click', fitSearch);
    surface.addEventListener('focus', () => map.scrollWheelZoom.enable());
    surface.addEventListener('blur', () => map.scrollWheelZoom.disable());
    scoreButton.addEventListener('click', () => {
      const show = !map.hasLayer(scores);
      if (show) scores.addTo(map);
      else scores.remove();
      scoreButton.setAttribute('aria-pressed', String(show));
      scoreLegend.hidden = !show;
      updateMapControls();
    });
    let studyLayer;
    let studyLoading = false;
    studyButton.addEventListener('click', async () => {
      if (studyLoading) return;
      if (!studyLayer) {
        studyLoading = true;
        studyUnavailable = false;
        report();
        studyButton.setAttribute('aria-busy', 'true');
        try {
          studyLayer = createStudyLayer(L, await readJSON('study-reference.geojson'));
        } catch {
          studyUnavailable = true;
          report();
          return;
        } finally {
          studyLoading = false;
          studyButton.removeAttribute('aria-busy');
        }
      }
      const show = !map.hasLayer(studyLayer);
      if (show) studyLayer.addTo(map);
      else studyLayer.remove();
      studyButton.setAttribute('aria-pressed', String(show));
      studyLegend.hidden = !show;
    });
    map.on('zoomend', updateMapControls);
    updateMapControls();
  }

  createMap().catch(() => {
    surface.hidden = true;
    tools.hidden = true;
    fallback.hidden = false;
    showStatus('The interactive map could not load. The saved score layer is shown.');
  });
})();
