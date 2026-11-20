(() => {
  const mapSurface = document.querySelector('#livermore-map');
  const toolbar = document.querySelector('#livermore-tools');
  const fallback = document.querySelector('#livermore-fallback');
  const status = document.querySelector('#livermore-status');
  const reset = document.querySelector('#livermore-fit');
  const zoomIn = document.querySelector('#livermore-in');
  const zoomOut = document.querySelector('#livermore-out');
  const showScores = document.querySelector('#livermore-scores');
  const assetPath = './assets/livermore/';

  function showStatus(message) {
    status.textContent = message;
    status.hidden = !message;
  }

  async function readJSON(name) {
    const response = await fetch(assetPath + name);
    if (!response.ok) throw new Error('Replay data could not load');
    return response.json();
  }

  async function createMap() {
    const [footprint, overlay] = await Promise.all([
      readJSON('search-boundary.json'),
      readJSON('overlay-metadata.json'),
    ]);
    const L = window.L;
    if (overlay.image_crs !== 'EPSG:3857' || footprint.type !== 'Polygon') {
      throw new Error('Unexpected replay projection or footprint');
    }
    const projection = L.CRS.EPSG3857;
    const [west, south, east, north] = overlay.bounds_3857;
    const imageBounds = L.latLngBounds(
      projection.unproject(L.point(west, south)),
      projection.unproject(L.point(east, north)),
    );
    const outline = L.geoJSON(footprint, {
      pane: 'livermore-boundary',
      interactive: false,
      style: { color: '#a4f4cf', weight: 2, opacity: 1, fill: false },
    });
    const searchBounds = outline.getBounds();
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    fallback.hidden = true;
    mapSurface.hidden = false;
    toolbar.hidden = false;

    const map = L.map(mapSurface, {
      crs: projection,
      zoomControl: false,
      attributionControl: false,
      scrollWheelZoom: false,
      minZoom: 8,
      maxZoom: 17,
      zoomSnap: 0.25,
      zoomAnimation: !reducedMotion,
      fadeAnimation: !reducedMotion,
    });

    const fitSearch = () => map.fitBounds(searchBounds, { padding: [24, 24], animate: false });
    fitSearch();
    const failedTiles = new Set();
    const reportTiles = () => showStatus(failedTiles.size
      ? 'Some USGS terrain tiles could not load. The search outline and score layer are still available.'
      : '');

    L.tileLayer('https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 17,
      noWrap: true,
    }).on({
      tileerror(event) { failedTiles.add(event.tile); reportTiles(); },
      tileunload(event) { if (failedTiles.delete(event.tile)) reportTiles(); },
    }).addTo(map);

    const scores = L.imageOverlay(assetPath + overlay.asset, imageBounds, {
      interactive: false,
      alt: '',
    }).addTo(map);
    const boundaryPane = map.createPane('livermore-boundary');
    boundaryPane.style.zIndex = '450';
    boundaryPane.style.pointerEvents = 'none';
    L.geoJSON(footprint, {
      pane: 'livermore-boundary',
      interactive: false,
      style: { color: '#14221c', weight: 4, opacity: 0.85, fill: false },
    }).addTo(map);
    outline.addTo(map);

    const updateZoomButtons = () => {
      zoomIn.disabled = map.getZoom() >= map.getMaxZoom();
      zoomOut.disabled = map.getZoom() <= map.getMinZoom();
    };
    zoomIn.addEventListener('click', () => map.zoomIn());
    zoomOut.addEventListener('click', () => map.zoomOut());
    reset.addEventListener('click', fitSearch);
    showScores.addEventListener('click', () => {
      const visible = map.hasLayer(scores);
      if (visible) scores.remove();
      else scores.addTo(map);
      showScores.setAttribute('aria-pressed', String(!visible));
    });
    map.on('zoomend', updateZoomButtons);
    updateZoomButtons();
  }

  createMap().catch(() => {
    mapSurface.hidden = true;
    toolbar.hidden = true;
    fallback.hidden = false;
    showStatus('The interactive map could not load. The saved score layer is shown.');
  });
})();
