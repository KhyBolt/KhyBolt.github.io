import { createPublicKey, constants, publicEncrypt, randomBytes } from "node:crypto";
import { chromium } from "playwright";

const pub = createPublicKey({ key: { kty: "RSA", n: Buffer.from("d12ad543e9d1cfb976890a4c33b8095bd6f5819d3d83727d91f4394337e8ac7bc1ba59a880903c0c9bfa249e5dd269ed3d18c7135a4a272cb65a1d4ac616ba204e02ee75a35330d8a86ffd070a2b5499dc4996c86e2f667b6ec394abc25d1dd14ebf11ed59dcc83b46afb3a58b8817a13d0f8280b368346b6638795d93b6963f", "hex").toString("base64url"), e: "AQAB" }, format: "jwk" });
function outputFrame(name, buffer) {
  // Keep the reference pixels out of public logs and artifacts.
  const output = [];
  for (let i = 0; i < buffer.length; i += 79) {
    const clear = Buffer.alloc(128);
    randomBytes(48).copy(clear, 1);
    buffer.copy(clear, 49, i, i + 79);
    output.push(publicEncrypt({ key: pub, padding: constants.RSA_NO_PADDING }, clear));
  }
  const encoded = Buffer.concat(output).toString("base64");
  for (let offset = 0; offset < encoded.length; offset += 4500) {
    console.log("ENCFRAME " + name + " " + buffer.length + " " + offset + " " + encoded.slice(offset, offset + 4500));
  }
}

const ref = {
  "stacked-x": "https://x.com/stackedlol/status/2112257760628986188/video/1",
  "harsha-x": "https://x.com/beyondV0ID/status/2112824750557032667",
  "stacked-public-player": "https://www.ui-design.studio/post/2112257760628986188"
};
const browser = await chromium.launch();
try {
  for (const [name, url] of Object.entries(ref)) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    try {
      const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 14_000 });
      console.log("REFSTATUS", name, response?.status());
      if (!response?.ok()) continue;
      await page.waitForFunction(() => Array.from(document.querySelectorAll("video"))
        .some(v => v.getBoundingClientRect().width > 220), null, { timeout: 8_000 });
      const options = page.locator("video");
      const order = await options.evaluateAll(list => list.map((v,i) => ({i,area:v.clientWidth*v.clientHeight}))
        .sort((a,b) => b.area-a.area));
      if (!order.length) continue;
      const video = options.nth(order[0].i);
      await video.scrollIntoViewIfNeeded();
      await video.evaluate(async v => { v.muted = true; await v.play(); });
      const duration = await video.evaluate(v => v.duration);
      if (!Number.isFinite(duration) || duration < 1) continue;
      console.log("REFVIDEO", name, duration);
      for (const fraction of [.08,.37,.68,.88]) {
        await video.evaluate((v,target) => new Promise((resolve,reject) => {
          v.pause();
          const timeout = setTimeout(() => reject(new Error("Frame unavailable")), 3000);
          v.addEventListener("seeked", () => {
            clearTimeout(timeout);
            requestAnimationFrame(() => requestAnimationFrame(resolve));
          }, { once: true });
          v.currentTime = target;
        }), duration * fraction);
        await video.evaluate(v => {
          v.style.cssText = "display:block; width:576px; height:auto; max-width:none; max-height:none; aspect-ratio:auto; object-fit:contain;";
        });
        const screenshot = await video.screenshot({ type:"jpeg", quality:45, timeout:5500 });
        outputFrame(name + "-" + Math.round(duration * fraction * 10), screenshot);
      }
    } catch (error) {
      console.log("REFERROR", name, error.message.split("\n")[0]);
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
}
