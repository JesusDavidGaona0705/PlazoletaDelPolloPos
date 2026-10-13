/* Lectura y escritura segura en localStorage. */

function Storage_get(key, def = null) {
  try {
    const i = localStorage.getItem(key);
    return i ? JSON.parse(i) : def;
  } catch (e) {
    return def;
  }
}

function Storage_set(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    Toast.error(
      e && e.name === "QuotaExceededError"
        ? "Almacenamiento lleno: exporta el reporte y cierra el día"
        : "Error al guardar",
    );
    return false;
  }
}
