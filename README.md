# Khy Bolt portfolio

The public landing page uses the dark/light ASCII shark scene and one selected project. The Seattle Pothole Worklist is a runnable browser demo using a dated public-data snapshot, not a live dispatch tool or a hosted Python app. It opens a separate local page with four views for the worklist, review capacity, repair history, and sources. There are no build dependencies, remote fonts, telemetry, or runtime API requests. To preview, serve this directory from any static server.

## Credits and data

- ASCII shark renderer and schooling simulation adapted from [stackedlol/ascii-sharks](https://github.com/stackedlol/ascii-sharks), © 2026 drewdi. [MIT license](assets/site-ocean/LICENSE). Additional colors take visual inspiration from [Harsha’s clip](https://x.com/beyondV0ID/status/2112824750557032667), not from separate source code.
- Fonts: [Geist Mono, SIL Open Font License](assets/fonts/LICENSE-Geist-Mono.txt) and [Noto Mono, Apache 2.0](assets/fonts/LICENSE-Noto-Mono.txt). Their notices and license texts are included.
- [City of Seattle / Seattle DOT Pothole Status](https://catalog.data.gov/dataset/pothole-status), available through [Seattle GeoData](https://data-seattlecitygis.opendata.arcgis.com/). Snapshot as of November 18, 2026; source edited at 15:07 UTC and retrieved at 16:47 UTC. This derived demo filters public work orders, calculates review timing, ranks the pending queue, aggregates history and screening counts, and shows public street segments. It includes neither the complete source extract nor staff identifiers, exact map coordinates or civic addresses. This is independent of the City.
