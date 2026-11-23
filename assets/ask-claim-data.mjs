const base = "https://khybolt.github.io/";

export const sources = Object.freeze({
  projects: Object.freeze({ label: "Featured projects", url: base + "#projects" }),
  replay: Object.freeze({ label: "Synthetic benchmark evidence", url: base + "doppler/#evidence" }),
  search: Object.freeze({ label: "Synthetic search results", url: base + "doppler/#search" }),
  livermore: Object.freeze({ label: "Livermore assisted replay", url: base + "doppler/#livermore" }),
  livermoreArchive: Object.freeze({ label: "Livermore adsb.lol archive search", url: base + "doppler/#livermore-archive" }),
  field: Object.freeze({ label: "Dayton field replay", url: base + "doppler/field/" }),
  fieldResult: Object.freeze({ label: "Field replay result", url: base + "doppler/field/#result" }),
});

function claim(topic, text, ...sourceIds) {
  return Object.freeze({ topic, text, sourceIds: Object.freeze(sourceIds) });
}

// Public launch option. Review each record before using it with a provider.
export const evidence = Object.freeze({
  about: claim("projects", "The featured projects are Aircraft Geolocation with Audio and Corner Pond.", "projects"),
  "pond-gallery": claim("pond", "Corner Pond is an idle fishing game marked Coming soon. Its gallery shows five screenshots, including the title screen.", "projects"),
  "d-method": claim("doppler", "The synthetic experiment estimates a microphone position by finding two sustained falling tones and comparing them with predictions from simulated flight tracks.", "replay"),
  "d-inputs": claim("doppler", "The portfolio map shows an assisted Livermore replay fit to pitch traces and matching flight tracks supplied with a study of two real recordings. It cannot process a new recording or look up aircraft.", "livermore"),
  "d-result": claim("doppler", "The estimate was 14.2 m from the known microphone position in this saved synthetic fixture. A deliberately constructed equivalent-track case produced a wrong result.", "search", "replay"),
  "d-clock": claim("doppler", "The synthetic search allows one shared offset between the audio and track clocks.", "replay"),
  "d-run": claim("doppler", "The linked Python project documents how to rerun the synthetic benchmark with Python 3.12 and the three supplied example files.", "replay"),
  "d-livermore-assisted": claim("doppler", "The displayed assisted Livermore replay used the study’s pitch traces, matching flight tracks, and nominal start times. The best fit was 144 m from the study-reported phone location, but the verifier abstained.", "livermore"),
  "d-livermore-archive": claim("doppler", "A separate full-day adsb.lol search used the same recordings without supplied track matches. Its top candidate was 321 m from the study-reported phone location, but the verifier abstained. This run is not shown on the portfolio map.", "livermoreArchive"),
  "f-outcome": claim("field", "In the real Dayton field recording, the solver abstained and reported no microphone location.", "fieldResult"),
  "f-data": claim("field", "The field replay used an Eclipse Soundscapes recording from Dayton, Ohio, and historical ADS-B trajectories.", "field"),
  "f-checks": claim("field", "The registered five-minute field clip yielded one usable pitch ridge. The fit passed only half of the withheld audio blocks, and the solver abstained.", "fieldResult"),
  "f-diagnostic": claim("field", "In the registered field clip, the lowest-residual candidate was 395 m from the published station. That distance is diagnostic only. The solver abstained.", "fieldResult"),
});
