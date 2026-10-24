/* Facturas: historial, edición, pendientes, tickets y exportación. */

Object.assign(POSApp.prototype, {
  saleCash(s) {
    if (s.paymentMethod === "efectivo") return s.total;
    if (s.paymentMethod === "mixto")
      return Math.max(0, s.total - (s.mixtoTransferencia || 0));
    return 0;
  },

  saleTransfer(s) {
    return s.total - this.saleCash(s);
  },

  markAsPaid(sid) {
    const idx = this.state.pendingSales.findIndex((s) => s.id === sid);
    if (idx !== -1) {
      const s = this.state.pendingSales[idx];
      s.status = "pagado";
      s.timestamp = Utils.now();
      this.state.sales.push(s);
      this.state.pendingSales.splice(idx, 1);
      this.saveState();
      this.render();
      this.logActivity(`Cobrada: ${Utils.formatCurrency(s.total)}`);
      Toast.success("Cobrada");
    }
  },

  requestEditSale(sid, isPending) {
    if (this.currentRole !== "admin") {
      Toast.error("Solo admin");
      return;
    }
    this.state.passwordCallback = () => this.openEditSaleModal(sid, isPending);
    document.getElementById("adminPassword").value = "";
    document.getElementById("passwordError").style.display = "none";
    document.getElementById("passwordModalDesc").textContent =
      "Contraseña admin";
    this.showModal("passwordModal");
  },

  openEditSaleModal(sid, isPending) {
    const s = isPending
      ? this.state.pendingSales.find((x) => x.id === sid)
      : this.state.sales.find((x) => x.id === sid);
    if (!s) return;
    document.getElementById("editSaleId").value = sid;
    const cs = document.getElementById("editSaleClient");
    cs.innerHTML =
      '<option value="">General</option>' +
      this.state.clients
        .map(
          (c) =>
            `<option value="${c.id}">${Utils.sanitizeInput(c.name)}</option>`,
        )
        .join("");
    cs.value = s.clientId || "";
    document.getElementById("editSalePaymentMethod").value = s.paymentMethod;
    document.getElementById("editSaleStatus").value = s.status;
    this.state.editSaleTempItems = JSON.parse(JSON.stringify(s.items));
    this.state.editSaleIsPending = isPending;
    this.state.editSaleDiscount = s.discount || 0;
    this.renderEditSaleProducts();
    this.renderEditSaleAddProductSelect();
    this.updateEditSaleTotal();
    this.showModal("editSaleModal");
  },

  renderEditSaleProducts() {
    const c = document.getElementById("editSaleProductsList");
    if (this.state.editSaleTempItems.length === 0) {
      c.innerHTML =
        '<p style="font-size:.8rem;color:var(--tx2)">Sin productos</p>';
      return;
    }
    c.innerHTML = this.state.editSaleTempItems
      .map(
        (i, idx) =>
          `<div
              style="display:flex;
              align-items:center;
              gap:.4rem;
              padding:.4rem;
              background:var(--bg3);
              border-radius:var(--rs);
              margin-bottom:.3rem">
            <span style="font-size:1.1rem">${Utils.sanitizeInput(i.emoji || "📦")}</span><div
                style="flex:1;min-width:0;font-size:.75rem">
            <strong
                style="display:block;
              white-space:nowrap;
              overflow:hidden;
              text-overflow:ellipsis">${Utils.sanitizeInput(i.name)}</strong><span style="color:var(--tx2)">${Utils.formatCurrency(i.price)}</span></div><input type="text" class="form-input money-input" value="${Utils.formatNumber(i.quantity)}" onchange="app.updateEditSaleItemQty(${idx},this.value)"
                style="width:60px;min-height:36px;padding:.3rem;font-size:.8rem"><button class="icon-btn danger"
                onclick="app.removeEditSaleItem(${idx})"><i class="fas fa-trash"></i></button></div>`,
      )
      .join("");
    setTimeout(() => setupMoneyInputs(), 50);
  },

  renderEditSaleAddProductSelect() {
    document.getElementById("editSaleAddProduct").innerHTML =
      '<option value="">Seleccionar...</option>' +
      this.state.products
        .filter((p) => p.active !== false)
        .map(
          (p) =>
            `<option value="${p.id}">${Utils.sanitizeInput(p.name)} - ${Utils.formatCurrency(p.price)}</option>`,
        )
        .join("");
  },

  addProductToEditSale() {
    const pid = document.getElementById("editSaleAddProduct").value;
    if (!pid) {
      Toast.warning("Selecciona");
      return;
    }
    const p = this.state.products.find((x) => x.id === pid);
    if (!p) return;
    if (p.hasVariants && p.variants.length > 0) this.showEditVariantModal(p);
    else {
      this.state.editSaleTempItems.push({
        cartKey: `${pid}-${Utils.now()}`,
        productId: p.id,
        variantId: null,
        name: p.name,
        price: p.price,
        quantity: 1,
        emoji: this.emojiOf(p),
        ...this.chickenFields(p),
      });
      this.renderEditSaleProducts();
      this.updateEditSaleTotal();
      Toast.success("Agregado");
      if (navigator.vibrate)
        try {
          navigator.vibrate(12);
        } catch (e) {}
    }
  },

  showEditVariantModal(p) {
    document.getElementById("editVariantModal")?.remove();
    const c = document.createElement("div");
    c.className = "modal-overlay";
    c.id = "editVariantModal";
    c.innerHTML = `<div class="modal"><div class="modal-header"><h3 class="modal-title">${Utils.sanitizeInput(p.name)}</h3>
      <button
        class="modal-close"
        aria-label="Cerrar"
        onclick="document.getElementById('editVariantModal').remove()">&times;</button></div>
      <div class="variant-options">${p.variants.map((v) => `<div class="variant-option" onclick="app.addVariantToEditSale('${p.id}','${v.id}')"><div class="variant-emoji">${Utils.sanitizeInput(v.emoji || "🍽️")}</div><div class="variant-option-info"><div class="variant-option-name">${Utils.sanitizeInput(v.name)}</div><div class="variant-option-price">${Utils.formatCurrency(p.price + v.price)}</div></div></div>`).join("")}</div></div>`;
    document.body.appendChild(c);
    setTimeout(() => c.classList.add("active"), 10);
    c.addEventListener("click", (e) => {
      if (e.target === c) c.remove();
    });
  },

  addVariantToEditSale(pid, vid) {
    const p = this.state.products.find((x) => x.id === pid),
      v = p && (p.variants || []).find((x) => x.id === vid);
    if (!p || !v) return;
    this.state.editSaleTempItems.push({
      cartKey: `${pid}-${vid}-${Utils.now()}`,
      productId: p.id,
      variantId: v.id,
      name: `${p.name} - ${v.name}`,
      price: p.price + v.price,
      quantity: 1,
      emoji: v.emoji || this.emojiOf(p),
      ...this.chickenFields(p),
    });
    const m = document.getElementById("editVariantModal");
    if (m) m.remove();
    this.renderEditSaleProducts();
    this.updateEditSaleTotal();
    Toast.success("Agregada");
  },

  updateEditSaleItemQty(idx, val) {
    const q = Utils.parseFormattedNumber(val);
    if (q > 0 && this.state.editSaleTempItems[idx]) {
      this.state.editSaleTempItems[idx].quantity = q;
      this.updateEditSaleTotal();
    }
  },

  removeEditSaleItem(idx) {
    this.state.editSaleTempItems.splice(idx, 1);
    this.renderEditSaleProducts();
    this.updateEditSaleTotal();
  },

  getEditSaleTotal() {
    return Math.max(
      0,
      this.state.editSaleTempItems.reduce(
        (s, i) => s + i.price * i.quantity,
        0,
      ) - (this.state.editSaleDiscount || 0),
    );
  },

  updateEditSaleTotal() {
    document.getElementById("editSaleTotalDisplay").textContent =
      Utils.formatCurrency(this.getEditSaleTotal());
  },

  saveEditedSale() {
    const sid = document.getElementById("editSaleId").value;
    const cid = document.getElementById("editSaleClient").value;
    const pm = document.getElementById("editSalePaymentMethod").value;
    const st = document.getElementById("editSaleStatus").value;
    if (this.state.editSaleTempItems.length === 0) {
      Toast.error("Productos");
      return;
    }
    const total = this.getEditSaleTotal();
    const upd = (s) => {
      s.clientId = cid;
      s.customer =
        this.state.clients.find((c) => c.id === cid)?.name || "Cliente";
      this.applySaleInventory(s.items, 1);
      s.items = [...this.state.editSaleTempItems];
      this.applySaleInventory(s.items, -1);
      s.total = total;
      s.paymentMethod = pm;
      s.status = st;
      /* Mantener el reparto del pago coherente con el nuevo total/método (cuadre de caja) */
      if (pm === "mixto") {
        s.mixtoEfectivo = Math.min(+s.mixtoEfectivo || 0, total);
        s.mixtoTransferencia = total - s.mixtoEfectivo;
      } else {
        s.mixtoEfectivo = 0;
        s.mixtoTransferencia = 0;
      }
      if (pm === "efectivo" && s.cashReceived)
        s.change = Math.max(0, s.cashReceived - total);
      else s.change = 0;
    };
    if (st === "pendiente" && !this.state.clients.some((c) => c.id === cid)) {
      Toast.error("Una venta pendiente necesita un cliente registrado");
      return;
    }
    if (this.state.editSaleIsPending) {
      const s = this.state.pendingSales.find((x) => x.id === sid);
      if (s) {
        upd(s);
        if (st === "pagado") {
          s.timestamp = Utils.now();
          this.state.sales.push(s);
          this.state.pendingSales = this.state.pendingSales.filter(
            (x) => x.id !== sid,
          );
        }
      }
    } else {
      const s = this.state.sales.find((x) => x.id === sid);
      if (s) {
        upd(s);
        if (st === "pendiente") {
          this.state.pendingSales.push(s);
          this.state.sales = this.state.sales.filter((x) => x.id !== sid);
        }
      }
    }
    this.hideModal("editSaleModal");
    this.saveState();
    this.render();
    this.logActivity("Editada");
    Toast.success("Actualizada");
  },

  showSaleDetail(sid, isPending) {
    const s = isPending
      ? this.state.pendingSales.find((x) => x.id === sid)
      : this.state.sales.find((x) => x.id === sid);
    if (!s) return;
    this.currentSaleDetail = s;
    this.currentSaleIsPending = !!isPending;
    const c = document.getElementById("saleDetailContent");
    c.innerHTML = `<div
        style="background:var(--bg3);
        padding:.75rem;
        border-radius:var(--rs);
        margin-bottom:.6rem">
      <div
        style="font-size:.7rem;color:var(--tx2)">Cliente</div>
      <div
        style="font-size:1rem;font-weight:700">${Utils.sanitizeInput(s.customer)}</div><div style="font-size:.7rem;color:var(--tx2);margin-top:.15rem">${Utils.formatDateFull(s.timestamp)}</div>
      </div>
      <div style="margin-bottom:.6rem">
      <div
          style="font-size:.7rem;color:var(--tx2);margin-bottom:.4rem">Productos:</div>${s.items
            .map(
              (i) => `<div
          style="display:flex;
        justify-content:space-between;
        padding:.3rem 0;
        border-bottom:1px solid var(--bd);
        font-size:.8rem">
      <span>${Utils.sanitizeInput(i.emoji || "")} ${Utils.sanitizeInput(i.name)} × ${Utils.formatNumber(i.quantity)}</span><span style="font-weight:600">${Utils.formatCurrency(i.price * i.quantity)}</span></div>`,
            )
            .join("")}</div>${
            s.discount
              ? `<div
          style="background:rgba(16,185,129,.1);
        padding:.4rem;
        border-radius:var(--rs);
        margin-bottom:.4rem;
        font-size:.8rem;
        color:var(--success)">Desc: -${Utils.formatCurrency(s.discount)}</div>`
              : ""
          }<div
            style="background:var(--bg3);
        padding:.6rem;
        border-radius:var(--rs);
        margin-bottom:.6rem">
      <div
            style="display:flex;
        justify-content:space-between;
        margin-bottom:.2rem;
        font-size:.8rem">
      <span>Método:</span><strong>${s.paymentMethod === "efectivo" ? "💵 Efectivo" : s.paymentMethod === "transferencia" ? " Transf." : "🔄 Mixto"}</strong></div>${
        s.cashReceived
          ? `<div
          style="display:flex;
        justify-content:space-between;
        margin-bottom:.2rem;
        font-size:.8rem">
      <span>Recibido:</span><strong>${Utils.formatCurrency(s.cashReceived)}</strong></div>
      <div
          style="display:flex;justify-content:space-between;font-size:.8rem">
      <span>Cambio:</span><strong
          style="color:var(--success)">${Utils.formatCurrency(s.change || 0)}</strong></div>`
          : ""
      }${s.notes ? `<div style="margin-top:.4rem;font-size:.75rem;color:var(--tx2)"><strong>Notas:</strong> ${Utils.sanitizeInput(s.notes)}</div>` : ""}</div>
      <div
          style="background:linear-gradient(135deg,var(--primary),var(--primary-dark));
        color:#fff;
        padding:.85rem;
        border-radius:var(--rs);
        text-align:center">
      <div
          style="font-size:.75rem;opacity:.9">TOTAL</div>
      <div
          style="font-size:1.75rem;font-weight:700">${Utils.formatCurrency(s.total)}</div>
      </div>
      <div
          style="text-align:center;margin-top:.4rem">
      <span class="status-badge status-${s.status === "pagado" ? "paid" : "pending"}">${s.status === "pagado" ? "✅ Pagado" : "⏳ Pendiente"}</span></div>`;
    this.showModal("saleDetailModal");
  },

  showAllSales() {
    const c = document.getElementById("allSalesList");
    const all = [...this.state.sales].reverse();
    if (all.length === 0) {
      c.innerHTML =
        '<div class="empty-state"><i class="fas fa-receipt"></i><p>Sin ventas</p></div>';
    } else {
      c.innerHTML = all
        .map(
          (s) =>
            `<div
                class="sale-item"
                style="flex-wrap:wrap">
              <div
                class="sale-info"
                style="flex:1;min-width:0">
              <div class="sale-id">${Utils.sanitizeInput(s.customer)}</div><div class="sale-details">${Utils.formatDate(s.timestamp)} • ${Utils.formatNumber(s.items.length)} items</div><div style="font-size:.65rem;color:var(--tx2);margin-top:.15rem">${s.items
                .slice(0, 2)
                .map((i) => `${Utils.sanitizeInput(i.name)}×${i.quantity}`)
                .join(", ")}</div>
                </div>
                <div
                  style="display:flex;flex-direction:column;align-items:flex-end;gap:.25rem">
                <div class="sale-amount">${Utils.formatCurrency(s.total)}</div>
                <div
                    style="display:flex;gap:.25rem">
                <button class="btn btn-outline btn-sm"
                  onclick="app.showSaleDetail('${s.id}',false)" style="min-height:32px"><i class="fas fa-eye"></i></button>${this.currentRole === "admin" ? `<button class="btn btn-primary btn-sm" onclick="app.requestEditSale('${s.id}',false)" style="min-height:32px"><i class="fas fa-edit"></i></button><button class="btn btn-danger btn-sm" onclick="app.requestDeleteSale('${s.id}',false)" style="min-height:32px" title="Eliminar factura"><i class="fas fa-trash"></i></button>` : ""}</div></div></div>`,
        )
        .join("");
    }
    this.showModal("allSalesModal");
  },

  printAllSales() {
    const all = [...this.state.sales].reverse();
    const w = window.open("", "_blank", "width=600,height=800");
    if (!w) {
      Toast.error("Permite las ventanas emergentes para imprimir");
      return;
    }
    w.document.write(
      `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta
          name="viewport"
          content="width=device-width,initial-scale=1"><title>Reporte</title><style>body{font-family:Arial,sans-serif;padding:20px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f59e0b;color:#fff}h1{color:#f59e0b}</style></head><body><h1>🍗 La Plazoleta - Ventas</h1>
        <p>${new Date().toLocaleString("es-CO")}</p>
        <table>
        <thead>
        <tr>
        <th>Hora</th><th>Cliente</th><th>Items</th><th>Método</th><th>Total</th></tr>
        </thead>
        <tbody>${all.map((s) => `<tr><td>${Utils.formatDate(s.timestamp)}</td><td>${Utils.sanitizeInput(s.customer)}</td><td>${s.items.length}</td><td>${s.paymentMethod}</td><td>${Utils.formatCurrency(s.total)}</td></tr>`).join("")}</tbody></table><p style="margin-top:20px;font-weight:bold">Total: ${Utils.formatCurrency(all.reduce((t, s) => t + s.total, 0))}</p></body></html>`,
    );
    w.document.close();
    setTimeout(() => {
      try {
        w.focus();
        w.print();
      } catch (e) {}
    }, 300);
  },

  exportSalesCSV() {
    const rows = [["Fecha", "Cliente", "Items", "Metodo", "Total"]];
    [...this.state.sales]
      .reverse()
      .forEach((s) =>
        rows.push([
          new Date(s.timestamp).toLocaleString("es-CO"),
          s.customer,
          s.items.length,
          s.paymentMethod,
          s.total,
        ]),
      );
    Utils.downloadCSV(`ventas_${Utils.localDate()}.csv`, rows);
    Toast.success("CSV exportado");
  },

  renderRecentSales() {
    const c = document.getElementById("recentSalesList");
    const r = this.state.sales.slice(-5).reverse();
    if (r.length === 0) {
      c.innerHTML =
        '<div class="empty-state"><i class="fas fa-receipt"></i><p>Sin ventas</p></div>';
      return;
    }
    c.innerHTML = r
      .map(
        (s) =>
          `<div class="sale-item"><div class="sale-info"><div class="sale-id">${Utils.sanitizeInput(s.customer)}</div><div class="sale-details">${Utils.formatDate(s.timestamp)} • ${Utils.formatNumber(s.items.length)} items <span class="status-badge status-${s.status === "pagado" ? "paid" : "pending"}">${s.status}</span></div></div><div class="sale-amount">${Utils.formatCurrency(s.total)}</div></div>`,
      )
      .join("");
  },

  renderPendingSales() {
    const c = document.getElementById("pendingSalesList");
    if (this.state.pendingSales.length === 0) {
      c.innerHTML =
        '<div class="empty-state"><i class="fas fa-clock"></i><p>Sin pendientes</p></div>';
      return;
    }
    c.innerHTML = this.state.pendingSales
      .map(
        (s) =>
          `<div
              class="sale-item"
              style="flex-wrap:wrap">
            <div
              class="sale-info"
              style="flex:1;min-width:0">
            <div class="sale-id">${Utils.sanitizeInput(s.customer)}</div><div class="sale-details">${Utils.formatDate(s.timestamp)} • ${Utils.formatNumber(s.items.length)} items</div>
            </div>
            <div
                style="display:flex;gap:.3rem;align-items:center;flex-wrap:wrap">
            <div class="sale-amount">${Utils.formatCurrency(s.total)}</div><button class="btn btn-success btn-sm" onclick="app.markAsPaid('${s.id}')"
              style="min-height:32px">✅</button><button class="btn btn-outline btn-sm"
              onclick="app.requestEditSale('${s.id}',true)" style="min-height:32px"><i class="fas fa-edit"></i></button>${this.currentRole === "admin" ? `<button class="btn btn-danger btn-sm" onclick="app.requestDeleteSale('${s.id}',true)" style="min-height:32px" title="Eliminar factura"><i class="fas fa-trash"></i></button>` : ""}</div></div>`,
      )
      .join("");
  },

  /* ---------- eliminar facturas ---------- */

  requestDeleteSale(sid, isPending) {
    if (this.currentRole !== "admin") {
      Toast.error("Solo el administrador puede eliminar facturas");
      return;
    }
    this.state.passwordCallback = () =>
      this.openDeleteSaleModal(sid, !!isPending);
    document.getElementById("adminPassword").value = "";
    document.getElementById("passwordError").style.display = "none";
    document.getElementById("passwordModalDesc").textContent =
      "Contraseña de administrador";
    this.showModal("passwordModal");
  },

  openDeleteSaleModal(sid, isPending) {
    const list = isPending ? this.state.pendingSales : this.state.sales;
    const s = list.find((x) => x.id === sid);
    if (!s) return;
    this._deleteTarget = { id: sid, isPending };
    const items = s.items
      .map(
        (i) =>
          `${Utils.sanitizeInput(i.name)} × ${Utils.formatNumber(i.quantity)}`,
      )
      .join("<br>");
    document.getElementById("deleteSaleSummary").innerHTML = `
      <div><strong>${Utils.sanitizeInput(s.customer)}</strong>
        ${isPending ? "(pendiente)" : ""}</div>
      <div style="font-size:.75rem;color:var(--tx2)">${Utils.formatDate(s.timestamp)}</div>
      <div style="font-size:.8rem;margin:.4rem 0">${items}</div>
      <div style="font-weight:700;font-size:1.1rem">${Utils.formatCurrency(s.total)}</div>`;
    document.getElementById("deleteSaleRestore").checked = true;
    this.hideModal("saleDetailModal");
    this.showModal("deleteSaleModal");
  },

  confirmDeleteSale() {
    const t = this._deleteTarget;
    this._deleteTarget = null;
    if (!t || this.currentRole !== "admin") return;
    const key = t.isPending ? "pendingSales" : "sales";
    const idx = this.state[key].findIndex((x) => x.id === t.id);
    if (idx === -1) {
      this.hideModal("deleteSaleModal");
      return;
    }
    const s = this.state[key][idx];
    const restore = document.getElementById("deleteSaleRestore").checked;
    if (restore) this.applySaleInventory(s.items, 1);
    this.state[key].splice(idx, 1);
    this.currentSaleDetail = null;
    this.hideModal("deleteSaleModal");
    const how = restore ? "inventario devuelto" : "inventario sin devolver";
    this.logActivity(
      `Factura eliminada: ${s.customer} ${Utils.formatCurrency(s.total)} (${how})`,
    );
    this.saveState();
    this.render();
    if (document.getElementById("allSalesModal").classList.contains("active"))
      this.showAllSales();
    Toast.success("Factura eliminada");
  },
});
