import { readFile } from "node:fs/promises";
const paths = [
  ["index.html", ""],
  ["assets/ask.css", "assets/ask.css?v=glass1"],
  ["assets/home.js", "assets/home.js?v=focal1"],
  ["assets/site-ocean/reference-ocean.js", "assets/site-ocean/reference-ocean.js?v=shark-size-2"]
];
const target = new URL("https://khybolt.github.io/");
const expected = await Promise.all(paths.map(([path]) => readFile(path,"utf8")));
let passed = false;
for (let attempt = 0; attempt < 65; attempt++) {
  try {
    const results = await Promise.all(paths.map(async ([, suffix], index) => {
      const url = new URL(suffix, target);
      url.searchParams.set("verify", String(Date.now()));
      const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
      return response.ok && await response.text() === expected[index];
    }));
    if (results.every(Boolean)) {
      console.log("LIVE_STATICS_MATCH", paths.map(([name]) => name).join(" "));
      passed = true;
      break;
    }
  } catch (err) {
    if (attempt % 10 === 0) console.log("Waiting for the public Pages response", err.name);
  }
  if (attempt % 10 === 0) console.log("Waiting for the new Pages assets");
  await new Promise(resolve => setTimeout(resolve,4_000));
}
if (!passed) process.exitCode = 1;
