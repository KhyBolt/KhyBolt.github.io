import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve, extname, sep } from "node:path";
import { chromium } from "playwright";
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
const browser = await chromium.launch({ channel: process.env.QA_CHROME_CHANNEL || undefined });

const scenarios = [["desktop",desktop],["mobile",mobile],["small-mobile",small]];
const screenshot = png => "data:image/png;base64," + png.toString("base64");

async function open(site, viewport, light) {
  const page = await browser.newPage({
    viewport, deviceScaleFactor: 1, reducedMotion: "reduce",
    isMobile: viewport.width < 600, hasTouch: viewport.width < 600
  });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => {
    let seed = 23;
    Math.random = () => ((seed = (Math.imul(seed,1664525) + 1013904223) >>> 0) / 2**32);
  });
  await page.route("**/assets/site-ocean/reference-ocean.js*", async route => {
    const response = await route.fetch();
    const js = await response.text();
    const hook = "    engine.setPaused(document.hidden);";
    assert.ok(js.includes(hook));
    await route.fulfill({
      response,
      body:js.replace(hook,hook + "\n    window.qaOcean = { engine, kinds: KINDS };")
    });
  });
  assert.ok((await page.goto(site,{waitUntil:"load"})).ok());
  await page.waitForFunction(() => Boolean(window.qaOcean?.engine.renderer.cols));
  await page.evaluate(() => document.fonts.ready);
  await page.locator("#portfolio-question").waitFor();
  if (light) {
    await page.locator("#reference-theme").click();
    await page.waitForFunction(() => document.documentElement.dataset.referenceTheme === "light");
  }
  return {page,errors};
}

async function findPass(viewport) {
  const {page} = await open(base.url,viewport,false);
  try {
    return await page.evaluate(() => {
      const { engine: {renderer,world}, kinds } = window.qaOcean;
      const rect = document.querySelector("form").getBoundingClientRect();
      let best = {score:0};
      for (let tick = 1; tick <= 3600; tick++) {
        world.step(1/60);
        if (tick % 12 !== 0) continue;
        renderer.rasterizeSharks(world.sharks,world.time);
        const inside = new Uint16Array(kinds.length);
        const outside = new Uint16Array(kinds.length);
        for (let row = Math.floor((rect.top - 24)/renderer.ch);
             row <= Math.floor((rect.bottom + 24)/renderer.ch); row++) {
          const y = (row + .5) * renderer.ch;
          for (let col = Math.floor((rect.left + Math.min(rect.width*.46,226)) / renderer.cw);
               col <= Math.floor((rect.right - 49) / renderer.cw); col++) {
            const n = row * renderer.cols + col;
            if (!renderer.sharkFlag[n]) continue;
            if (y > rect.top + 6 && y < rect.bottom - 6) inside[renderer.sharkKind[n]]++;
            else if (y < rect.top - 4 || y > rect.bottom + 4) outside[renderer.sharkKind[n]]++;
          }
        }
        for (let i = 0; i < kinds.length; i++) {
          const score = inside[i] * Math.min(1, outside[i] / 6);
          if (score > best.score) best = {score,tick,kind:kinds[i],inside:inside[i],outside:outside[i]};
        }
      }
      return best;
    });
  } finally { await page.close(); }
}

async function proveUi(page, errors, light, revised) {
  const layout = await page.evaluate(() => {
    const metrics = selector => {
      const node = document.querySelector(selector);
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return { x:rect.x,y:rect.y,w:rect.width,h:rect.height, font:style.font,
        tracking:style.letterSpacing, color:style.color, text:node.textContent.trim() };
    };
    const form = document.querySelector("#portfolio-ask-form");
    const button = form.querySelector("button");
    const bg = getComputedStyle(form).backdropFilter;
    const input = form.querySelector("input");
    const inputStyle = getComputedStyle(input);
    const placeholder = getComputedStyle(input, "::placeholder");
    const scrim = getComputedStyle(document.querySelector(".masthead"),"::before");
    const oldScrim = getComputedStyle(document.querySelector(".portfolio-focal"),"::before");
    return {
      layout:{
        name:metrics(".portfolio-name"), headline:metrics(".portfolio-headline"),
        form:form.getBoundingClientRect().toJSON(), button:button.getBoundingClientRect().toJSON(),
        links:Array.from(document.querySelectorAll("#projects .tile-link"), link => link.getAttribute("href")),
        caption:input.placeholder,
        inputFont:inputStyle.font,
        inputColor:inputStyle.color,
        placeholderColor:placeholder.color
      },
      wide:document.documentElement.scrollWidth > innerWidth,
      light:window.qaOcean.engine.renderer.light,
      sharks:window.qaOcean.engine.world.sharks.length,
      filter:bg, scrim:scrim.backdropFilter, oldScrim:oldScrim.backdropFilter
    };
  });
  assert.deepEqual(errors,[]);
  assert.equal(layout.wide,false);
  assert.equal(layout.light,light);
  assert.equal(layout.sharks,4);
  assert.equal(layout.layout.caption,"Ask about my projects…");
  assert.deepEqual(layout.layout.links,["./doppler/","./seattle/"]);
  assert.ok(layout.layout.button.width >= 44 && layout.layout.button.height >= 44);
  if (revised) {
    assert.match(layout.filter,/blur\(3.5px\)/);
    assert.match(layout.scrim,/blur\(4px\)/);
    assert.equal(layout.oldScrim,"none");
  }
  return layout.layout;
}

async function capture(site, viewport, light, candidate, pass, label) {
  const {page,errors} = await open(site,viewport,light);
  try {
    const layout = await proveUi(page,errors,light,candidate);
    const sample = await page.evaluate(({tick,kind}) => {
      const {engine: {world,renderer}, kinds} = window.qaOcean;
      for (let i=0; i<tick; i++) world.step(1/60);
      renderer.render(world,0);
      const rect = document.querySelector("form").getBoundingClientRect();
      const left = Math.max(0,Math.floor(rect.left)-16);
      const right = Math.min(innerWidth,Math.ceil(rect.right)+16);
      const top = Math.floor(rect.top)-20;
      const bottom = Math.ceil(rect.bottom)+20;
      let hits = 0;
      for (let n = 0; n < renderer.sharkFlag.length; n++) {
        if (!renderer.sharkFlag[n] || kinds[renderer.sharkKind[n]] !== kind) continue;
        const x=(n%renderer.cols+.5)*renderer.cw, y=(Math.floor(n/renderer.cols)+.5)*renderer.ch;
        if (x>=rect.left && x<rect.right && y>=rect.top && y<rect.bottom) hits++;
      }
      return { hits,clip:{x:left,y:top,width:right-left,height:bottom-top}, local: {x:rect.left-left,y:rect.top-top,w:rect.width,h:rect.height} };
    },pass);
    if (pass.kind) assert.ok(sample.hits>=5, "Seeded shark did not reach the input");
    const crop = await page.screenshot({clip:sample.clip,type:"png"});
    const wide = label === "desktop" ? await page.screenshot({type:"jpeg",quality:72}) : null;
    let visibility;
    if (pass.kind) {
      await page.evaluate(kind => {
        const {world,renderer} = window.qaOcean.engine;
        window.qaOriginalSharks = world.sharks;
        world.sharks = world.sharks.filter(shark => shark.kind !== kind);
        renderer.render(world,0);
      },pass.kind);
      const clear = await page.screenshot({clip:sample.clip,type:"png"});
      await page.evaluate(() => {
        const { world, renderer } = window.qaOcean.engine;
        world.sharks = window.qaOriginalSharks;
        renderer.render(world,0);
      });
      visibility = await page.evaluate(async ({a,b,rect}) => {
        const pixels = async src => {
          const bitmap = new Image();
          bitmap.src = src;
          await bitmap.decode();
          const c = Object.assign(document.createElement("canvas"),{width:bitmap.width,height:bitmap.height});
          const g = c.getContext("2d");
          g.drawImage(bitmap,0,0);
          return g.getImageData(0,0,c.width,c.height);
        };
        const [p,q] = await Promise.all([pixels(a),pixels(b)]);
        let sum=0, strong=0, count=0, peak=0;
        const clearLuminance = [];
        for (let y=Math.ceil(rect.y+5); y<rect.y+rect.h-5; y++) {
          for (let x=Math.ceil(rect.x+Math.min(rect.w*.46,226)); x<rect.x+rect.w-49; x++) {
            const n = (y*p.width+x)*4;
            const delta = Math.abs(.2126*(p.data[n]-q.data[n])+.7152*(p.data[n+1]-q.data[n+1])+.0722*(p.data[n+2]-q.data[n+2]));
            sum += delta;
            clearLuminance.push(.2126*q.data[n]+.7152*q.data[n+1]+.0722*q.data[n+2]);
            count++;
            peak = Math.max(peak,delta);
            if (delta >= 8) strong++;
          }
        }
        clearLuminance.sort((a,b) => a-b);
        return {
          mean:Number((sum/count).toFixed(2)),
          strong, peak:Math.round(peak),
          calmMedian:Math.round(clearLuminance[Math.floor(clearLuminance.length/2)])
        };
      },{a:screenshot(crop), b:screenshot(clear),rect:sample.local});
    }
    if (candidate) {
      const input = page.locator("#portfolio-question");
      await input.focus();
      const form = page.locator("#portfolio-ask-form");
      assert.equal(await form.evaluate(node => getComputedStyle(node).outlineStyle),"solid");
      await page.keyboard.press("Tab");
      const button = page.getByRole("button",{name:"Ask",exact:true});
      assert.equal(await button.evaluate(node => node === document.activeElement),true);
      assert.equal(await button.evaluate(node => getComputedStyle(node).outlineStyle),"solid");
      await input.fill("Was the Doppler audio real?");
      await input.press("Enter");
      await page.getByText("The audio and aircraft tracks in the Doppler replay are simulated.",{exact:false}).first().waitFor();
      await input.fill("What is Seattle Pothole Worklist?");
      await button.click();
      await page.locator("#portfolio-answer-text")
        .filter({hasText:"Seattle Pothole Worklist is an independent browser demo"}).waitFor();
      const toggle = page.getByRole("switch");
      for (const active of [!light, light]) {
        await toggle.click();
        await page.waitForFunction(light => {
          const mode = document.documentElement.dataset.referenceTheme;
          return mode === (light ? "light" : "dark") && window.qaOcean.engine.renderer.light === light;
        }, active);
        assert.equal(await toggle.getAttribute("aria-checked"),String(active));
      }
    }
    assert.deepEqual(errors,[]);
    console.log("GLASS_QA", JSON.stringify({label,light,candidate,width:layout.form.width,height:layout.form.height,pass,sample:sample.hits,visibility}));
    return {layout,crop:screenshot(crop),wide:wide && 'data:image/jpeg;base64,' + wide.toString('base64'), visibility, local:sample.local};
  } finally { await page.close(); }
}

async function contactSheet(frames, desktopView) {
  const page = await browser.newPage();
  try {
    const data = await page.evaluate(async ({frames,desktopView}) => {
      const height = desktopView ? 624 : 324;
      const canvas = Object.assign(document.createElement("canvas"),{width:864,height});
      const g = canvas.getContext("2d");
      g.fillStyle = "#f4f5f2";
      g.fillRect(0,0,canvas.width,height);
      const panel = async (data,x,y) => {
        const bitmap = new Image();
        bitmap.src = data;
        await bitmap.decode();
        const w = 402, h = w * bitmap.height / bitmap.width;
        g.drawImage(bitmap,x,y,w,h);
      };
      const label = (line,x,y) => {
        g.font = "600 15px Arial,sans-serif";
        g.fillStyle = "#18201a";
        g.fillText(line,x,y);
      };
      label(desktopView ? "Desktop at 1440 × 900  ·  identical swim frame in each pair" :
        "Mobile at 390 × 844  ·  identical swim frame in each pair",20,29);
      const darkLabel = desktopView ? 358 : 192;
      label("Live baseline · light",20,64);
      label("Glass candidate · light",440,64);
      label("Live baseline · dark",20,darkLabel);
      label("Glass candidate · dark",440,darkLabel);
      await panel(desktopView ? frames.beforeLight.wide : frames.beforeLight.crop,20,75);
      await panel(desktopView ? frames.afterLight.wide : frames.afterLight.crop,440,75);
      await panel(desktopView ? frames.beforeDark.wide : frames.beforeDark.crop,20,darkLabel+11);
      await panel(desktopView ? frames.afterDark.wide : frames.afterDark.crop,440,darkLabel+11);
      return canvas.toDataURL("image/jpeg",.90).split(",")[1];
    },{frames,desktopView});
    const filename = desktopView ? "desktop-glass.jpg" : "mobile-glass.jpg";
    for (let i=0; i<data.length; i+=4500) {
      console.log("OWNFRAME " + filename + " " + i + " " + data.slice(i,i+4500));
    }
  } finally { await page.close(); }
}

try {
  const frames = {};
  const findings = [];
  for (const [label,viewport] of scenarios) {
    const pass = label === "small-mobile" ? {tick:0} : await findPass(viewport);
    if (label !== "small-mobile") assert.ok(pass.inside >= 5 && pass.outside >= 2);
    frames[label] = {};
    for (const light of [true,false]) {
      const theme = light ? "Light" : "Dark";
      const before = await capture(base.url,viewport,light,false,pass,label);
      const after = await capture(revised.url,viewport,light,true,pass,label);
      assert.deepEqual(after.layout,before.layout);
      if (pass.kind) {
        if (after.visibility.strong < 25 || after.visibility.peak < 12 ||
            after.visibility.mean < before.visibility.mean * .9 ||
            (light ? Math.abs(after.visibility.calmMedian - before.visibility.calmMedian) > 12 :
              after.visibility.calmMedian > Math.min(16,before.visibility.calmMedian / 2))) {
          findings.push({label,theme,before:before.visibility,after:after.visibility});
        }
      }
      frames[label]["before"+theme] = before;
      frames[label]["after"+theme] = after;
    }
  }
  await contactSheet(frames.desktop,true);
  await contactSheet(frames.mobile,false);
  assert.deepEqual(findings, [], "Keep the shark visible and bring dark glass closer to the backing");
} finally {
  await browser.close();
  base.host.close();
  revised.host.close();
}
