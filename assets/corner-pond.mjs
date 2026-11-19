const link = document.querySelector(".corner-pond-link");
const gallery = document.querySelector(".corner-pond-gallery");

if (link && typeof gallery?.showModal === "function") {
  link.setAttribute("aria-haspopup", "dialog");
  link.addEventListener("click", event => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    gallery.showModal();
  });
  window.addEventListener("hashchange", () => {
    if (gallery.open && location.hash !== "#projects") gallery.close();
  });
}
