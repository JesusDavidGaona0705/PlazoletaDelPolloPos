/* Clientes. */

Object.assign(POSApp.prototype, {
  saveClient() {
    const n = document.getElementById("clientName").value.trim();
    const ph = document.getElementById("clientPhone").value.trim();
    const nt = document.getElementById("clientNotes").value.trim();
    if (!n) {
      Toast.error("Nombre");
      return;
    }
    this.state.clients.push({
      id: Utils.generateId(),
      name: n,
      phone: ph,
      notes: nt,
      createdAt: Utils.now(),
    });
    document.getElementById("clientName").value = "";
    document.getElementById("clientPhone").value = "";
    document.getElementById("clientNotes").value = "";
    this.hideModal("addClientModal");
    this.saveState();
    this.render();
    this.logActivity(`Cliente: ${n}`);
    Toast.success("Cliente agregado");
  },

  deleteClient(id) {
    if (!confirm("¿Eliminar?")) return;
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
    const search = (document.getElementById("clientSearch")?.value || "").toLowerCase();
    let clients = this.state.clients || [];
    if (search)
      clients = clients.filter(
        (c) => c.name.toLowerCase().includes(search) || c.phone?.includes(search),
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
          <button class="icon-btn danger"
          onclick="event.stopPropagation();app.deleteClient('${cl.id}')" title="Eliminar"><i class="fas fa-trash"></i></button></div></div>`;
      })
      .join("");
    const os = document.getElementById("orderClient");
    if (os)
      os.innerHTML =
        '<option value="">General</option>' +
        this.state.clients
          .map((cl) => `<option value="${cl.id}">${Utils.sanitizeInput(cl.name)}</option>`)
          .join("");
  },
});
