(() => {
  "use strict";
  const key = "nuage-reference-theme";
  const root = document.documentElement;
  const themeColor = document.querySelector('meta[name="theme-color"]');
  let mode = "dark";
  let button;

  function show(value, notify = false) {
    mode = value === "light" ? "light" : "dark";
    const light = mode === "light";
    root.dataset.referenceTheme = mode;
    themeColor?.setAttribute("content", light ? "#ffffff" : "#000000");
    if (button) {
      button.setAttribute("aria-checked", String(light));
      button.title = light ? "Switch to dark theme" : "Switch to light theme";
    }
    if (notify) window.dispatchEvent(new CustomEvent("reference-theme", { detail: { light } }));
  }

  // Apply the saved theme before body paint; this short file loads only on
  // the reference route. Storage is optional (e.g. local/private browsing).
  try { show(window.localStorage.getItem(key)); }
  catch { show("dark"); }
  document.addEventListener("DOMContentLoaded", () => {
    button = document.getElementById("reference-theme");
    if (!button) return;
    show(mode);
    button.addEventListener("click", () => {
      show(mode === "light" ? "dark" : "light", true);
      try { window.localStorage.setItem(key, mode); } catch {}
    });
    button.hidden = false;
  }, { once: true });
  window.addEventListener("storage", event => {
    if (event.key === key && event.newValue !== mode) show(event.newValue, true);
  });
})();
