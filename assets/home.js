(() => {
  "use strict";
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const button = document.getElementById("motion-control");
  const label = document.getElementById("motion-label");
  const ART = document.getElementById("title-art");
  let paused = false, frame = 0, last = 0, elapsed = 0, timeBase = 0;
  const glyphs = {
    K:["1100011","1100110","1101100","1111000","1101100","1100110","1100011"],
    H:["1100011","1100011","1100011","1111111","1100011","1100011","1100011"],
    Y:["1100011","1100011","0110110","0011100","0001000","0001000","0001000"],
    B:["1111110","1100011","1100011","1111110","1100011","1100011","1111110"],
    O:["0111110","1100011","1100011","1100011","1100011","1100011","0111110"],
    L:["1100000","1100000","1100000","1100000","1100000","1100000","1111111"],
    T:["1111111","0001000","0001000","0001000","0001000","0001000","0001000"]
  };
  const chars = "KHY BOLT";
  const xMul = 3, yMul = 2;
  const cells = [];
  let cols = 0;
  for (const char of chars) {
    if (char === " ") { cols += 4*xMul; continue; }
    for (let y=0; y<7; y++) for(let x=0; x<7; x++) if(glyphs[char][y][x] === "1") {
      for(let sy=0; sy<yMul; sy++) for(let sx=0; sx<xMul; sx++) cells.push([cols+x*xMul+sx,y*yMul+sy]);
    }
    cols += (7+1)*xMul;
  }
  cols -= xMul;
  const colors = ["#5f9a8d","#73af9c","#9acbbb","#bbebd8","#defced","#fbfff5"];
  const signs = "·:;+*ox$#%@";
  const ctx = ART?.getContext("2d");
  let artW=0, artH=0, dpr=1;
  const frozen = () => paused || motion.matches;
  function hash(x,y,k) {
    let n=Math.imul(x+389,374761393)^Math.imul(y+17,668265263)^Math.imul(k+20,69069);
    n=Math.imul(n^(n>>>13),1274126177);
    return ((n^(n>>>16))>>>0)/4294967296;
  }
  function paint(t) {
    if (!ctx || !artW || !artH) return;
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,artW,artH);
    const sx = artW*.967/cols, sy = artH*.855/(7*yMul);
    const x0 = artW*.0165, y0 = artH*.078;
    const epoch = Math.floor(t*.78), phase = (t*.215 + .18) % 1;
    const mobile = artW<585;
    const useMesh = !mobile;
    const size = Math.max(5,Math.min(sx*1.54,sy*.95));
    ctx.font = size + "px Instrument,monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const [x,y] of cells) {
      const px = x0+(x+.5)*sx;
      const py = y0+(y+.50)*sy;
      const staticN = hash(x,y,7);
      const sweep = Math.max(0,1- Math.abs(x/cols-phase)*12);
      const drift = Math.sin(x*.11 + y*.76 - t*.7)*.10;
      const v = Math.max(0,Math.min(.995, .47 + (staticN-.5)*.41 + drift + sweep*.22));
      const pattern = hash(x,y, (x+y)%3 ? (epoch+Math.floor(x/12)) : 7);
      ctx.fillStyle = colors[Math.floor(v*colors.length)];
      if (useMesh && staticN>.23) {
        ctx.globalAlpha=.56+(v*.3);
        ctx.fillRect(px-sx*.4,py+sy*.271,sx*.80,sy*.163);
        ctx.globalAlpha=1;
      }
      if (mobile) {
        if (staticN>.105) ctx.fillRect(px-sx*.44,py-sy*.356,sx*.88,sy*.708);
        if (staticN>.64) {
          ctx.fillStyle=colors[Math.min(5,Math.floor(v*colors.length)+1)];
          ctx.fillText(signs[Math.floor(pattern*signs.length)],px,py);
        }
      } else {
        const sign = signs[Math.min(signs.length-1,Math.floor((.22+.55*v+.20*pattern)*signs.length))];
        ctx.fillText(sign,px,py);
      }
    }
  }
  function resize() {
    if (!ctx) return;
    const r = ART.getBoundingClientRect();
    if (Math.abs(r.width-artW)<.2 && Math.abs(r.height-artH)<.2) return;
    artW=r.width;artH=r.height;dpr=Math.min(devicePixelRatio||1,2);
    ART.width=Math.round(artW*dpr);ART.height=Math.round(artH*dpr);
    paint(elapsed);
    if(artW && artH) document.body.classList.add("has-title");
  }
  function draw(now) {
    if (frozen() || document.hidden) return;
    if (now-last>64) { last=now; elapsed=(now-timeBase)/1000; paint(elapsed); }
    frame=requestAnimationFrame(draw);
  }
  function state() {
    cancelAnimationFrame(frame);
    const reduced=motion.matches;
    if (button) {
      button.dataset.paused=String(paused);
      button.dataset.reduced=String(reduced);
      button.disabled=reduced;
      label.textContent=reduced ? "Reduced motion active" : paused ? "Resume motion" : "Pause motion";
      button.title=label.textContent;
      button.hidden=false;
    }
    if(!reduced && !paused && !document.hidden) {
      timeBase=performance.now()-elapsed*1000;
      frame=requestAnimationFrame(draw);
    } else paint(elapsed);
    window.dispatchEvent(new CustomEvent("portfolio-motion",{detail:{paused}}));
  }
  if(ctx && typeof ResizeObserver!=="undefined"){
    const ro=new ResizeObserver(resize);ro.observe(ART);
    resize();
    document.fonts.ready.then(()=>paint(elapsed));
  }
  button?.addEventListener("click",()=>{paused=!paused;state();});
  motion.addEventListener("change",state);
  document.addEventListener("visibilitychange",state);
  state();
  for (const tile of document.querySelectorAll("[data-tile]")) {
    const frames = [...tile.querySelectorAll("img[data-frame]")];
    const step = tile.querySelector(".frame-step");
    if (!step || frames.length < 2) continue;
    let current=0, expected=0, generation=0, pointer=false, focus=false, timer=0;
    const stepTitle=step.getAttribute("aria-label");
    const set = (next,manual=false) => {
      expected=(next+frames.length)%frames.length;
      const ticket=++generation, entry=frames[expected];
      entry.loading="eager";
      const show = () => {
        if (ticket!==generation || !entry.naturalWidth) return;
        current=expected;
        frames.forEach((picture,i)=> {picture.hidden=i!==current;});
        const count=String(current+1).padStart(2,"0")+" / "+String(frames.length).padStart(2,"0");
        step.querySelector("span").textContent=count;
        if(manual) step.setAttribute("aria-label",stepTitle+". Frame "+(current+1)+" of "+frames.length+".");
      };
      if (entry.complete && entry.naturalWidth) show(); else entry.decode().then(show,()=>{});
    };
    const resetTimer=()=> {
      clearInterval(timer);
      if (!frozen() && !document.hidden && (pointer || focus)) {
        frames.forEach(img => { img.loading="eager"; });
        timer=setInterval(()=>set(current+1),1620);
      }
    };
    tile.addEventListener("pointerenter",e=>{if(e.pointerType!=="touch") {pointer=true;resetTimer();}});
    tile.addEventListener("pointerleave",()=>{pointer=false;resetTimer();if(!focus)set(0);});
    tile.addEventListener("focusin",e=>{focus=e.target.matches(".tile-link");resetTimer();});
    tile.addEventListener("focusout",e=>{if (!tile.contains(e.relatedTarget)) { focus=false;resetTimer();if(!pointer)set(0); }});
    tile.addEventListener("keydown",e=> {
      if (e.key==="ArrowLeft" || e.key==="ArrowRight") {
        e.preventDefault();
        set(expected+(e.key==="ArrowRight"?1:-1),true);resetTimer();
      }
    });
    step.addEventListener("click",e=>{e.stopPropagation();set(expected+1,true);resetTimer();});
    window.addEventListener("portfolio-motion",resetTimer);
    step.hidden=false;
  }
})();
