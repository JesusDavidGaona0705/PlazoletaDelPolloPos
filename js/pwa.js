/* App instalable: registro del service worker y botón «Instalar». */

const PWA = (() => {
  let deferred = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e;
    try {
      if (typeof Cloud !== "undefined") Cloud.renderModal();
    } catch (x) {}
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
  });
  function register() {
    if (!("serviceWorker" in navigator) || !/^https?:$/.test(location.protocol)) return;
    navigator.serviceWorker
      .register("sw.js")
      .then((reg) => {
        const notify = () => {
          if (reg.waiting && navigator.serviceWorker.controller)
            Toast.info("🔄 Hay una versión nueva. Se aplicará al cerrar y volver a abrir la app");
        };
        notify();
        reg.addEventListener("updatefound", () => {
          const w = reg.installing;
          if (w)
            w.addEventListener("statechange", () => {
              if (w.state === "installed") notify();
            });
        });
      })
      .catch(() => {});
  }
  return {
    canInstall: () => !!deferred,
    install: async () => {
      if (!deferred) return;
      deferred.prompt();
      try {
        await deferred.userChoice;
      } catch (e) {}
      deferred = null;
      try {
        Cloud.renderModal();
      } catch (e) {}
    },
    register,
  };
})();
