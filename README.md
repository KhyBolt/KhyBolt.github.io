# Khy Bolt portfolio

The portfolio has an ASCII shark scene, an Ask view, and a Projects view with Aircraft Geolocation with Audio and Corner Pond. The site respects the system’s reduced-motion setting.

## Local preview

Serve this directory from a static server, for example `python -m http.server 8000 --bind 127.0.0.1`, and open `http://127.0.0.1:8000/`. The Livermore map uses USGS terrain tiles.

On localhost, Ask uses local project answers unless the form points to a same-origin `/ask` handler. On the public site, Ask may send the question and recent turns to a remote service. Don’t include private information.

## Aircraft geolocation

- [Livermore case study](doppler/#livermore).
- [Source repository and usage guide](https://github.com/KhyBolt/aircraft-doppler#analyze-a-local-recording).

## Credits

- ASCII shark renderer and schooling simulation adapted from [stackedlol/ascii-sharks](https://github.com/stackedlol/ascii-sharks).
- Fonts: [Geist Mono, SIL Open Font License](assets/fonts/LICENSE-Geist-Mono.txt) and [Noto Mono, Apache 2.0](assets/fonts/LICENSE-Noto-Mono.txt).
