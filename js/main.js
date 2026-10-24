/* Arranque de la aplicación. */

const app = new POSApp();

app.setupEventListeners();

/* Alto real del encabezado: la barra de categorías de Vender queda fija justo debajo. */
(function syncHeaderHeight() {
  const set = () => {
    const h = document.querySelector(".header");
    if (h)
      document.documentElement.style.setProperty(
        "--hdr-h",
        h.offsetHeight + "px",
      );
  };
  window.addEventListener("resize", set);
  window.addEventListener("load", set);
  setTimeout(set, 500);
})();
