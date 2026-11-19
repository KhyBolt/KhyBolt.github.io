import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import { join, resolve, extname, sep } from "node:path";
import { chromium } from "playwright";

const out = resolve("qa-screenshots");
await mkdir(out, { recursive: true });
const desktop = { width: 1440, height: 900 };
const mobile = { width: 390, height: 844 };
const small = { width: 320, height: 568 };
const mime = { ".html":"text/html", ".js":"text/javascript", ".mjs":"text/javascript", ".css":"text/css", ".webp":"image/webp", ".ttf":"font/ttf", ".svg":"image/svg+xml" };
function staticServer(root) {
  const host = createServer(async (req, res) => {
    try {
      let path = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
      if (path.endsWith("/")) path += "index.html";
      const absolute = resolve(root, "." + path);
      if (!absolute.startsWith(root + sep)) throw new Error("Invalid path");
      const bytes = await readFile(absolute);
      res.writeHead(200, { "Content-Type": mime[extname(absolute)] || "application/octet-stream" });
      res.end(bytes);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  return new Promise(resolve => {
    host.listen(0, "127.0.0.1", () => resolve({ host, url: "http://127.0.0.1:" + host.address().port + "/" }));
  });
}
const base = await staticServer(resolve(process.env.RUNNER_TEMP, "baseline"));
const revised = await staticServer(process.cwd());
const browser = await chromium.launch();
const fail = [];

async function check(site, version, label, viewport, light = false) {
  const page = await browser.newPage({
    viewport, deviceScaleFactor: 1, reducedMotion: "reduce",
    isMobile: label !== "desktop", hasTouch: label !== "desktop"
  });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.addInitScript(() => {
    let seed = 23;
    Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2**32);
  });
  await page.route("**/assets/site-ocean/reference-ocean.js*", async route => {
    const response = await route.fetch();
    const js = await response.text();
    const hook = "    engine.setPaused(document.hidden);";
    assert.ok(js.includes(hook));
    await route.fulfill({
      response,
      body: js.replace(hook, hook + "\n    window.qaOcean = { engine, kinds: KINDS };")
    });
  });
  const response = await page.goto(site, { waitUntil: "load" });
  assert.equal(response.status(), 200);
  await page.waitForFunction(() => Boolean(window.qaOcean));
  await page.evaluate(() => document.fonts.ready);
  await page.locator("#portfolio-question").waitFor({ state: "visible" });
  if (light) {
    await page.locator("#reference-theme").click();
    await page.waitForFunction(() => document.documentElement.dataset.referenceTheme === "light");
  }
  const tone = light ? "light" : "dark";
  const filename = version + "-" + label + "-" + tone + ".jpg";
  const screen = await page.screenshot({ path: join(out, filename), type: "jpeg", quality: 60 });
  if (!light && label !== "small-mobile") {
    const b64 = screen.toString("base64");
    for (let index = 0; index < b64.length; index += 6000) {
      console.log("QAIMAGE " + filename + " " + index + " " + b64.slice(index, index + 6000));
    }
  }
  const metrics = await page.evaluate(() => {
    const { engine, kinds } = window.qaOcean;
    const rect = node => node.getBoundingClientRect().toJSON();
    const r = engine.renderer;
    const head = engine.world.sharks.find(shark => shark.kind === "greathammer");
    const foreground = Array.from(document.querySelectorAll(".tile-frame, #portfolio-ask-form"), rect);
    const picture = document.getElementById("title-art");
    const title = rect(picture);
    const titlePixels = picture.getContext("2d").getImageData(0, 0, picture.width, picture.height).data;
    const titleCovers = (x, y) => {
      if (x < title.left || x >= title.right || y < title.top || y >= title.bottom) return false;
      const px = Math.floor((x - title.left) / title.width * picture.width);
      const py = Math.floor((y - title.top) / title.height * picture.height);
      return titlePixels[(py * picture.width + px) * 4 + 3] > 100;
    };
    let face = 0, clear = 0, left = 0, right = 0;
    for (let n = 0; n < r.sharkFlag.length; n++) {
      if (!r.sharkFlag[n] || r.sharkKind[n] !== kinds.indexOf("greathammer")) continue;
      const x = (n % r.cols + .5) * r.cw;
      const y = (Math.floor(n / r.cols) + .5) * r.ch;
      const dx = x - head.nodes[0], dy = y - head.nodes[1];
      const s = Math.sin(head.heading), c = Math.cos(head.heading);
      const along = -(dx * c + dy * s), across = dy * c - dx * s;
      if (along > head.length * .122 || Math.abs(across) < head.length * .085) continue;
      face++;
      if (foreground.some(el => x >= el.left && x <= el.right && y >= el.top && y <= el.bottom)
          || titleCovers(x, y)) continue;
      clear++;
      if (across < 0) left++;
      else right++;
    }
    return {
      viewport:[innerWidth, innerHeight],
      theme:r.light,
      length:head.length,
      sharks:engine.world.sharks.length,
      face, clear, left, right,
      links:Array.from(document.querySelectorAll("#projects .tile-link"), a => a.getAttribute("href")),
      sidewaysScroll:document.documentElement.scrollWidth > innerWidth,
      formHeight:document.getElementById("portfolio-ask-form").getBoundingClientRect().height
    };
  });
  console.log("QAMETRIC " + JSON.stringify({version,label,tone,...metrics}));
  const question = page.locator("#portfolio-question");
  await question.fill("Was the Doppler audio real?");
  await question.press("Enter");
  await page.getByText("The audio and aircraft tracks in the Doppler replay are simulated.", { exact: false }).first().waitFor();
  assert.deepEqual(errors, []);
  assert.equal(metrics.sharks, 4);
  assert.equal(metrics.theme, light);
  assert.equal(metrics.sidewaysScroll, false);
  assert.ok(metrics.formHeight >= 44);
  assert.deepEqual(metrics.links, ["./doppler/", "./seattle/"]);
  if (version === "after") {
    assert.ok(metrics.clear / metrics.face >= .7, "Foreground blocks more than 30% of the hammerhead");
    assert.ok(Math.min(metrics.left, metrics.right) >= 8, "Both hammerhead lobes must be visible");
  }
  await page.close();
}

try {
  for (const [label, viewport] of [["desktop",desktop],["mobile",mobile],["small-mobile",small]]) {
    for (const [version, site, light] of [["before",base.url,false],["after",revised.url,false],["after",revised.url,true]]) {
      try { await check(site, version, label, viewport, light); }
      catch (error) { fail.push(version + "/" + label + "/" + light + ": " + error.message); }
    }
  }
  assert.deepEqual(fail, []);
} finally {
  await browser.close();
  base.host.close();
  revised.host.close();
}
