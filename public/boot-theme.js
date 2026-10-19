// Paints the correct theme on the very first frame so the window never flashes
// the wrong background. This lives in `public/` rather than inline in
// index.html because the Content Security Policy blocks inline scripts.
//
// It is a hint only: the authoritative value comes from the Rust settings store
// as soon as the app mounts, and `applyTheme` rewrites the same key.
(function () {
  try {
    var pref = localStorage.getItem("breathe.theme");
    var dark =
      pref === "dark" ||
      ((pref === null || pref === "system") &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
  } catch (_) {
    /* fall back to the default light theme declared on <html> */
  }
})();
