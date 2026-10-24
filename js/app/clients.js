/* Clientes. */

Object.assign(POSApp.prototype, {
  openClientModal(id) {
    const c = id ? this.state.clients.find((x) => x.id === id) : null;
    if (id && this.currentRole !== "admin") {
      Toast.error("Solo el administrador puede editar clientes");
      return;
    }
    this._clientFromCheckout = false;
    this._editClientId = c ? c.id : null;
    document.getElementById("clientName").value = c ? c.name : "";
    document.getElementById("clientPhone").value = c ? c.phone || "" : "";
    document.getElementById("clientNotes").value = c ? c.notes || "" : "";
    this.showModal("addClientModal");
    setTimeout(() => document.getElementById("clientName").focus(), 80);
  },

  closeClientModal() {
    this._clientFromCheckout = false;
    this._editClientId = null;
    this.hideModal("addClientModal");
  },

  saveClient() {
    const n = document
      .getElementById("clientName")
      .value.trim()
      .replace(/\s+/g, " ");
    const ph = document.getElementById("clientPhone").value.trim();
    const nt = document.getElementById("clientNotes").value.trim();
    const digits = ph.replace(/\D/g, "").replace(/^57(?=\d{10}$)/, "");
    if (n.length < 2) {
      Toast.error("Escribe el nombre del cliente");
      return;
    }
    if (digits.length !== 10) {
      Toast.error("El teléfono debe tener 10 dígitos (ej. 320 988 4346)");
      return;
    }
    const editing = this._editClientId
      ? this.state.clients.find((c) => c.id === this._editClientId)
      : null;
    const dup = this.state.clients.find(
      (c) =>
        c !== editing &&
        String(c.phone || "")
          .replace(/\D/g, "")
          .replace(/^57(?=\d{10}$)/, "") === digits,
    );
    if (dup) {
      Toast.error(`Ese teléfono ya está registrado (${dup.name})`);
      return;
    }
    const phone = `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
    let cid;
    if (editing) {
      Object.assign(editing, { name: n, phone, notes: nt });
      cid = editing.id;
    } else {
      cid = Utils.generateId();
      this.state.clients.push({
        id: cid,
        name: n,
        phone,
        notes: nt,
        createdBy: this.currentUserLabel(),
        createdAt: Utils.now(),
      });
    }
    const fromCheckout = this._clientFromCheckout;
    this.closeClientModal();
    this.saveState();
    this.render();
    if (fromCheckout) {
      this.fillCheckoutClients(cid);
      this.updateCheckoutRules();
    }
    this.logActivity(`${editing ? "Cliente editado" : "Cliente"}: ${n}`);
    Toast.success(editing ? "Cliente actualizado" : "Cliente agregado");
  },

  deleteClient(id) {
    if (this.currentRole !== "admin") {
      Toast.error("Solo el administrador puede eliminar clientes");
      return;
    }
    const owes = (this.state.pendingSales || []).some((s) => s.clientId === id);
    const msg = owes
      ? "Este cliente tiene ventas pendientes (debe plata). Si lo eliminas, las ventas seguirán en la lista con su nombre. ¿Eliminar de todos modos?"
      : "¿Eliminar este cliente?";
    if (!confirm(msg)) return;
    this.state.clients = this.state.clients.filter((c) => c.id !== id);
    this.saveState();
    this.render();
    Toast.success("Eliminado");
  },

  showClientDetail(id) {
    const c = this.state.clients.find((x) => x.id === id);
    if (!c) return;
    const purchases = this.state.sales.filter((s) => s.clientId === id);
    const totalSpent = purchases.reduce((t, s) => t + s.total, 0);
    document.getElementById("clientDetailTitle").textContent = c.name;
    document.getElementById("clientDetailContent").innerHTML = `<div
          style="background:var(--bg3);
          padding:.75rem;
          border-radius:var(--rs);
          margin-bottom:.6rem">
        <div
          style="font-size:.7rem;color:var(--tx2)">Teléfono</div>
        <div style="font-weight:600">${Utils.sanitizeInput(c.phone || "No registrado")}</div>${
          c.notes
            ? `<div
            style="font-size:.7rem;color:var(--tx2);margin-top:.4rem">Notas</div>
        <div style="font-size:.85rem">${Utils.sanitizeInput(c.notes)}</div>`
            : ""
        }</div>
        <div
            style="display:grid;
          grid-template-columns:1fr 1fr;
          gap:.4rem;
          margin-bottom:.6rem">
        <div
            style="background:var(--bg3);
          padding:.6rem;
          border-radius:var(--rs);
          text-align:center">
        <div
            style="font-size:.7rem;color:var(--tx2)">Compras</div>
        <div
            style="font-size:1.15rem;font-weight:700;color:var(--primary)">${Utils.formatNumber(purchases.length)}</div>
        </div>
        <div
            style="background:var(--bg3);
          padding:.6rem;
          border-radius:var(--rs);
          text-align:center">
        <div
            style="font-size:.7rem;color:var(--tx2)">Total</div>
        <div
            style="font-size:1.15rem;font-weight:700;color:var(--success)">${Utils.formatCurrency(totalSpent)}</div></div></div><h4 style="font-size:.85rem;margin-bottom:.4rem">Historial:</h4>${
              purchases.length === 0
                ? '<p style="color:var(--tx2);font-size:.8rem">Sin compras</p>'
                : purchases
                    .slice()
                    .reverse()
                    .map(
                      (s) =>
                        `<div class="sale-item"><div class="sale-info"><div class="sale-id">${Utils.formatDate(s.timestamp)}</div><div class="sale-details">${Utils.formatNumber(s.items.length)} items</div></div><div class="sale-amount">${Utils.formatCurrency(s.total)}</div></div>`,
                    )
                    .join("")
            }`;
    this.showModal("clientDetailModal");
  },

  filterClients() {
    this.renderClients();
  },

  renderClients() {
    const search = (
      document.getElementById("clientSearch")?.value || ""
    ).toLowerCase();
    let clients = this.state.clients || [];
    if (search)
      clients = clients.filter(
        (c) =>
          c.name.toLowerCase().includes(search) || c.phone?.includes(search),
      );
    const c = document.getElementById("clientsList");
    if (clients.length === 0) {
      c.innerHTML =
        '<div class="empty-state"><i class="fas fa-users"></i><p>Sin clientes</p></div>';
      return;
    }
    c.innerHTML = clients
      .map((cl) => {
        const purchases = this.state.sales.filter((s) => s.clientId === cl.id);
        const totalSpent = purchases.reduce((t, s) => t + s.total, 0);
        return `<div class="sale-item" style="cursor:pointer" onclick="app.showClientDetail('${cl.id}')"><div class="sale-info"><div class="sale-id">${Utils.sanitizeInput(cl.name)}</div><div class="sale-details">${Utils.sanitizeInput(cl.phone || "Sin tel")} • ${Utils.formatNumber(purchases.length)} compras • ${Utils.formatCurrency(totalSpent)}</div>
          </div>
          <div style="display:flex;gap:.2rem">
          ${
            this.currentRole === "admin"
              ? `<button class="icon-btn" onclick="event.stopPropagation();app.openClientModal('${cl.id}')" title="Editar"><i class="fas fa-edit"></i></button><button class="icon-btn danger" onclick="event.stopPropagation();app.deleteClient('${cl.id}')" title="Eliminar"><i class="fas fa-trash"></i></button>`
              : ""
          }</div></div>`;
      })
      .join("");
    const os = document.getElementById("orderClient");
    if (os)
      os.innerHTML =
        '<option value="">General</option>' +
        this.state.clients
          .map(
            (cl) =>
              `<option value="${cl.id}">${Utils.sanitizeInput(cl.name)}</option>`,
          )
          .join("");
  },
});
