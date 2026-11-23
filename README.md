# Khy Bolt portfolio

The public landing page features an ASCII shark scene, Aircraft Geolocation with Audio, and the Corner Pond screenshot gallery. Any static server can serve this directory directly. The Livermore map requests USGS terrain tiles, and the portfolio’s Ask feature uses a remote service.

- The displayed map uses pitch traces, matching flight tracks, and nominal recording start times supplied by the study. Its best fit was 144 m from the study-reported phone location. The verifier abstained. [Livermore assisted replay](https://khybolt.github.io/doppler/#livermore)
- A separate full-day search used the same recordings and historical adsb.lol tracks. Its top candidate was 321 m from the study-reported phone location, and the verifier also abstained. [Livermore adsb.lol archive search](https://khybolt.github.io/doppler/#livermore-archive)
- The synthetic fixture has a known microphone location. The Dayton replay used real audio and abstained. [Synthetic Python benchmark](https://khybolt.github.io/doppler/#evidence) and [Dayton field replay](https://khybolt.github.io/doppler/field/)

## Credits

- ASCII shark renderer and schooling simulation adapted from [stackedlol/ascii-sharks](https://github.com/stackedlol/ascii-sharks).
- Fonts: [Geist Mono, SIL Open Font License](assets/fonts/LICENSE-Geist-Mono.txt) and [Noto Mono, Apache 2.0](assets/fonts/LICENSE-Noto-Mono.txt).
