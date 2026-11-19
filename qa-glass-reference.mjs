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


const url = "https://www.ui-design.studio/post/2112257760628986188";
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });
  console.log("REF_PROBE_HTTP", response?.status(), page.url());
  if (!response?.ok()) throw Error("Public video page unavailable");
  await page.waitForFunction(() => Array.from(document.querySelectorAll("video"))
    .some(v => v.getBoundingClientRect().width > 220), null, { timeout: 10_000 });
  const videos = page.locator("video");
  const order = await videos.evaluateAll(list => list.map((v,i) => ({i,area:v.clientWidth*v.clientHeight}))
    .sort((a,b) => b.area-a.area));
  const video = videos.nth(order[0].i);
  await video.scrollIntoViewIfNeeded();
  await video.evaluate(async v => {
    v.muted = true;
    v.controls = false;
    v.style.cssText = "display:block;width:576px;height:auto;max-width:none;max-height:none;aspect-ratio:auto;object-fit:contain";
    await v.play();
    v.pause();
  });
  const metadata = await video.evaluate(v => ({
    currentSrc: v.currentSrc, duration: v.duration, original: [v.videoWidth,v.videoHeight],
    view: [v.clientWidth,v.clientHeight]
  }));
  console.log("REF_PROBE_VIDEO", JSON.stringify(metadata));
  if (!Number.isFinite(metadata.duration) || metadata.duration < 20) throw Error("Unexpected source video");
  const analyze = await browser.newPage();
  for (const offset of [-1.5,-.75,0,.75,1.5]) {
    const target = metadata.duration / 2 + offset;
    const time = await video.evaluate((v, target) => new Promise((resolve,reject) => {
      const timeout = setTimeout(() => reject(new Error("Seek timeout")), 4500);
      v.addEventListener("seeked", () => {
        clearTimeout(timeout);
        requestAnimationFrame(() => requestAnimationFrame(() => resolve(v.currentTime)));
      }, { once: true });
      v.currentTime = target;
    }), target);
    const png = await video.screenshot({ type: "png", timeout: 5500 });
    const frame = await analyze.evaluate(async ({ url, exact }) => {
      const bitmap = new Image();
      bitmap.src = url;
      await bitmap.decode();
      const create = (w,h) => Object.assign(document.createElement("canvas"), {width:w,height:h});
      const canvas = create(bitmap.width,bitmap.height);
      const g = canvas.getContext("2d");
      g.drawImage(bitmap,0,0);
      const avg = (x,y,width,height) => {
        const p = g.getImageData(x,y,width,height).data;
        const v = [0,0,0];
        for (let i=0;i<p.length;i+=4) for(let c=0;c<3;c++)v[c]+=p[i+c];
        return v.map(x=>Math.round(x/(p.length/4)));
      };
      const pixels = {
        barPanel: avg(125,257,314,37), center: avg(230,260,110,28), scene: avg(230,190,110,18),
        topRim: avg(110,252,338,2), bottomRim: avg(110,303,338,2), button: avg(445,283,10,12),
        nearBarOutside: avg(113,309,345,11)
      };
      const crop = create(416,116);
      crop.getContext("2d").drawImage(bitmap,75,223,416,116,0,0,416,116);
      return {data:(exact?canvas:crop).toDataURL("image/jpeg",.91).split(",")[1],pixels};
    }, { url:"data:image/png;base64,"+png.toString("base64"), exact:offset===0 });
    console.log("REF_PROBE_FRAME", time.toFixed(6), JSON.stringify(frame.pixels));
    outputFrame("middle-"+time.toFixed(4)+(offset===0?"-full":"-crop"),Buffer.from(frame.data,"base64"));
  }
  await analyze.close();
} finally {
  await browser.close();
}
