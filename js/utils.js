/* Utilidades: formato de números/fechas, avisos (Toast) y campos de dinero. */

const Utils = {
  formatCurrency(amount) {
    return new Intl.NumberFormat(CONFIG.locale, {
      style: "currency",
      currency: CONFIG.currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount || 0);
  },
  formatNumber(num) {
    return new Intl.NumberFormat(CONFIG.locale).format(num || 0);
  },
  formatDate(ts) {
    return new Date(ts).toLocaleString(CONFIG.locale, {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit",
    });
  },
  formatDateFull(ts) {
    return new Date(ts).toLocaleString(CONFIG.locale);
  },
  now() {
    try {
      return Cloud.now();
    } catch (e) {
      return Date.now();
    }
  },
  localDate(d) {
    d = d || new Date();
    const z = (n) => String(n).padStart(2, "0");
    return d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate());
  },
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  },
  csvCell(v) {
    let s = String(v == null ? "" : v);
    if (typeof v !== "number" && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  },
  downloadCSV(name, rows) {
    const csv =
      "\ufeff" +
      rows.map((r) => r.map((c) => Utils.csvCell(c)).join(";")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
  /* Pollos como fracción legible: 9.75 → "9 ¾", 0.5 → "½", 0.125 → "⅛". */
  formatChickens(n) {
    n = Number(n) || 0;
    const sign = n < 0 ? "-" : "";
    n = Math.abs(n);
    let whole = Math.floor(n + 1e-9);
    let eighths = Math.round((n - whole) * 8);
    if (Math.abs(n - (whole + eighths / 8)) > 1e-6) {
      return sign + Utils.formatNumber(Math.round(n * 100) / 100);
    }
    if (eighths === 8) {
      whole += 1;
      eighths = 0;
    }
    const frac = ["", "⅛", "¼", "⅜", "½", "⅝", "¾", "⅞"][eighths];
    if (!frac) return sign + whole;
    return sign + (whole ? whole + " " : "") + frac;
  },

  /* Cantidad escrita por una persona: acepta "1/2", "2 1/4", "0,5", "0.5", "¼"... */
  parseQty(value) {
    let s = String(value == null ? "" : value)
      .trim()
      .replace(/\s+/g, " ");
    if (!s) return 0;
    const uni = {
      "⅛": " 1/8",
      "¼": " 1/4",
      "⅜": " 3/8",
      "½": " 1/2",
      "⅝": " 5/8",
      "¾": " 3/4",
      "⅞": " 7/8",
    };
    s = s.replace(/[⅛¼⅜½⅝¾⅞]/g, (c) => uni[c]).trim();
    let m = s.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
    if (m) return +m[1] + +m[2] / (+m[3] || 1);
    m = s.match(/^(\d+)\s*\/\s*(\d+)$/);
    if (m) return +m[1] / (+m[2] || 1);
    const n = parseFloat(s.replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  },

  /* Cantidad para mostrar dentro de un campo de texto (con coma decimal). */
  formatQty(n) {
    n = Number(n) || 0;
    if (!n) return "";
    return String(Math.round(n * 1000) / 1000).replace(".", ",");
  },

  /* Reduce la letra de un texto de una línea hasta que quepa en su caja (mínimo `min` px). */
  fitText(el, min = 11) {
    if (!el) return;
    el.style.fontSize = "";
    if (!el.offsetParent || !el.clientWidth) return;
    let size = parseFloat(getComputedStyle(el).fontSize) || 16;
    while (el.scrollWidth > el.clientWidth + 1 && size > min) {
      size -= 1;
      el.style.fontSize = size + "px";
    }
  },
  sanitizeInput(input) {
    if (!input) return "";
    const d = document.createElement("div");
    d.textContent = String(input);
    return d.innerHTML.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  },
  validateNumber(value, min = 0) {
    const n = parseFloat(String(value).replace(/\./g, ""));
    return !isNaN(n) && n >= min ? n : null;
  },
  parseFormattedNumber(value) {
    return (
      parseFloat(
        String(value || "0")
          .replace(/\./g, "")
          .replace(/,/g, "."),
      ) || 0
    );
  },
  compressImage(file, maxW = 400, q = 0.7) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const c = document.createElement("canvas");
          let w = img.width,
            h = img.height;
          if (w > maxW) {
            h = (h * maxW) / w;
            w = maxW;
          }
          c.width = w;
          c.height = h;
          c.getContext("2d").drawImage(img, 0, 0, w, h);
          res(c.toDataURL("image/jpeg", q));
        };
        img.onerror = rej;
        img.src = e.target.result;
      };
      r.onerror = rej;
      r.readAsDataURL(file);
    });
  },
};

const Toast = {
  show(msg, type = "info", dur = 2500) {
    const c = document.getElementById("toastContainer"),
      t = document.createElement("div");
    t.className = `toast ${type}`;
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(() => {
      t.style.opacity = "0";
      t.style.transform = "translateX(100%)";
      t.style.transition = "all .3s";
      setTimeout(() => t.remove(), 300);
    }, dur);
  },
  success(m) {
    this.show(m, "success");
  },
  error(m) {
    this.show(m, "error");
  },
  warning(m) {
    this.show(m, "warning");
  },
  info(m) {
    this.show(m, "info");
  },
};

/* Campos de cantidad con fracciones (pollos): aceptan 1/2, 0,5 y traen botones +⅛ +¼ +½ +1. */
function setupQtyInputs() {
  const chips = [
    ["⅛", 0.125],
    ["¼", 0.25],
    ["½", 0.5],
    ["1", 1],
  ];
  document.querySelectorAll(".qty-input").forEach((input) => {
    if (input.dataset.qtyBound) return;
    input.dataset.qtyBound = "1";
    input.inputMode = "decimal";
    input.autocomplete = "off";
    input.addEventListener("input", () => {
      const clean = input.value.replace(/[^0-9.,/ ¼½¾⅛⅜⅝⅞]/g, "");
      if (clean !== input.value) input.value = clean;
    });
    const row = document.createElement("div");
    row.className = "qty-chips";
    row.innerHTML =
      chips
        .map(
          ([label, v]) =>
            `<button type="button" class="qty-chip"
              onclick="app.addQtyChip('${input.id}', ${v})">+${label}</button>`,
        )
        .join("") +
      `<button type="button" class="qty-chip"
        onclick="app.addQtyChip('${input.id}', 0)">Borrar</button>`;
    input.insertAdjacentElement("afterend", row);
  });
}

function setupMoneyInputs() {
  setupQtyInputs();
  document.querySelectorAll(".money-input").forEach((input) => {
    if (input.dataset.setup) return;
    input.dataset.setup = "1";
    input.type = "text";
    input.inputMode = "numeric";
    const update = () => {
      const raw = input.value.replace(/\D/g, "");
      const formatted = new Intl.NumberFormat(CONFIG.locale).format(raw || "");
      const cursor = input.selectionStart || input.value.length;
      const oldLen = input.value.length;
      input.value = formatted;
      const newLen = formatted.length;
      const diff = newLen - oldLen;
      try {
        input.setSelectionRange(cursor + diff, cursor + diff);
      } catch (e) {}
    };
    input.addEventListener("input", update);
    input.addEventListener("focus", () => {
      if (input.value === "0") input.value = "";
    });
  });
}
