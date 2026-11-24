# Livermore full-day adsb.lol-only score overlay

This receipt documents the saved full-day search over adsb.lol historical tracks. Pitch was extracted automatically from the two study WAVs, without using the study's hand-guided traces.

This is the earlier run, not the replay shown in the current Livermore map.

The saved run ranked the matching pair **first among 17,101 candidate pairs**. Its top diagnostic candidate was 320.62 m from the study-reported phone location; no candidate passed verification. The overlay shows training loss at 121 coarse nodes, not the refined candidate or a confidence region.

| Replay arm | Original ordered-pair rank | Leading diagnostic distance | Held-out blocks by pass | Acoustic survivors |
| --- | ---: | ---: | --- | ---: |
| 17 May, original audio | 1 / 17,101 | 320.619 m | 3/3 and 1/4 | 0 |
| 17 May, swapped slots | 1,230 / 17,170 | 5,701.072 m | 1/4 and 2/3 | 0 |
| 18 May, wrong UTC day | Absent from 9,252 | 3,992.016 m | 2/3 and 1/4 | 0 |

Each arm completed 24 of 24 shards. All arms abstained. The 320.62 m distance compares one estimate with the author’s reported phone position, whose independent survey uncertainty has not been established.

## Map integration

Use the PNG as an EPSG:3857 image overlay. For MapLibre, set the image source coordinates to `image_corners_wgs84_lon_lat` from `overlay-metadata.json`, in the given northwest, northeast, southeast, southwest order. Use nearest-neighbor raster resampling if available. This is an 11 × 11, 1 km-spaced lattice. Each pixel inherits the nearest measured node’s color bin and is transparent outside the search boundary or at no-data nodes. The current layer has 121 finite nodes and zero missing. The 768 px image resolution describes the rendering.

Legend label **Minimum training frequency MSE (Hz²)**. Darker cells have a lower training loss. The six color bins are specified in the JSON. The layer shows coarse training agreement. It carries no geographic estimate pin, aircraft lines, or held-out confidence.

## Attribution and source access

Display this notice next to the map. Include both links in the public overlay attribution.

> Contains information from adsb.lol historical data, available under the Open Database License (ODbL 1.0).

[adsb.lol historical data](https://www.adsb.lol/docs/open-data/historical) · [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/) · [Public indexed access and source terms](https://github.com/ClickHouse/adsb.exposed#data-source)

Credit the public research audio to Praveen Pathak, *Aeroplane data full analysis and raw files*, v2, CC BY 4.0. The original waveform and recorder reference stay in the research release. [Zenodo v2](https://doi.org/10.5281/zenodo.24075029) · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)

The PNG is the rendered Produced Work. It bins scores into six colors. Under ODbL §4.3 the attribution travels with the work. The bundled machine-readable archive query and catalogue-alteration method lets recipients regenerate the inputs from the ODbL source if §4.6 applies. Keep this recipe linked with the overlay. The handoff contains no underlying positions, waveform, aircraft identifiers, reference coordinates, or fitted point.

## Verify the inputs

The [input verification guide](https://github.com/KhyBolt/aircraft-doppler/blob/main/benchmarks/livermore-inputs.md) covers the original WAVs and the archive manifest. The bundled archive query also verifies the adsb.lol provider tag and reports aggregate counts and digests.

~~~sh
python3.12 archive-query.py --date 2026-05-17 --hour 22
python3.12 archive-query.py --date 2026-05-17 --hour 22 --check
~~~

Check hours 0 through 23 of 17 and 18 May 2026 against the content-only manifest digests in the JSON. The manifest hash is SHA-256 of the compact JSON array of `[hour, raw_row_count, canonical_scoring_rows_sha256]` entries in hour order. Each row hash covers a compact JSON array of the original selected fields in query order after removal of the verified provider tag. The archive is indexed and can change. A changed manifest is a new input.

The two study WAVs are identified by their published starts and SHA-256 digests in the JSON. Both are 48 kHz mono and their start gap is 1,027.242 s. The search was given the UTC date, the clip-start gap and the airport-centered search area, but not the supplied flight matches, pitch traces or absolute clip starts. The phone location was used after scoring for the diagnostic distance.

The receipt and rendering metadata document the run. The exact archive-search solver and invocation are not publicly rerunnable from these files.
