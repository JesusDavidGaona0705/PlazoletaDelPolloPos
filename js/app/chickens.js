/* Inventario de pollos: crudos, asados, mermas y uso de sobrantes (pasteles, etc.). */

Object.assign(POSApp.prototype, {
  saveGoal() {
    const g = Utils.parseFormattedNumber(document.getElementById("dailyGoal").value);
    if (g <= 0) {
      Toast.error("Meta inválida");
      return;
    }
    this.state.dailyGoal = g;
    this.hideModal("goalModal");
    this.saveState();
    this.render();
    Toast.success("Meta actualizada");
  },

  /* Botones «+⅛ +¼ +½ +1 Borrar» de los campos de cantidad de pollos. */
  addQtyChip(id, amount) {
    const input = document.getElementById(id);
    if (!input) return;
    const value = amount === 0 ? 0 : Utils.parseQty(input.value) + amount;
    input.value = Utils.formatQty(value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  },

  openChickenModal() {
    const ch = this.state.chickens;
    document.getElementById("chickensRaw").value = Utils.formatQty(ch.raw || 0);
    document.getElementById("chickensCooked").value = Utils.formatQty(ch.cooked || 0);
    this.updateChickenTotalPreview();
    this.showModal("chickenModal");
  },

  updateChickenTotalPreview() {
    const r = Utils.parseQty(document.getElementById("chickensRaw").value);
    const c = Utils.parseQty(document.getElementById("chickensCooked").value);
    document.getElementById("chickenTotalPreview").textContent = Utils.formatChickens(r + c);
  },

  saveChickenCount() {
    const r = Utils.parseQty(document.getElementById("chickensRaw").value);
    const c = Utils.parseQty(document.getElementById("chickensCooked").value);
    if (r < 0 || c < 0) {
      Toast.error("Valores inválidos");
      return;
    }
    this.state.chickens.raw = r;
    this.state.chickens.cooked = c;
    this.hideModal("chickenModal");
    this.saveState();
    this.render();
    this.logActivity(
      `Inventario: ${Utils.formatChickens(r)} crudos, ${Utils.formatChickens(c)} asados`,
    );
    Toast.success("Actualizado");
  },

  cookChickens() {
    if (this.state.chickens.raw <= 0) {
      Toast.warning("Sin crudos");
      return;
    }
    document.getElementById("cookAvailableRaw").textContent = Utils.formatChickens(
      this.state.chickens.raw,
    );
    document.getElementById("cookCurrentCooked").textContent = Utils.formatChickens(
      this.state.chickens.cooked,
    );
    document.getElementById("cookQuantity").value = "";
    this.showModal("cookModal");
  },

  confirmCookChickens() {
    const q = Utils.parseQty(document.getElementById("cookQuantity").value);
    if (q <= 0) {
      Toast.error("Inválido");
      return;
    }
    if (q > this.state.chickens.raw + 1e-9) {
      Toast.error(`Solo ${Utils.formatChickens(this.state.chickens.raw)} crudos`);
      return;
    }
    this.state.chickens.raw = Math.max(0, this.state.chickens.raw - q);
    this.state.chickens.cooked += q;
    this.hideModal("cookModal");
    this.saveState();
    this.render();
    this.logActivity(`Cocinados ${Utils.formatChickens(q)}`);
    Toast.success(`${Utils.formatChickens(q)} cocinados`);
  },

  registerMerma() {
    const t = this.state.selectedMermaType;
    const q = Utils.parseQty(document.getElementById("mermaQuantity").value);
    const d = document.getElementById("mermaDetail").value.trim();
    if (!t) {
      Toast.error("Tipo");
      return;
    }
    if (q <= 0) {
      Toast.error("Cantidad");
      return;
    }
    this.state.mermas.push({
      id: Utils.generateId(),
      timestamp: Utils.now(),
      type: t,
      quantity: q,
      detail: d,
    });
    this.state.chickens.cooked = Math.max(0, this.state.chickens.cooked - q);
    document.getElementById("mermaQuantity").value = "";
    document.getElementById("mermaDetail").value = "";
    document.querySelectorAll(".merma-type-btn").forEach((b) => b.classList.remove("active"));
    this.state.selectedMermaType = null;
    this.saveState();
    this.render();
    this.logActivity(`Merma: ${Utils.formatChickens(q)} ${t}`);
    Toast.success("Merma registrada");
  },

  /* Elige de dónde se descuenta el pollo usado: asados o crudos. */
  setUsageSource(source) {
    this.state.selectedUsageSource = source === "raw" ? "raw" : "cooked";
    document
      .querySelectorAll(".usage-source-btn")
      .forEach((b) =>
        b.classList.toggle("active", b.dataset.source === this.state.selectedUsageSource),
      );
  },

  /* Pasteles y «otro» gastan pollo; calentar y refrigerar solo se anotan. */
  syncUsageDeduct(type) {
    const box = document.getElementById("usageDeduct");
    if (box) box.checked = type === "pasteles" || type === "otro";
  },

  registerUsage() {
    const t = this.state.selectedUsageType;
    const q = Utils.parseQty(document.getElementById("usageQuantity").value);
    const d = document.getElementById("usageDetail").value.trim();
    const deduct = document.getElementById("usageDeduct").checked;
    const source = this.state.selectedUsageSource === "raw" ? "raw" : "cooked";
    const what = SOURCE_LABEL[source];
    if (!t) {
      Toast.error("Elige el tipo");
      return;
    }
    if (q <= 0) {
      Toast.error("Escribe la cantidad");
      return;
    }
    if (deduct) {
      const avail = this.state.chickens[source] || 0;
      if (q > avail + 1e-9) {
        const msg = `Solo hay ${Utils.formatChickens(avail)} ${what}. ¿Descontar de todos modos?`;
        if (!confirm(msg)) return;
      }
      this.state.chickens[source] = Math.max(0, avail - q);
    }
    this.state.usageHistory.push({
      id: Utils.generateId(),
      timestamp: Utils.now(),
      type: t,
      quantity: q,
      detail: d,
      deduct,
      source,
    });
    document.getElementById("usageQuantity").value = "";
    document.getElementById("usageDetail").value = "";
    document.querySelectorAll(".usage-type-btn").forEach((b) => b.classList.remove("active"));
    this.state.selectedUsageType = null;
    this.saveState();
    this.render();
    this.logActivity(`Uso: ${Utils.formatChickens(q)} ${t}${deduct ? ` (de ${what})` : ""}`);
    Toast.success(
      deduct ? `Registrado: se descontaron ${Utils.formatChickens(q)} ${what}` : "Registrado",
    );
  },

  renderMermas() {
    const c = document.getElementById("mermasHistoryList");
    if (!this.state.mermas || this.state.mermas.length === 0) {
      c.innerHTML = `<div class="empty-state">
          <i class="fas fa-exclamation-triangle"></i><p>Sin mermas</p>
        </div>`;
      return;
    }
    c.innerHTML = this.state.mermas
      .slice()
      .reverse()
      .map(
        (m) => `
        <div class="sale-item">
          <div class="sale-info">
            <div class="sale-id">${m.type.toUpperCase()}</div>
            <div class="sale-details">
              ${Utils.formatDate(m.timestamp)}${m.detail ? ` - ${Utils.sanitizeInput(m.detail)}` : ""}
            </div>
          </div>
          <div class="sale-amount" style="color:var(--danger)">${Utils.formatChickens(m.quantity)}</div>
        </div>`,
      )
      .join("");
  },

  renderUsageHistory() {
    const c = document.getElementById("usageHistoryList");
    if (!this.state.usageHistory || this.state.usageHistory.length === 0) {
      c.innerHTML =
        '<div class="empty-state"><i class="fas fa-history"></i><p>Sin registros</p></div>';
      return;
    }
    c.innerHTML = this.state.usageHistory
      .slice()
      .reverse()
      .map((u) => {
        let note = "";
        if (u.deduct) note = ` (descontó de ${SOURCE_LABEL[u.source] || "asados"})`;
        else if (u.deduct === false) note = " (sin descontar)";
        const detail = u.detail ? ` - ${Utils.sanitizeInput(u.detail)}` : "";
        return `
        <div class="sale-item">
          <div class="sale-info">
            <div class="sale-id">${u.type.toUpperCase()}</div>
            <div class="sale-details">
              ${Utils.formatDate(u.timestamp)} • ${Utils.formatChickens(u.quantity)} pollos${note}${detail}
            </div>
          </div>
        </div>`;
      })
      .join("");
  },
});
