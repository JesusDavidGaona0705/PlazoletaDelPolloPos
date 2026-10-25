/* Caja: fondo, gastos, arqueo y cierre del día. */

Object.assign(POSApp.prototype, {
  saveCashFund() {
    const a = Utils.parseFormattedNumber(
      document.getElementById("cashFundInput").value,
    );
    if (a < 0) {
      Toast.error("Inválido");
      return;
    }
    this.state.cashFund = a;
    this.hideModal("cashFundModal");
    this.saveState();
    this.render();
    this.logActivity(`Fondo: ${Utils.formatCurrency(a)}`);
    Toast.success("Guardado");
  },

  registerExpense() {
    const a = Utils.parseFormattedNumber(
      document.getElementById("expenseAmount").value,
    );
    const d = document.getElementById("expenseDetail").value.trim();
    const cat = this.state.selectedExpenseCategory;
    if (!a || a <= 0) {
      Toast.error("Monto");
      return;
    }
    if (!cat) {
      Toast.error("Categoría");
      return;
    }
    this.state.expenses.push({
      id: Utils.generateId(),
      timestamp: Utils.now(),
      amount: a,
      category: cat,
      detail: d,
    });
    document.getElementById("expenseAmount").value = "";
    document.getElementById("expenseDetail").value = "";
    document
      .querySelectorAll("#expenseCategories .category-btn")
      .forEach((b) => b.classList.remove("active"));
    this.state.selectedExpenseCategory = null;
    this.saveState();
    this.render();
    this.logActivity(`Gasto: ${Utils.formatCurrency(a)} - ${cat}`);
    Toast.success("Gasto registrado");
  },

  updateArqueoPreview() {
    const physical =
      Utils.parseFormattedNumber(
        document.getElementById("cashCountPhysical").value,
      ) || 0;
    const totalEfectivo = this.state.sales.reduce(
      (t, s) => t + this.saleCash(s),
      0,
    );
    const totalGastos = this.state.expenses.reduce((t, e) => t + e.amount, 0);
    const expected = totalEfectivo - totalGastos + this.state.cashFund;
    const diff = physical - expected;
    document.getElementById("cashExpectedArqueo").textContent =
      Utils.formatCurrency(expected);
    document.getElementById("cashDifference").textContent =
      Utils.formatCurrency(diff);
    document.getElementById("cashDifference").style.color =
      diff === 0
        ? "var(--success)"
        : diff > 0
          ? "var(--info)"
          : "var(--danger)";
  },

  registerArqueo() {
    const physical = Utils.parseFormattedNumber(
      document.getElementById("cashCountPhysical").value,
    );
    const totalEfectivo = this.state.sales.reduce(
      (t, s) => t + this.saleCash(s),
      0,
    );
    const totalGastos = this.state.expenses.reduce((t, e) => t + e.amount, 0);
    const expected = totalEfectivo - totalGastos + this.state.cashFund;
    const diff = physical - expected;
    this.state.arqueos.push({
      id: Utils.generateId(),
      timestamp: Utils.now(),
      physical,
      expected,
      difference: diff,
      user: this.currentRole,
    });
    document.getElementById("cashCountPhysical").value = "";
    this.saveState();
    this.render();
    this.logActivity(
      `Arqueo: ${Utils.formatCurrency(physical)}, diff ${Utils.formatCurrency(diff)}`,
    );
    Toast.success(
      diff === 0
        ? "✅ Perfecto"
        : diff > 0
          ? `⚠️ Sobrante: ${Utils.formatCurrency(diff)}`
          : `⚠️ Faltante: ${Utils.formatCurrency(Math.abs(diff))}`,
    );
  },

  showResetDayModal() {
    if (this.currentRole !== "admin") {
      Toast.error("Solo admin");
      return;
    }
    document.getElementById("leftoverRawForTomorrow").value = Utils.formatQty(
      this.state.chickens.raw || 0,
    );
    document.getElementById("leftoverCookedForTomorrow").value =
      Utils.formatQty(this.state.chickens.cooked || 0);
    document.getElementById("resetPassword").value = "";
    const open = this.openOrdersList ? this.openOrdersList() : [];
    const w = document.getElementById("resetOpenTables");
    if (w) {
      w.style.display = open.length ? "block" : "none";
      w.textContent = open.length
        ? `⚠️ Hay ${open.length} mesa(s) abiertas sin cobrar (${open.map((o) => this.orderLabel(o)).join(", ")}). No se borran: siguen abiertas y cuentan como venta cuando se cobren. Sus pollos ya se descontaron hoy; si mañana se cancelan, vuelven al inventario.`
        : "";
    }
    this.showModal("resetDayModal");
  },

  async resetDay() {
    const p = document.getElementById("resetPassword").value;
    const lr = Utils.parseQty(
      document.getElementById("leftoverRawForTomorrow").value,
    );
    const lc = Utils.parseQty(
      document.getElementById("leftoverCookedForTomorrow").value,
    );
    if (!(await Cloud.checkPassword(p))) {
      Toast.error("Incorrecta");
      return;
    }
    const cut = Utils.now() - 180 * 864e5;
    const oldStock = this.state.stockHistory.filter(
      (e) => (e.timestamp || 0) < cut,
    );
    const oldArq = this.state.arqueos.filter((e) => (e.timestamp || 0) < cut);
    const archive = {
      date: Utils.localDate(),
      sales: this.state.sales,
      expenses: this.state.expenses,
      chickens: this.state.chickens,
      usageHistory: this.state.usageHistory,
      mermas: this.state.mermas,
      totalChickensSold: this.state.totalChickensSold,
      cashFund: this.state.cashFund || 0,
      arqueosDia: this.state.arqueos.filter(
        (e) => (e.timestamp || 0) >= Utils.now() - 864e5,
      ),
      pendingSales: JSON.parse(JSON.stringify(this.state.pendingSales)),
      trimmed: { stockHistory: oldStock, arqueos: oldArq },
      archivedAt: Utils.now(),
    };
    const archives = Storage_get("archives", []);
    archives.push(archive);
    /* En el dispositivo solo se guardan los últimos 60 cierres (en la nube quedan todos):
       sin este límite el almacenamiento del navegador se llena y la app deja de guardar. */
    Storage_set("archives", archives.slice(-60));
    Cloud.pushArchive(archive);
    this.state.sales = [];
    this.state.expenses = [];
    this.state.mermas = [];
    this.state.stockHistory = this.state.stockHistory.filter(
      (e) => (e.timestamp || 0) >= cut,
    );
    this.state.arqueos = this.state.arqueos.filter(
      (e) => (e.timestamp || 0) >= cut,
    );
    this.state.chickens = { raw: lr, cooked: lc };
    this.state.usageHistory = [];
    this.state.totalChickensSold = 0;
    this.state.cashFund = 0;
    this.ventasDesgloseOpen = false;
    this.hideModal("resetDayModal");
    document.getElementById("resetPassword").value = "";
    this.saveState();
    this.render();
    this.logActivity("Día reseteado");
    Toast.success("✅ Nuevo día iniciado · fondo de caja en $0");
  },

  renderExpenses() {
    const c = document.getElementById("expensesList");
    if (this.state.expenses.length === 0) {
      c.innerHTML =
        '<div class="empty-state"><i class="fas fa-receipt"></i><p>Sin gastos</p></div>';
      return;
    }
    c.innerHTML = this.state.expenses
      .slice()
      .reverse()
      .map(
        (e) =>
          `<div class="sale-item"><div class="sale-info"><div class="sale-id">${e.category.toUpperCase()}</div><div class="sale-details">${Utils.formatDate(e.timestamp)}${e.detail ? ` - ${Utils.sanitizeInput(e.detail)}` : ""}</div></div><div class="sale-amount">${Utils.formatCurrency(e.amount)}</div></div>`,
      )
      .join("");
  },

  renderArqueos() {
    const c = document.getElementById("arqueosHistoryList");
    if (!this.state.arqueos || this.state.arqueos.length === 0) {
      c.innerHTML =
        '<div class="empty-state"><i class="fas fa-search"></i><p>Sin arqueos</p></div>';
      return;
    }
    c.innerHTML = this.state.arqueos
      .slice()
      .reverse()
      .map(
        (a) =>
          `<div class="sale-item">
            <div class="sale-info">
            <div class="sale-id">Arqueo</div>
            <div class="sale-details">${Utils.formatDate(a.timestamp)} - Físico: ${Utils.formatCurrency(a.physical)}</div></div><div class="sale-amount" style="color:${a.difference === 0 ? "var(--success)" : a.difference > 0 ? "var(--info)" : "var(--danger)"}">${a.difference === 0 ? "✅" : a.difference > 0 ? `+${Utils.formatCurrency(a.difference)}` : Utils.formatCurrency(a.difference)}</div></div>`,
      )
      .join("");
  },
});
