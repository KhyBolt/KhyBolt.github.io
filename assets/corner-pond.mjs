const link = document.querySelector(".corner-pond-link");
const gallery = document.querySelector(".corner-pond-gallery");

if (link && typeof gallery?.showModal === "function") {
  link.setAttribute("aria-haspopup", "dialog");
  link.addEventListener("click", event => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    gallery.showModal();
  });
  const onBackdrop = ({ target, clientX, clientY }) => {
    if (target !== gallery) return false;
    const { left, right, top, bottom } = gallery.getBoundingClientRect();
    return clientX < left || clientX >= right || clientY < top || clientY >= bottom;
  };
  let backdropPress = null;
  let dismissOnClick = false;
  const isSameTap = event =>
    backdropPress !== null && backdropPress.id === event.pointerId &&
    Math.hypot(event.clientX - backdropPress.x, event.clientY - backdropPress.y) <= 8;

  gallery.addEventListener("pointerdown", event => {
    dismissOnClick = false;
    backdropPress = event.isPrimary && event.button === 0 && onBackdrop(event)
      ? { id: event.pointerId, x: event.clientX, y: event.clientY }
      : null;
  });
  gallery.addEventListener("pointermove", event => {
    if (backdropPress && (!isSameTap(event) || !onBackdrop(event))) backdropPress = null;
  });
  gallery.addEventListener("pointercancel", () => {
    backdropPress = null;
    dismissOnClick = false;
  });
  gallery.addEventListener("pointerup", event => {
    dismissOnClick = isSameTap(event) && onBackdrop(event);
    backdropPress = null;
  });
  gallery.addEventListener("click", event => {
    if (dismissOnClick && event.detail > 0 && onBackdrop(event)) gallery.close();
    dismissOnClick = false;
  });
  window.addEventListener("hashchange", () => {
    if (gallery.open && location.hash !== "#projects") gallery.close();
  });
}
