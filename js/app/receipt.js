/* Factura: diseño (térmica 80 mm en blanco y negro / digital a color),
   impresión, aviso «¿imprimir?» después de cobrar y ajustes del local. */

const RECEIPT_DEFAULTS = {
  id: "receipt",
  name: "La Plazoleta del Pollo",
  slogan: "¡Gracias por preferirnos!",
  phone: "+57 320 9884346",
  whatsapp: "573209884346",
  address: "Calle 4 #3-07, Barrio Tamarindo",
  nit: "",
  footer: "Escríbenos por WhatsApp para tus pedidos",
  paper: 80,
  mode: "ask",
  qr: true,
};

Object.assign(POSApp.prototype, {
  /* ---------- ajustes (se sincronizan: colección «settings») ---------- */
  getReceiptCfg() {
    const s = (this.state.settings || []).find((x) => x.id === "receipt") || {};
    return Object.assign({}, RECEIPT_DEFAULTS, s);
  },

  nextInvoiceNumber() {
    const all = [
      ...(this.state.sales || []),
      ...(this.state.pendingSales || []),
    ];
    return all.reduce((m, s) => Math.max(m, +s.number || 0), 0) + 1;
  },

  currentUserLabel() {
    if (this.accountEmail) return String(this.accountEmail).split("@")[0];
    return this.currentRole === "admin" ? "Administrador" : "Empleado";
  },

  /* ---------- diseño de la factura ---------- */
  receiptMoney(n) {
    return Utils.formatCurrency(n);
  },

  buildReceiptHTML(s, mode) {
    const c = this.getReceiptCfg();
    const e = (v) => Utils.sanitizeInput(String(v == null ? "" : v));
    const screen = mode === "screen";
    const width = screen
      ? 340
      : c.paper === 58
        ? 48
        : 72; /* mm útiles en papel */
    const unit = screen ? "px" : "mm";
    const pending = s.status !== "pagado";
    const client = (this.state.clients || []).find((x) => x.id === s.clientId);
    const dt = new Date(s.timestamp);
    const p2 = (n) => String(n).padStart(2, "0");
    const when = `${p2(dt.getDate())}/${p2(dt.getMonth() + 1)}/${dt.getFullYear()} ${p2(dt.getHours())}:${p2(dt.getMinutes())}`;
    const num = s.number ? "No. " + String(s.number).padStart(6, "0") : "";
    const subtotal = (s.items || []).reduce(
      (t, i) => t + i.price * i.quantity,
      0,
    );
    const rows = (s.items || [])
      .map(
        (i) => `<div class="it"><div class="nm">${e(i.name)}</div>
          <div class="ln"><span>${Utils.formatNumber(i.quantity)} × ${this.receiptMoney(i.price)}</span><i></i><b>${this.receiptMoney(i.price * i.quantity)}</b></div></div>`,
      )
      .join("");
    const line = (a, b, cls) =>
      `<div class="kv ${cls || ""}"><span>${a}</span><b>${b}</b></div>`;
    let pay = "";
    if (s.paymentMethod === "mixto") {
      pay += line("Efectivo", this.receiptMoney(s.mixtoEfectivo || 0));
      pay += line(
        "Transferencia",
        this.receiptMoney(s.mixtoTransferencia || 0),
      );
    } else {
      pay += line(
        "Pago",
        s.paymentMethod === "efectivo" ? "Efectivo" : "Transferencia",
      );
      if (s.paymentMethod === "efectivo" && s.cashReceived && !pending) {
        pay += line("Recibido", this.receiptMoney(s.cashReceived));
        pay += line("Cambio", this.receiptMoney(s.change || 0));
      }
    }
    const who = s.by ? line("Atendió", e(s.by)) : "";
    let qr = "";
    if (c.qr && typeof qrcode === "function") {
      try {
        const q = qrcode(0, "M");
        q.addData("https://wa.me/" + String(c.whatsapp).replace(/\D/g, ""));
        q.make();
        qr = `<div class="qr">${q.createSvgTag({ cellSize: 3, margin: 0, scalable: true })}</div>`;
      } catch (err) {
        qr = "";
      }
    }
    const logo = screen ? RECEIPT_LOGO.color : RECEIPT_LOGO.print;
    const css = `
      @page{size:${screen ? "auto" : (c.paper === 58 ? 58 : 80) + "mm auto"};margin:0}
      *{box-sizing:border-box}
      html,body{margin:0;padding:0;background:${screen ? "#e9e2d3" : "#fff"}}
      body{font-family:"Courier New",Courier,monospace;color:#000;font-size:${screen ? 13 : 12}px;
        line-height:1.25;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .rc{width:${width}${unit};margin:0 auto;padding:${screen ? "0 0 14px" : "2mm 0 5mm"};
        background:${screen ? "#fbf5e6" : "#fff"}}
      .hd{text-align:center;padding:${screen ? "14px 12px 10px" : "0 0 2mm"};
        ${screen ? "background:#d90f1b;" : ""}}
      .hd img{display:block;width:${screen ? "86%" : "100%"};margin:0 auto}
      .sl{text-align:center;font-weight:700;font-size:${screen ? 11 : 10.5}px;margin:6px 0 2px;letter-spacing:.02em}
      .meta{display:flex;justify-content:space-between;white-space:nowrap;font-weight:700;font-size:${screen ? 12 : 11.5}px;margin:4px ${screen ? "12px" : "0"}}
      .sep{border:0;border-top:2px dashed #000;margin:6px ${screen ? "12px" : "0"}}
      .bx{margin:0 ${screen ? "12px" : "0"}}
      .kv{display:flex;justify-content:space-between;gap:6px;margin:2px 0}
      .it{margin:5px 0}
      .nm{font-weight:700;font-size:${screen ? 13 : 12.5}px;text-transform:uppercase}
      .ln{display:flex;align-items:baseline;gap:4px}
      .ln i{flex:1;border-bottom:2px dotted #000;transform:translateY(-3px);min-width:8px}
      .tot{display:flex;justify-content:space-between;align-items:center;margin:8px ${screen ? "12px" : "0"} 4px;
        padding:6px 8px;background:${screen ? "#d90f1b" : "#000"};color:#fff;font-weight:700;font-size:${screen ? 20 : 19}px}
      .stamp{display:block;width:max-content;margin:8px auto 6px;padding:3px 14px;border:3px solid ${screen ? (pending ? "#d97706" : "#16a34a") : "#000"};
        color:${screen ? (pending ? "#d97706" : "#16a34a") : "#000"};font-weight:700;font-size:${screen ? 20 : 19}px;
        letter-spacing:.12em;transform:rotate(-4deg);border-radius:4px}
      .debt{border:2px solid #000;padding:4px 6px;margin:6px ${screen ? "12px" : "0"};font-weight:700}
      .ft{text-align:center;margin-top:6px;font-size:${screen ? 11.5 : 11}px}
      .ft .th{font-weight:700;font-size:${screen ? 14 : 13.5}px;margin:6px 0 2px}
      .qr{width:${screen ? "110px" : "27mm"};margin:6px auto 2px}
      .qr svg{width:100%;height:auto;display:block;shape-rendering:crispEdges}
      .cut{height:6mm}`;
    return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Factura ${e(num)}</title>
      <meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body>
      <div class="rc">
        <div class="hd"><img src="${logo}" alt="${e(c.name)}"></div>
        <hr class="sep">
        <div class="meta"><span>${e(num)}</span><span>${e(when)}</span></div>
        <hr class="sep">
        <div class="bx">
          ${line("Cliente", e(s.customer || "Cliente"))}
          ${client && client.phone ? line("Teléfono", e(client.phone)) : ""}
          ${who}
        </div>
        <hr class="sep">
        <div class="bx">${rows}</div>
        <hr class="sep">
        <div class="bx">
          ${s.discount ? line("Subtotal", this.receiptMoney(subtotal)) + line("Descuento", "-" + this.receiptMoney(s.discount)) : ""}
        </div>
        <div class="tot"><span>TOTAL</span><span>${this.receiptMoney(s.total)}</span></div>
        <div class="bx">${pay}</div>
        <div class="stamp">${pending ? "PENDIENTE" : "PAGADO"}</div>
        ${pending ? `<div class="debt">${line("Saldo pendiente", this.receiptMoney(s.total))}${s.notes ? `<div style="font-weight:400">${e(s.notes)}</div>` : ""}</div>` : ""}
        <hr class="sep">
        <div class="ft">
          <div class="th">${e(c.slogan)}</div>
          <div>${e(c.address)}</div>
          <div>Tel. ${e(c.phone)}${c.nit ? " · NIT " + e(c.nit) : ""}</div>
          ${qr}
          <div>${e(c.footer)}</div>
        </div>
        ${screen ? "" : '<div class="cut"></div>'}
      </div></body></html>`;
  },

  /* Imprime en un marco invisible (no depende de ventanas emergentes). */
  printHtml(html) {
    const old = document.getElementById("printFrame");
    if (old) old.remove();
    const f = document.createElement("iframe");
    f.id = "printFrame";
    f.setAttribute("aria-hidden", "true");
    f.style.cssText =
      "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
    document.body.appendChild(f);
    const d = f.contentWindow.document;
    d.open();
    d.write(html);
    d.close();
    const go = () => {
      try {
        f.contentWindow.focus();
        f.contentWindow.print();
      } catch (err) {
        Toast.error("No se pudo abrir la impresión");
      }
    };
    const imgs = Array.from(d.images || []);
    Promise.all(
      imgs.map((i) =>
        i.complete ? 1 : new Promise((r) => (i.onload = i.onerror = r)),
      ),
    ).then(() => setTimeout(go, 200));
  },

  printReceipt(s) {
    if (!s) return;
    this.printHtml(this.buildReceiptHTML(s, "print"));
    this.logActivity("Factura impresa" + (s.number ? " No. " + s.number : ""));
  },

  printTicket() {
    this.printReceipt(this.currentSaleDetail);
  },

  /* ---------- después de cobrar ---------- */
  afterSale(sale) {
    this._lastSale = sale;
    const mode = this.getReceiptCfg().mode;
    if (mode === "never") return;
    if (mode === "always") {
      this.printReceipt(sale);
      return;
    }
    const pending = sale.status !== "pagado";
    document.getElementById("saleDoneTitle").textContent = pending
      ? "🕒 Venta pendiente guardada"
      : "✅ Venta registrada";
    document.getElementById("saleDoneInfo").innerHTML = `
      <div style="font-size:.75rem;color:var(--tx2)">${
        sale.number ? "Factura No. " + String(sale.number).padStart(6, "0") : ""
      } · ${Utils.sanitizeInput(sale.customer || "")}</div>
      <div style="font-size:1.6rem;font-weight:700;color:var(--primary)">${Utils.formatCurrency(sale.total)}</div>
      <div style="font-size:.9rem;margin-top:.25rem">¿Imprimir la factura?</div>`;
    this.showModal("saleDoneModal");
    setTimeout(() => document.getElementById("saleDonePrintBtn")?.focus(), 80);
  },

  saleDonePrint() {
    this.hideModal("saleDoneModal");
    this.printReceipt(this._lastSale);
  },

  saleDonePreview() {
    this.hideModal("saleDoneModal");
    this.openReceiptPreview(this._lastSale);
  },

  openReceiptPreview(sale) {
    if (!sale) return;
    this._previewSale = sale;
    document.getElementById("receiptPreviewFrame").srcdoc =
      this.buildReceiptHTML(sale, "screen");
    this.showModal("receiptPreviewModal");
  },

  previewPrint() {
    this.printReceipt(this._previewSale);
  },

  receiptText(s) {
    const c = this.getReceiptCfg();
    const lines = [
      `*${c.name}*`,
      s.number ? `Factura No. ${String(s.number).padStart(6, "0")}` : "",
      new Date(s.timestamp).toLocaleString("es-CO"),
      "",
      ...(s.items || []).map(
        (i) =>
          `• ${i.name} x${i.quantity} — ${Utils.formatCurrency(i.price * i.quantity)}`,
      ),
      "",
      s.discount ? `Descuento: -${Utils.formatCurrency(s.discount)}` : "",
      `*TOTAL: ${Utils.formatCurrency(s.total)}*`,
      s.status === "pagado" ? "Estado: PAGADO ✅" : "Estado: PENDIENTE 🕒",
      "",
      c.slogan,
      c.address,
      `Tel. ${c.phone}`,
    ];
    return lines
      .filter((x, i, a) => x !== "" || (a[i - 1] !== "" && i))
      .join("\n");
  },

  shareReceipt(sale) {
    const s = sale || this._lastSale || this._previewSale;
    if (!s) return;
    const cl = (this.state.clients || []).find((x) => x.id === s.clientId);
    let ph = cl && cl.phone ? String(cl.phone).replace(/\D/g, "") : "";
    if (ph.length === 10) ph = "57" + ph;
    const url = `https://wa.me/${ph}?text=${encodeURIComponent(this.receiptText(s))}`;
    window.open(url, "_blank", "noopener");
  },

  /* ---------- ajustes de factura (solo admin) ---------- */
  openReceiptSettings() {
    if (this.currentRole !== "admin") {
      Toast.error("Solo el administrador");
      return;
    }
    const c = this.getReceiptCfg();
    const set = (id, v) =>
      (document.getElementById(id).value = v == null ? "" : v);
    set("rcName", c.name);
    set("rcSlogan", c.slogan);
    set("rcPhone", c.phone);
    set("rcWhatsapp", c.whatsapp);
    set("rcAddress", c.address);
    set("rcNit", c.nit);
    set("rcFooter", c.footer);
    set("rcPaper", String(c.paper));
    set("rcMode", c.mode);
    document.getElementById("rcQr").checked = !!c.qr;
    this.showModal("receiptSettingsModal");
  },

  saveReceiptSettings() {
    if (this.currentRole !== "admin") return false;
    const v = (id) => document.getElementById(id).value.trim();
    const wa = v("rcWhatsapp").replace(/\D/g, "");
    if (!v("rcName")) {
      Toast.error("Escribe el nombre del local");
      return false;
    }
    if (document.getElementById("rcQr").checked && wa.length < 10) {
      Toast.error("WhatsApp con indicativo, por ejemplo 573209884346");
      return false;
    }
    const rec = {
      id: "receipt",
      name: v("rcName"),
      slogan: v("rcSlogan"),
      phone: v("rcPhone"),
      whatsapp: wa || RECEIPT_DEFAULTS.whatsapp,
      address: v("rcAddress"),
      nit: v("rcNit"),
      footer: v("rcFooter"),
      paper: v("rcPaper") === "58" ? 58 : 80,
      mode: ["ask", "always", "never"].includes(v("rcMode"))
        ? v("rcMode")
        : "ask",
      qr: document.getElementById("rcQr").checked,
    };
    this.state.settings = (this.state.settings || []).filter(
      (x) => x.id !== "receipt",
    );
    this.state.settings.push(rec);
    this.hideModal("receiptSettingsModal");
    this.saveState();
    Toast.success("Ajustes de factura guardados");
    return true;
  },

  previewSettingsReceipt() {
    const demo = {
      id: "demo",
      number: 123,
      timestamp: Utils.now(),
      customer: "Cliente de ejemplo",
      by: this.currentUserLabel(),
      items: [
        { name: "Medio pollo asado", price: 21000, quantity: 1 },
        { name: "Gaseosa 400ml", price: 2000, quantity: 2 },
      ],
      total: 25000,
      discount: 0,
      paymentMethod: "efectivo",
      cashReceived: 30000,
      change: 5000,
      status: "pagado",
    };
    if (!this.saveReceiptSettings()) return;
    this.openReceiptPreview(demo);
  },
});
