/* Mesas: pedidos abiertos de quienes comen en el local y pagan al final.
   - Cada mesa es un registro de «openOrders»; cada producto pedido es un renglón de «orderItems».
     Así, si dos cajas agregan a la misma mesa a la vez, no se borran pedidos entre sí.
   - El pollo y el stock se descuentan al pedir (sale de cocina) y se devuelven si se quita.
   - Al cobrar se usa la ventana de cobro normal; puede ser la cuenta completa o una parte. */

const TABLES_DEFAULT = 6;
const TABLES_MAX = 40;

Object.assign(POSApp.prototype, {
  /* ---------- datos ---------- */
  tableCount() {
    const s = (this.state.settings || []).find((x) => x.id === "tables");
    const n = Math.round(+(s && s.count) || TABLES_DEFAULT);
    return Math.min(TABLES_MAX, Math.max(1, n));
  },

  orderLabel(o) {
    if (!o) return "Pedido";
    if (o.table) return `Mesa ${o.table}`;
    return o.name ? String(o.name) : "Pedido";
  },

  orderItemsOf(orderId) {
    return (this.state.orderItems || []).filter((i) => i.orderId === orderId);
  },

  orderTotal(orderId) {
    return this.orderItemsOf(orderId).reduce(
      (t, i) => t + i.price * i.quantity,
      0,
    );
  },

  /* Mesas abiertas. Si un renglón quedó sin su mesa (dos cajas cerraron y agregaron a la vez)
     se muestra igual como «Pedido recuperado» para que no se pierda. */
  openOrdersList() {
    const orders = (this.state.openOrders || []).slice();
    const known = new Set(orders.map((o) => o.id));
    const orphan = new Map();
    (this.state.orderItems || []).forEach((i) => {
      if (!known.has(i.orderId) && !orphan.has(i.orderId))
        orphan.set(i.orderId, {
          id: i.orderId,
          table: null,
          name: "Pedido recuperado",
          openedAt: i.timestamp,
          orphan: true,
        });
    });
    return orders
      .concat(Array.from(orphan.values()))
      .sort(
        (a, b) =>
          (a.table || 999) - (b.table || 999) ||
          (a.openedAt || 0) - (b.openedAt || 0),
      );
  },

  findOrder(orderId) {
    return this.openOrdersList().find((o) => o.id === orderId) || null;
  },

  orderForTable(n) {
    return (this.state.openOrders || []).find((o) => +o.table === +n) || null;
  },

  /* Total de todo lo abierto con ese número (si dos cajas abrieron la misma mesa a la vez) */
  tableNumberTotal(n) {
    return (this.state.openOrders || [])
      .filter((o) => +o.table === +n)
      .reduce((t, o) => t + this.orderTotal(o.id), 0);
  },

  orderForName(name) {
    const k = String(name || "")
      .trim()
      .toLowerCase();
    if (!k) return null;
    return (
      (this.state.openOrders || []).find(
        (o) =>
          !o.table &&
          String(o.name || "")
            .trim()
            .toLowerCase() === k,
      ) || null
    );
  },

  minutesAgo(ts) {
    const m = Math.max(0, Math.round((Utils.now() - (ts || 0)) / 60000));
    if (m < 1) return "recién";
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60);
    return `${h} h ${m % 60} min`;
  },

  /* ---------- enviar el carrito a una mesa ---------- */
  openTableSend() {
    if (this.state.cart.length === 0) {
      Toast.warning("Agrega productos primero");
      return;
    }
    this._sendTarget = null;
    if (this.tableTarget && this.findOrder(this.tableTarget))
      this._sendTarget = { type: "order", id: this.tableTarget };
    document.getElementById("tableSendName").value = "";
    const notes = document.getElementById("orderNotes");
    document.getElementById("tableSendNote").value = notes ? notes.value : "";
    let pr = true;
    try {
      pr = localStorage.getItem("pos_comanda_print") !== "0";
    } catch (e) {}
    document.getElementById("tableSendPrint").checked = pr;
    this.renderTableSend();
    this.showModal("tableSendModal");
  },

  renderTableSend() {
    const t = this._sendTarget;
    const n = this.tableCount();
    const tiles = [];
    for (let i = 1; i <= n; i++) {
      const o = this.orderForTable(i);
      const sel = t
        ? (t.type === "table" && +t.n === i) ||
          (t.type === "order" && o && o.id === t.id)
        : false;
      tiles.push(
        `<button type="button" class="table-tile ${o ? "busy" : ""} ${sel ? "selected" : ""}"
          onclick="app.pickSendTarget('table', ${i})">
          <span class="tt-name">Mesa ${i}</span>
          <span class="tt-sub">${o ? Utils.formatCurrency(this.tableNumberTotal(i)) : "Libre"}</span>
        </button>`,
      );
    }
    this.openOrdersList()
      .filter((o) => !o.table)
      .forEach((o) => {
        const sel = t && t.type === "order" && t.id === o.id;
        tiles.push(
          `<button type="button" class="table-tile busy named ${sel ? "selected" : ""}"
            onclick="app.pickSendTarget('order', '${o.id}')">
            <span class="tt-name">${Utils.sanitizeInput(this.orderLabel(o))}</span>
            <span class="tt-sub">${Utils.formatCurrency(this.orderTotal(o.id))}</span>
          </button>`,
        );
      });
    document.getElementById("tableSendGrid").innerHTML = tiles.join("");
    const sum = this.getCartSubtotal();
    let dest = "Elige una mesa o escribe el nombre del cliente";
    if (t && t.type === "table") {
      const o = this.orderForTable(t.n);
      dest = o
        ? `Se suma a Mesa ${t.n} (ya lleva ${Utils.formatCurrency(this.orderTotal(o.id))})`
        : `Abre Mesa ${t.n}`;
    } else if (t && t.type === "order") {
      const o = this.findOrder(t.id);
      dest = `Se suma a ${Utils.sanitizeInput(this.orderLabel(o))}`;
    } else if (t && t.type === "name") {
      const o = this.orderForName(t.name);
      dest = o
        ? `Se suma a ${Utils.sanitizeInput(this.orderLabel(o))}`
        : `Abre un pedido a nombre de ${Utils.sanitizeInput(t.name)}`;
    }
    document.getElementById("tableSendInfo").innerHTML =
      `${dest}<br><b>${Utils.formatNumber(this.state.cart.reduce((q, i) => q + i.quantity, 0))} producto(s) · ${Utils.formatCurrency(sum)}</b>`;
    document.getElementById("tableSendBtn").disabled = !t;
  },

  pickSendTarget(type, v) {
    this._sendTarget =
      type === "table" ? { type: "table", n: +v } : { type: "order", id: v };
    document.getElementById("tableSendName").value = "";
    this.renderTableSend();
  },

  onSendNameInput() {
    const name = document.getElementById("tableSendName").value.trim();
    this._sendTarget = name ? { type: "name", name } : null;
    this.renderTableSend();
  },

  /* Devuelve la mesa destino (la crea si hace falta). */
  resolveSendTarget() {
    const t = this._sendTarget;
    if (!t) return null;
    if (t.type === "order") return this.findOrder(t.id);
    let o = null;
    if (t.type === "table") o = this.orderForTable(t.n);
    if (t.type === "name") {
      const name = t.name.slice(0, 40);
      if (name.length < 2) {
        Toast.error("Escribe un nombre de al menos 2 letras");
        return null;
      }
      o = this.orderForName(name);
    }
    if (o) return o;
    const now = Utils.now();
    o = {
      id: Utils.generateId(),
      table: t.type === "table" ? +t.n : null,
      name: t.type === "name" ? t.name.slice(0, 40) : null,
      openedAt: now,
      timestamp: now,
      by: this.currentUserLabel(),
    };
    if (!Array.isArray(this.state.openOrders)) this.state.openOrders = [];
    this.state.openOrders.push(o);
    return o;
  },

  sendCartToTable() {
    if (this.state.cart.length === 0) {
      this.hideModal("tableSendModal");
      return;
    }
    const order = this.resolveSendTarget();
    if (!order) {
      if (!this._sendTarget) Toast.error("Elige una mesa");
      return;
    }
    if (order.orphan) {
      /* Recrear la cabecera de un pedido recuperado */
      const { orphan, ...h } = order;
      h.openedAt = h.openedAt || Utils.now();
      h.timestamp = h.openedAt;
      this.state.openOrders.push(h);
    }
    const note = document
      .getElementById("tableSendNote")
      .value.trim()
      .slice(0, 200);
    const batch = Utils.generateId();
    const now = Utils.now();
    const by = this.currentUserLabel();
    if (!Array.isArray(this.state.orderItems)) this.state.orderItems = [];
    const lines = this.state.cart.map((c, k) => ({
      id: Utils.generateId() + k,
      orderId: order.id,
      productId: c.productId,
      variantId: c.variantId || null,
      cartKey: c.cartKey,
      name: c.name,
      price: c.price,
      quantity: c.quantity,
      emoji: c.emoji || "",
      chickenUnits: c.chickenUnits || 0,
      chickenSource: c.chickenSource || null,
      timestamp: now + k,
      by,
      batch,
      note: k === 0 ? note : "",
    }));
    /* Sale de cocina: se descuenta ya */
    this.applySaleInventory(lines, -1);
    this.state.orderItems.push(...lines);
    const print = document.getElementById("tableSendPrint").checked;
    try {
      localStorage.setItem("pos_comanda_print", print ? "1" : "0");
    } catch (e) {}
    this.state.cart = [];
    this.state.discountType = "none";
    this.state.discountValue = 0;
    const dt = document.getElementById("discountType"),
      dv = document.getElementById("discountValue");
    if (dt) dt.value = "none";
    if (dv) dv.value = "";
    const notes = document.getElementById("orderNotes");
    if (notes) notes.value = "";
    this.tableTarget = null;
    this.hideModal("tableSendModal");
    this.saveState();
    this.render();
    const label = this.orderLabel(order);
    this.logActivity(
      `${label}: pedido de ${Utils.formatCurrency(lines.reduce((t, i) => t + i.price * i.quantity, 0))}`,
    );
    Toast.success(`🍽️ Enviado a ${label}`);
    if (print) this.printComanda(order.id, batch);
  },

  /* ---------- agregar desde el detalle de una mesa ---------- */
  addToTable(orderId) {
    const o = this.findOrder(orderId);
    if (!o) return;
    this.tableTarget = orderId;
    this.hideModal("tableDetailModal");
    this.showSection("sell");
    this.renderTables();
    Toast.info(`Toca los productos para ${this.orderLabel(o)}`);
  },

  cancelTableTarget() {
    this.tableTarget = null;
    this.renderTables();
  },

  renderTableTarget() {
    const b = document.getElementById("tableTargetBanner");
    const o = this.tableTarget ? this.findOrder(this.tableTarget) : null;
    if (!o) this.tableTarget = null;
    if (b) {
      b.style.display = o ? "flex" : "none";
      if (o)
        document.getElementById("tableTargetLabel").textContent =
          this.orderLabel(o);
    }
    const txt = o ? `Enviar a ${this.orderLabel(o)}` : "Mesa";
    document
      .querySelectorAll(".table-send-label")
      .forEach((el) => (el.textContent = txt));
    /* En la barra inferior solo cabe el nombre corto */
    document
      .querySelectorAll(".table-send-short")
      .forEach((el) => (el.textContent = o ? this.orderLabel(o) : "Mesa"));
    document
      .querySelectorAll(".table-send-btn")
      .forEach((el) => el.classList.toggle("targeting", !!o));
  },

  /* ---------- panel Mesas (en Vender, debajo del pedido) ---------- */
  renderTables() {
    const list = this.openOrdersList();
    this.renderTableTarget();
    const box = document.getElementById("tablesGrid");
    if (!box) return;
    document.getElementById("tablesCount").textContent =
      `(${Utils.formatNumber(list.length)})`;
    document.getElementById("tablesSummary").textContent = list.length
      ? `${list.length} abierta(s) · ${Utils.formatCurrency(list.reduce((t, o) => t + this.orderTotal(o.id), 0))} por cobrar`
      : "Sin mesas abiertas";
    const tile = (o, name, onclick) => {
      const sel = o && o.id === this.tableTarget;
      return `<button type="button" class="table-tile ${o ? "busy" : ""} ${sel ? "selected" : ""}"
          onclick="${onclick}">
          <span class="tt-name">${Utils.sanitizeInput(name)}</span>
          <span class="tt-sub">${o ? Utils.formatCurrency(this.orderTotal(o.id)) : "Libre"}</span>
          ${o ? `<span class="tt-time">${this.minutesAgo(o.openedAt)}</span>` : ""}
        </button>`;
    };
    const shown = new Set();
    const tiles = [];
    for (let i = 1; i <= this.tableCount(); i++) {
      const o = this.orderForTable(i);
      if (o) shown.add(o.id);
      tiles.push(tile(o, `Mesa ${i}`, `app.openTableTile(${i})`));
    }
    /* Pedidos a nombre, recuperados o repetidos (dos cajas abrieron la misma mesa a la vez) */
    list
      .filter((o) => !shown.has(o.id))
      .forEach((o) =>
        tiles.push(
          tile(o, this.orderLabel(o), `app.openTableDetail('${o.id}')`),
        ),
      );
    box.innerHTML = tiles.join("");
  },

  /* Mesa ocupada: ver su detalle. Mesa libre: enviarle el pedido que se está armando. */
  openTableTile(n) {
    const o = this.orderForTable(n);
    if (o) {
      this.openTableDetail(o.id);
      return;
    }
    if (!this.state.cart.length) {
      Toast.info(`Mesa ${n} está libre: agrega productos al pedido y tócala`);
      return;
    }
    this.openTableSend();
    this.pickSendTarget("table", n);
  },

  /* ---------- detalle de una mesa ---------- */
  openTableDetail(orderId) {
    if (!this.findOrder(orderId)) {
      Toast.warning("Esa mesa ya se cerró");
      this.render();
      return;
    }
    this._detailOrder = orderId;
    this._split = null;
    this.renderTableDetail();
    this.showModal("tableDetailModal");
  },

  /* Renglones iguales se muestran juntos. Cada «+» agrega un renglón nuevo (no cambia la
     cantidad de uno existente): si dos cajas suman a la vez, ninguna pisa a la otra. */
  orderGroups(orderId) {
    const map = new Map();
    this.orderItemsOf(orderId)
      .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
      .forEach((i) => {
        const k = [i.productId, i.variantId || "", i.price, i.name].join("|");
        let g = map.get(k);
        if (!g) {
          g = { key: k, lines: [], qty: 0, price: i.price, name: i.name, emoji: i.emoji, notes: [] };
          map.set(k, g);
        }
        g.lines.push(i);
        g.qty += i.quantity;
        if (i.note) g.notes.push(i.note);
      });
    return Array.from(map.values());
  },

  renderTableDetail() {
    const o = this.findOrder(this._detailOrder);
    if (!o) {
      this.hideModal("tableDetailModal");
      return;
    }
    const groups = (this._groups = this.orderGroups(o.id));
    const split = this._split;
    document.getElementById("tableDetailTitle").textContent =
      `${o.table ? "🍽️" : "👤"} ${this.orderLabel(o)}`;
    document.getElementById("tableDetailMeta").textContent =
      `Abierta hace ${this.minutesAgo(o.openedAt)}${o.by ? " · " + o.by : ""}`;
    const rows = groups.map((g, k) => {
      const sq = split ? Math.min(g.qty, split[g.key] || 0) : 0;
      const controls = split
        ? `<div class="td-split"><button class="qty-btn" onclick="app.changeSplitQty(${k},-1)">−</button>
             <span class="qty-value">${Utils.formatNumber(sq)}/${Utils.formatNumber(g.qty)}</span>
             <button class="qty-btn" onclick="app.changeSplitQty(${k},1)">+</button></div>`
        : `<div class="cart-item-controls"><button class="qty-btn" onclick="app.changeGroupQty(${k},-1)" aria-label="Quitar uno">−</button>
             <span class="qty-value">${Utils.formatNumber(g.qty)}</span>
             <button class="qty-btn" onclick="app.changeGroupQty(${k},1)" aria-label="Agregar uno">+</button></div>`;
      return `<div class="cart-item ${split && sq ? "split-on" : ""}"><div class="cart-item-info">
          <div class="cart-item-name">${Utils.sanitizeInput(g.emoji || "📦")} ${Utils.sanitizeInput(g.name)}</div>
          <div class="cart-item-price">${Utils.formatCurrency(g.price)} × ${Utils.formatNumber(g.qty)} = ${Utils.formatCurrency(g.price * g.qty)}</div>
          ${g.notes.length ? `<div class="td-note">📝 ${Utils.sanitizeInput(g.notes.join(" · "))}</div>` : ""}
        </div>${controls}</div>`;
    });
    document.getElementById("tableDetailItems").innerHTML = rows.length
      ? rows.join("")
      : '<div class="empty-state"><p>Sin productos. Agrega o cancela la mesa.</p></div>';
    const total = this.orderTotal(o.id);
    const splitTotal = split
      ? groups.reduce((t, g) => t + Math.min(g.qty, split[g.key] || 0) * g.price, 0)
      : 0;
    document.getElementById("tableDetailTotal").textContent =
      Utils.formatCurrency(total);
    const st = document.getElementById("tableSplitRow");
    st.style.display = split ? "flex" : "none";
    document.getElementById("tableSplitTotal").textContent =
      Utils.formatCurrency(splitTotal);
    document.getElementById("tableSplitBtn").innerHTML = split
      ? '<i class="fas fa-times"></i> No dividir'
      : '<i class="fas fa-cut"></i> Dividir';
    const pay = document.getElementById("tablePayBtn");
    pay.innerHTML = split
      ? `<i class="fas fa-credit-card"></i> Cobrar selección`
      : `<i class="fas fa-credit-card"></i> Cobrar todo`;
    pay.disabled = split ? splitTotal <= 0 : groups.length === 0;
    document.getElementById("tableSplitHint").style.display = split
      ? "block"
      : "none";
  },

  changeGroupQty(idx, d) {
    const g = (this._groups || [])[idx];
    if (!g || !g.lines.length) return;
    const last = g.lines[g.lines.length - 1];
    const label = this.orderLabel(this.findOrder(last.orderId));
    if (d < 0) {
      if (g.qty <= 1) {
        this.removeGroup(idx);
        return;
      }
      this.applySaleInventory([{ ...last, quantity: 1 }], 1);
      if (last.quantity > 1) last.quantity -= 1;
      else
        this.state.orderItems = this.state.orderItems.filter(
          (x) => x.id !== last.id,
        );
    } else {
      const p = this.state.products.find((x) => x.id === last.productId);
      const info = p && this.getChickenInfo(p);
      if (info) {
        const avail = this.state.chickens[info.source] || 0;
        if (
          avail + 1e-9 < info.units &&
          !confirm(
            `⚠️ Solo hay ${Utils.formatChickens(avail)} ${SOURCE_LABEL[info.source]}. ¿Agregar de todos modos?`,
          )
        )
          return;
      }
      const now = Utils.now();
      const line = {
        ...last,
        id: Utils.generateId() + "p",
        quantity: 1,
        timestamp: now,
        by: this.currentUserLabel(),
        batch: "mas-" + now,
        note: "",
      };
      this.applySaleInventory([line], -1);
      this.state.orderItems.push(line);
    }
    this.logActivity(`${label}: ${d > 0 ? "+" : "−"}1 ${g.name}`);
    this.saveState();
    this.render();
    this.renderTableDetail();
  },

  removeGroup(idx) {
    const g = (this._groups || [])[idx];
    if (!g) return;
    if (!confirm(`¿Quitar «${g.name}» de la mesa? Se devuelve al inventario.`))
      return;
    const ids = new Set(g.lines.map((x) => x.id));
    const live = this.state.orderItems.filter((x) => ids.has(x.id));
    this.applySaleInventory(live, 1);
    this.state.orderItems = this.state.orderItems.filter((x) => !ids.has(x.id));
    this.logActivity(
      `${this.orderLabel(this.findOrder(g.lines[0].orderId))}: quitado ${Utils.formatNumber(g.qty)}× ${g.name}`,
    );
    this.saveState();
    this.render();
    this.renderTableDetail();
  },

  renameTable() {
    const o = this.findOrder(this._detailOrder);
    if (!o) return;
    const v = prompt(
      "Número de mesa (por ejemplo 4) o nombre del cliente:",
      o.table ? String(o.table) : o.name || "",
    );
    if (v == null) return;
    const s = v.trim();
    if (!s) return;
    const num = /^\d{1,2}$/.test(s) ? +s : null;
    if (num) {
      if (num < 1 || num > this.tableCount()) {
        Toast.error(`Las mesas van de 1 a ${this.tableCount()}`);
        return;
      }
      const other = this.orderForTable(num);
      if (other && other.id !== o.id) {
        Toast.error(`La Mesa ${num} ya está ocupada`);
        return;
      }
    } else if (s.length < 2) {
      Toast.error("Escribe un nombre de al menos 2 letras");
      return;
    }
    const before = this.orderLabel(o);
    let h = (this.state.openOrders || []).find((x) => x.id === o.id);
    if (!h) {
      const { orphan, ...copy } = o;
      h = copy;
      this.state.openOrders.push(h);
    }
    h.table = num;
    h.name = num ? null : s.slice(0, 40);
    this.logActivity(`${before} ahora es ${this.orderLabel(h)}`);
    this.saveState();
    this.render();
    this.renderTableDetail();
  },

  cancelTable() {
    const o = this.findOrder(this._detailOrder);
    if (!o) return;
    const items = this.orderItemsOf(o.id);
    if (
      !confirm(
        `¿Cancelar ${this.orderLabel(o)}? Se quitan ${items.length} producto(s) y vuelven al inventario. No se registra venta.`,
      )
    )
      return;
    this.applySaleInventory(items, 1);
    this.closeOrder(o.id);
    this.logActivity(
      `${this.orderLabel(o)} cancelada (${Utils.formatCurrency(items.reduce((t, i) => t + i.price * i.quantity, 0))})`,
    );
    this.hideModal("tableDetailModal");
    this.saveState();
    this.render();
    Toast.info("Mesa cancelada");
  },

  closeOrder(orderId) {
    this.state.orderItems = (this.state.orderItems || []).filter(
      (x) => x.orderId !== orderId,
    );
    this.state.openOrders = (this.state.openOrders || []).filter(
      (x) => x.id !== orderId,
    );
  },

  /* ---------- dividir cuenta ---------- */
  toggleSplit() {
    this._split = this._split ? null : {};
    this.renderTableDetail();
  },

  changeSplitQty(idx, d) {
    const g = (this._groups || [])[idx];
    if (!g || !this._split) return;
    this._split[g.key] = Math.min(
      g.qty,
      Math.max(0, (this._split[g.key] || 0) + d),
    );
    this.renderTableDetail();
  },

  /* ---------- cobrar ---------- */
  chargeTable() {
    const o = this.findOrder(this._detailOrder);
    if (!o) return;
    const groups = this.orderGroups(o.id);
    const picks = groups
      .map((g) => ({
        g,
        q: this._split ? Math.min(g.qty, this._split[g.key] || 0) : g.qty,
      }))
      .filter((x) => x.q > 0);
    if (!picks.length) {
      Toast.warning(
        this._split ? "Elige qué productos se pagan ahora" : "Mesa vacía",
      );
      return;
    }
    /* Qué renglones exactos se cobran (los más antiguos primero) */
    const lines = [];
    picks.forEach(({ g, q }) => {
      let left = q;
      g.lines.forEach((it) => {
        if (left <= 0) return;
        const take = Math.min(left, it.quantity);
        lines.push({ id: it.id, q: take });
        left -= take;
      });
    });
    /* El carrito que se estaba armando se guarda y vuelve después de cobrar */
    if (!this.checkoutSource)
      this._held = {
        cart: this.state.cart,
        discountType: this.state.discountType,
        discountValue: this.state.discountValue,
      };
    this.state.cart = picks.map(({ g, q }) => {
      const it = g.lines[0];
      return {
        cartKey: it.productId + (it.variantId ? "-" + it.variantId : ""),
        productId: it.productId,
        variantId: it.variantId || null,
        name: g.name,
        price: g.price,
        quantity: q,
        emoji: it.emoji,
        chickenUnits: it.chickenUnits || 0,
        chickenSource: it.chickenSource || null,
      };
    });
    this.state.discountType = "none";
    this.state.discountValue = 0;
    const partial =
      picks.some(({ g, q }) => q < g.qty) || picks.length < groups.length;
    this.checkoutSource = {
      orderId: o.id,
      label: this.orderLabel(o),
      partial,
      lines,
    };
    this.hideModal("tableDetailModal");
    this.showCheckout();
  },

  /* ¿Siguen en la mesa los productos que se van a cobrar? (otra caja pudo cobrarlos o
     cancelarlos mientras esta ventana estaba abierta) */
  tableChargeValid(src) {
    const byId = new Map((this.state.orderItems || []).map((i) => [i.id, i]));
    return src.lines.every(({ id, q }) => {
      const it = byId.get(id);
      return it && it.orderId === src.orderId && it.quantity >= q;
    });
  },

  /* Tras registrar la venta: descontar de la mesa lo cobrado y cerrarla si quedó vacía. */
  finishTableCharge(src) {
    const byId = new Map((this.state.orderItems || []).map((i) => [i.id, i]));
    src.lines.forEach(({ id, q }) => {
      const it = byId.get(id);
      if (!it) return;
      it.quantity -= q;
    });
    this.state.orderItems = (this.state.orderItems || []).filter(
      (i) => !(i.orderId === src.orderId && i.quantity <= 0),
    );
    const left = this.orderItemsOf(src.orderId).length;
    if (!left) this.closeOrder(src.orderId);
    this.checkoutSource = null;
    this.restoreHeldCart();
    if (left) Toast.info(`${src.label} sigue abierta con lo que falta por pagar`);
  },

  restoreHeldCart() {
    this.checkoutSource = null;
    if (!this._held) return;
    this.state.cart = this._held.cart || [];
    this.state.discountType = this._held.discountType || "none";
    this.state.discountValue = this._held.discountValue || 0;
    this._held = null;
    this.renderCart();
  },

  /* ---------- impresiones: comanda de cocina y cuenta previa ---------- */
  buildTicketHTML({ title, big, meta, rows, total, note, foot, logo }) {
    const e = (v) => Utils.sanitizeInput(String(v == null ? "" : v));
    const c = this.getReceiptCfg();
    const width = c.paper === 58 ? 48 : 72;
    const css = `
      @page{margin:0}*{box-sizing:border-box}
      html,body{margin:0;padding:0;background:#fff}
      body{font-family:"Courier New",Courier,monospace;color:#000;font-size:12px;line-height:1.25}
      .rc{width:${width}mm;margin:0 auto;padding:${c.paper === 58 ? "1mm 2mm 3mm" : "1mm 3.5mm 3mm"}}
      .lg img{display:block;width:55%;margin:0 auto 2mm}
      .tt{text-align:center;font-weight:700;font-size:13px;letter-spacing:.15em}
      .bg{text-align:center;font-weight:700;font-size:24px;margin:1mm 0}
      .mt{display:flex;justify-content:space-between;font-size:11.5px;font-weight:700}
      .sep{border:0;border-top:2px dashed #000;margin:5px 0}
      .r{display:flex;gap:6px;margin:4px 0;font-weight:700}
      .r .q{min-width:9mm;font-size:15px}
      .r .n{flex:1;text-transform:uppercase;font-size:14px}
      .r .p{white-space:nowrap}
      .nt{border:2px solid #000;padding:4px 6px;margin:6px 0;font-weight:700;font-size:13px}
      .tot{display:flex;justify-content:space-between;background:#000;color:#fff;font-weight:700;font-size:18px;padding:5px 8px;margin-top:6px}
      .ft{text-align:center;font-size:11px;margin-top:6px}
      .cut{height:4mm}`;
    return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>${e(title)}</title>
      <style>${css}</style></head><body><div class="rc">
      ${logo ? `<div class="lg"><img src="${RECEIPT_LOGO.print}" alt=""></div>` : ""}
      <div class="tt">${e(title)}</div>
      <div class="bg">${e(big)}</div>
      <div class="mt">${meta.map((m) => `<span>${e(m)}</span>`).join("")}</div>
      <hr class="sep">
      ${rows
        .map(
          (r) =>
            `<div class="r"><span class="q">${e(r.q)}</span><span class="n">${e(r.n)}</span>${r.p != null ? `<span class="p">${e(r.p)}</span>` : ""}</div>`,
        )
        .join("")}
      ${note ? `<div class="nt">NOTA: ${e(note)}</div>` : ""}
      ${total != null ? `<div class="tot"><span>TOTAL</span><span>${e(total)}</span></div>` : ""}
      ${foot ? `<div class="ft">${e(foot)}</div>` : ""}
      <div class="cut"></div></div></body></html>`;
  },

  hhmm(ts) {
    const d = new Date(ts || Utils.now());
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  },

  /* Comanda: solo lo que se acaba de pedir (batch) o toda la mesa si no se indica. */
  printComanda(orderId, batch) {
    const o = this.findOrder(orderId || this._detailOrder);
    if (!o) return;
    let items = this.orderItemsOf(o.id);
    if (batch) items = items.filter((i) => i.batch === batch);
    if (!items.length) {
      Toast.warning("No hay productos para la comanda");
      return;
    }
    const note = items
      .map((i) => i.note)
      .filter(Boolean)
      .join(" · ");
    this.printHtml(
      this.buildTicketHTML({
        title: batch ? "COMANDA" : "COMANDA (COMPLETA)",
        big: this.orderLabel(o),
        meta: [this.hhmm(items[0].timestamp), items[0].by || ""],
        rows: items.map((i) => ({
          q: Utils.formatNumber(i.quantity) + "×",
          n: i.name,
        })),
        note,
      }),
    );
  },

  /* Cuenta previa para mostrar al cliente antes de pagar (no es factura). */
  printTableBill() {
    const o = this.findOrder(this._detailOrder);
    if (!o) return;
    const items = this.orderItemsOf(o.id);
    if (!items.length) return;
    const c = this.getReceiptCfg();
    this.printHtml(
      this.buildTicketHTML({
        logo: true,
        title: "CUENTA",
        big: this.orderLabel(o),
        meta: [this.hhmm(), "No es factura"],
        rows: items.map((i) => ({
          q: Utils.formatNumber(i.quantity) + "×",
          n: i.name,
          p: Utils.formatCurrency(i.price * i.quantity),
        })),
        total: Utils.formatCurrency(this.orderTotal(o.id)),
        foot: `${c.name} · Tel. ${c.phone}`,
      }),
    );
  },

  /* ---------- ajuste: número de mesas (solo admin) ---------- */
  setTableCount() {
    if (this.currentRole !== "admin") {
      Toast.error("Solo el administrador");
      return;
    }
    const v = prompt(
      `¿Cuántas mesas tiene el local? (1 a ${TABLES_MAX})`,
      String(this.tableCount()),
    );
    if (v == null) return;
    const n = Math.round(+v);
    if (!(n >= 1 && n <= TABLES_MAX)) {
      Toast.error(`Escribe un número de 1 a ${TABLES_MAX}`);
      return;
    }
    const busy = (this.state.openOrders || []).filter((o) => +o.table > n);
    if (busy.length) {
      Toast.error(
        `Primero cierra o cambia: ${busy.map((o) => this.orderLabel(o)).join(", ")}`,
      );
      return;
    }
    this.state.settings = (this.state.settings || []).filter(
      (x) => x.id !== "tables",
    );
    this.state.settings.push({ id: "tables", count: n });
    this.saveState();
    this.render();
    Toast.success(`Ahora hay ${n} mesas`);
  },
});
