const trigger = document.getElementById("site-about-trigger");
const dialog = document.getElementById("site-about");
const ask = document.getElementById("ask");
const close = dialog.querySelector(".site-about-close");
const copy = dialog.querySelector(".site-about-copy");
const idle = () => ask.matches(":not([hidden], [inert], [data-conversation])");

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
    if (!idle() || dialog.open) return;
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
    if (idle()) {
      trigger.focus({ preventScroll: true });
    } else if (dialog.contains(document.activeElement) ||
               document.activeElement === trigger || document.activeElement === document.body) {
      document.getElementById("reference-theme").focus({ preventScroll: true });
    }
  });

  new MutationObserver(() => {
    if (dialog.open && !idle()) dialog.close();
  }).observe(ask, { attributeFilter: ["hidden", "inert", "data-conversation"] });
}
