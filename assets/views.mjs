function moveViews(departing, arriving, direction) {
  const groups = panel => panel.querySelectorAll(".masthead, .portfolio-ask form, .ask-answer:not([hidden]), .ask-transcript:not([hidden]), .project-tile");
  const drift = value => "translateX(" + direction * value + "px)";
  const animations = [];
  for (const group of groups(departing)) {
    animations.push(group.animate([
      { opacity: 1, transform: drift(0) },
      { opacity: 0, transform: drift(-24) }
    ], { duration: 140, easing: "cubic-bezier(.4,0,.45,1)", fill: "both" }));
  }
  for (const [index,group] of [...groups(arriving)].entries()) {
    animations.push(group.animate([
      { opacity: 0, transform: drift(26) },
      { opacity: 1, transform: drift(0) }
    ], { delay: 142 + index*23, duration: 235, easing: "cubic-bezier(.2,.75,.26,1)", fill: "both" }));
  }
  const ripple = document.createElement("span");
  ripple.className = "portfolio-wake";
  ripple.setAttribute("aria-hidden", "true");
  stage.append(ripple);
  const travel = stage.clientWidth;
  const bend = x => "translateX(" + x + "px) scaleX(" + direction + ")";
  animations.push(ripple.animate([
    { opacity: 0, transform: bend(direction === 1 ? travel - 40 : -40) },
    { opacity: .54, offset: .38 },
    { opacity: .36, offset: .64 },
    { opacity: 0, transform: bend(direction === 1 ? -50 : travel - 35) }
  ], { duration: 425, easing: "cubic-bezier(.28,.48,.48,1)", fill: "both" }));
  return { animations, ripple };
}

const stage = document.querySelector(".portfolio-views");
const panels = { ask: document.getElementById("ask"), projects: document.getElementById("projects") };
const askTranscript = panels.ask.querySelector(".ask-transcript");
const links = document.querySelectorAll(".portfolio-nav [data-portfolio-link]");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const scrollPositions = { ask: 0, projects: 0 };
let transcriptPosition = 0;
let active;
let transition;

const route = hash => hash === "#projects" ? "projects" : "ask";

function finishTransition() {
  if (!transition) return;
  const { departing, animations, ripple } = transition;
  transition = undefined;
  departing.hidden = true;
  departing.classList.remove("is-departing");
  departing.style.removeProperty("--departure-top");
  for (const animation of animations) animation.cancel();
  ripple?.remove();
}

function activate(next, { animate = false, restoreScroll = false, focus = true } = {}) {
  if (active === next) return;
  finishTransition();
  const departing = panels[active];
  const arriving = panels[next];
  const departingTop = departing?.getBoundingClientRect().top;
  const moving = departing && animate && !reducedMotion.matches && typeof arriving.animate === "function";
  if (departing) {
    scrollPositions[active] = window.scrollY;
    if (active === "ask" && !askTranscript.hidden) transcriptPosition = askTranscript.scrollTop;
    departing.inert = true;
    departing.hidden = !moving;
    if (moving) departing.classList.add("is-departing");
  }
  arriving.hidden = false;
  arriving.inert = false;
  active = next;
  for (const link of links) link.hidden = route(link.hash) === next;
  window.scrollTo(0, restoreScroll ? scrollPositions[next] : 0);
  if (next === "ask" && !askTranscript.hidden) askTranscript.scrollTop = transcriptPosition;

  if (moving) {
    const offset = departingTop - stage.getBoundingClientRect().top;
    departing.style.setProperty("--departure-top", offset + "px");
    const swap = { departing, ...moveViews(departing, arriving, next === "projects" ? 1 : -1) };
    transition = swap;
    Promise.allSettled(swap.animations.map(animation => animation.finished)).then(() => {
      if (transition === swap) finishTransition();
    });
  }
  if (focus) arriving.querySelector(".portfolio-headline").focus({ preventScroll: true });
}

function onHistory() {
  activate(route(location.hash), { animate: true, restoreScroll: true });
}

function initialize() {
  const initial = route(location.hash);
  for (const [name,panel] of Object.entries(panels)) {
    panel.hidden = panel.inert = name !== initial;
  }
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  activate(initial, { focus: initial === "projects" });

  document.addEventListener("click", event => {
    const link = event.target.closest("a[data-portfolio-link]");
    if (!link || event.defaultPrevented || event.button !== 0 ||
        event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const next = route(link.hash);
    if (location.hash !== link.hash) history.pushState(null, "", link.hash);
    if (next === active) panels[next].querySelector(".portfolio-headline").focus({ preventScroll: true });
    else activate(next, { animate: true });
  });
  window.addEventListener("popstate", onHistory);
  window.addEventListener("hashchange", onHistory);
  reducedMotion.addEventListener("change", event => {
    if (event.matches) finishTransition();
  });
}

initialize();
