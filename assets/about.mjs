const trigger = document.getElementById("site-about-trigger");
const dialog = document.getElementById("site-about");
const ask = document.getElementById("ask");
const close = dialog.querySelector(".site-about-close");
const copy = dialog.querySelector(".site-about-copy");
const composer = ask.querySelector(".ask-composer");
const narrow = matchMedia("(max-width: 760px)");
const viewport = window.visualViewport;
const theme = document.getElementById("reference-theme");
const onAsk = () => !ask.hidden && !ask.inert;
const available = () => onAsk() && !trigger.hasAttribute("data-about-obscured");

function obstructed() {
  if (!onAsk() || !narrow.matches || !ask.hasAttribute("data-conversation")) return false;
  const button = trigger.getBoundingClientRect();
  const input = composer.getBoundingClientRect();
  const left = viewport?.offsetLeft ?? 0;
  const top = viewport?.offsetTop ?? 0;
  const right = left + (viewport?.width ?? window.innerWidth);
  const bottom = top + (viewport?.height ?? window.innerHeight);

  return button.left < left || button.top < top || button.right > right || button.bottom > bottom ||
    (button.left < input.right && button.right > input.left &&
      button.top < input.bottom && button.bottom > input.top);
}

if (typeof dialog.showModal === "function") {
  let pressedOutside = false;
  const outside = event => {
    if (event.target !== dialog) return false;
    const { left, right, top, bottom } = dialog.getBoundingClientRect();
    return event.clientX < left || event.clientX >= right ||
      event.clientY < top || event.clientY >= bottom;
  };

  trigger.hidden = false;
  trigger.addEventListener("click", () => {
    if (!available() || dialog.open) return;
    dialog.showModal();
    copy.scrollTop = 0;
    trigger.setAttribute("aria-expanded", "true");
  });
  close.addEventListener("click", () => dialog.close());

  dialog.addEventListener("pointerdown", event => {
    pressedOutside = event.isPrimary && event.button === 0 && outside(event);
  });
  dialog.addEventListener("pointercancel", () => { pressedOutside = false; });
  dialog.addEventListener("click", event => {
    if (pressedOutside && event.detail > 0 && outside(event)) dialog.close();
    pressedOutside = false;
  });
  dialog.addEventListener("close", () => {
    pressedOutside = false;
    trigger.setAttribute("aria-expanded", "false");
    if (available()) {
      trigger.focus({ preventScroll: true });
    } else if (dialog.contains(document.activeElement) ||
               document.activeElement === trigger || document.activeElement === document.body) {
      theme.focus({ preventScroll: true });
    }
  });

  let update = 0;
  function syncAvailability() {
    update = 0;
    const hadFocus = document.activeElement === trigger;
    trigger.toggleAttribute("data-about-obscured", obstructed());
    if (available()) return;
    if (dialog.open) dialog.close();
    if (hadFocus) theme.focus({ preventScroll: true });
  }

  function scheduleSync() {
    if (!update) update = requestAnimationFrame(syncAvailability);
  }

  new MutationObserver(scheduleSync).observe(ask, { attributeFilter: ["hidden", "inert", "data-conversation"] });
  if ("ResizeObserver" in window) new ResizeObserver(scheduleSync).observe(composer);
  window.addEventListener("resize", scheduleSync);
  viewport?.addEventListener("resize", scheduleSync);
  viewport?.addEventListener("scroll", scheduleSync);
  syncAvailability();
}
