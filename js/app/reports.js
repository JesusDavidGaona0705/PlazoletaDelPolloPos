/* Panel de inicio, reportes y registro de actividad. */

Object.assign(POSApp.prototype, {
  toggleVentasDesglose() {
    this.ventasDesgloseOpen = !this.ventasDesgloseOpen;
    const d = document.getElementById("ventasDesglose"),
      c = document.getElementById("ventasChevron");
    if (this.ventasDesgloseOpen) {
      d.classList.add("active");
      c.className = "fas fa-chevron-up";
    } else {
      d.classList.remove("active");
      c.className = "fas fa-chevron-down";
    }
  },

  exportReportPDF() {
    const totalVentas = this.state.sales.reduce((t, s) => t + s.total, 0);
    const totalGastos = this.state.expenses.reduce((t, e) => t + e.amount, 0);
    const w = window.open("", "_blank", "width=800,height=600");
    if (!w) {
      Toast.error("Permite las ventanas emergentes para imprimir");
      return;
    }
    w.document.write(
      `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta
          name="viewport"
          content="width=device-width,initial-scale=1"><title>Reporte</title><style>body{font-family:Arial,sans-serif;padding:20px}h1{color:#f59e0b}.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:15px;margin:20px 0}.stat{background:#f3f4f6;padding:15px;border-radius:8px;text-align:center}.stat-value{font-size:24px;font-weight:bold;color:#f59e0b}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f59e0b;color:#fff}</style></head><body><h1>🍗 La Plazoleta - Reporte</h1>
        <p>${new Date().toLocaleDateString("es-CO", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p><div class="stats"><div class="stat"><div>Ventas</div><div class="stat-value">${Utils.formatCurrency(totalVentas)}</div></div><div class="stat"><div>Transacciones</div><div class="stat-value">${Utils.formatNumber(this.state.sales.length)}</div>
        </div>
        <div class="stat">
        <div>Gastos</div>
        <div
            class="stat-value"
            style="color:#ef4444">${Utils.formatCurrency(totalGastos)}</div></div><div class="stat"><div>Pollos</div><div class="stat-value">${Utils.formatChickens(this.state.totalChickensSold || 0)}</div>
        </div>
        <div class="stat">
        <div>Efectivo</div>
        <div
            class="stat-value"
            style="color:#10b981">${Utils.formatCurrency(this.state.sales.reduce((t, s) => t + this.saleCash(s), 0))}</div>
        </div>
        <div class="stat">
        <div>Transferencia</div>
        <div
            class="stat-value"
            style="color:#3b82f6">${Utils.formatCurrency(this.state.sales.reduce((t, s) => t + this.saleTransfer(s), 0))}</div>
        </div>
        </div>
        <h2>Ventas</h2>
        <table>
        <thead>
        <tr>
        <th>Hora</th><th>Cliente</th><th>Items</th><th>Método</th><th>Total</th></tr>
        </thead>
        <tbody>${this.state.sales.map((s) => `<tr><td>${Utils.formatDate(s.timestamp)}</td><td>${Utils.sanitizeInput(s.customer)}</td><td>${s.items.length}</td><td>${s.paymentMethod}</td><td>${Utils.formatCurrency(s.total)}</td></tr>`).join("")}</tbody>
        </table>
        <h2>Gastos</h2>
        <table>
        <thead>
        <tr>
        <th>Hora</th><th>Categoría</th><th>Detalle</th><th>Monto</th></tr>
        </thead>
        <tbody>${this.state.expenses.map((e) => `<tr><td>${Utils.formatDate(e.timestamp)}</td><td>${e.category}</td><td>${Utils.sanitizeInput(e.detail || "")}</td><td>${Utils.formatCurrency(e.amount)}</td></tr>`).join("")}</tbody></table><p style="margin-top:30px;font-weight:bold;font-size:18px">Utilidad: ${Utils.formatCurrency(totalVentas - totalGastos)}</p></body></html>`,
    );
    w.document.close();
    setTimeout(() => {
      try {
        w.focus();
        w.print();
      } catch (e) {}
    }, 300);
    this.logActivity("Reporte PDF");
  },

  exportReportCSV() {
    const rows = [["Fecha", "Cliente", "Items", "Metodo", "Total", "Descuento"]];
    this.state.sales.forEach((s) =>
      rows.push([
        new Date(s.timestamp).toLocaleString("es-CO"),
        s.customer,
        s.items.length,
        s.paymentMethod,
        s.total,
        s.discount || 0,
      ]),
    );
    Utils.downloadCSV(`reporte_${Utils.localDate()}.csv`, rows);
    Toast.success("CSV exportado");
  },

  printReport() {
    this.exportReportPDF();
  },

  clearLog() {
    if (confirm("¿Limpiar log?")) {
      this.state.activityLog = [];
      this.saveState();
      this.render();
      Toast.success("Limpiado");
    }
  },

  renderDashboard() {
    const r = this.state.chickens.raw || 0,
      c = this.state.chickens.cooked || 0;
    document.getElementById("homeCrudos").textContent = Utils.formatChickens(r);
    document.getElementById("homeAsados").textContent = Utils.formatChickens(c);
    document.getElementById("homeTotal").textContent = Utils.formatChickens(r + c);
    document.getElementById("headerCrudos").textContent = Utils.formatChickens(r);
    document.getElementById("headerAsados").textContent = Utils.formatChickens(c);
    const cb = document.getElementById("cookBtn");
    if (cb) cb.disabled = r <= 0;
    const tv = this.state.sales.reduce((t, s) => t + s.total, 0);
    const te = this.state.sales.reduce((t, s) => t + this.saleCash(s), 0);
    const tt = this.state.sales.reduce((t, s) => t + this.saleTransfer(s), 0);
    document.getElementById("dashVentas").textContent = Utils.formatCurrency(tv);
    document.getElementById("ventasEfectivo").textContent = Utils.formatCurrency(te);
    document.getElementById("ventasTransferencia").textContent = Utils.formatCurrency(tt);
    document.getElementById("dashTransacciones").textContent = Utils.formatNumber(
      this.state.sales.length,
    );
    document.getElementById("dashPollosVendidos").textContent = Utils.formatChickens(
      this.state.totalChickensSold || 0,
    );
    document.getElementById("dashPendientes").textContent = Utils.formatNumber(
      this.state.pendingSales.length,
    );
    const te2 = this.state.expenses.reduce((t, e) => t + e.amount, 0);
    document.getElementById("cashExpected").textContent = Utils.formatCurrency(
      te - te2 + this.state.cashFund,
    );
    document.getElementById("cashFund").textContent = Utils.formatCurrency(this.state.cashFund);
    const pc = this.state.pendingSales.length;
    ["pendingBadge", "pendingBadgeCash"].forEach((id) => {
      const b = document.getElementById(id);
      if (b) {
        b.textContent = Utils.formatNumber(pc);
        b.style.display = pc > 0 ? "block" : "none";
      }
    });
    document.getElementById("goalCurrent").textContent = Utils.formatChickens(
      this.state.totalChickensSold || 0,
    );
    document.getElementById("goalTarget").textContent = Utils.formatNumber(this.state.dailyGoal);
    const pct = Math.min(
      100,
      Math.round(((this.state.totalChickensSold || 0) / this.state.dailyGoal) * 100),
    );
    document.getElementById("goalBar").style.width = pct + "%";
    document.getElementById("goalBar").textContent = pct >= 10 ? pct + "%" : "";
    const gm = document.getElementById("goalMessage");
    if (pct >= 100) gm.textContent = "🎉 ¡Meta alcanzada!";
    else if (pct >= 75) gm.textContent = "💪 ¡Casi!";
    else if (pct >= 50) gm.textContent = "👍 Vas bien";
    else gm.textContent = "🚀 ¡A vender!";
  },

  renderActivityLog() {
    const c = document.getElementById("activityLogList");
    if (!this.state.activityLog || this.state.activityLog.length === 0) {
      c.innerHTML =
        '<div class="empty-state"><i class="fas fa-history"></i><p>Sin actividades</p></div>';
      return;
    }
    c.innerHTML = this.state.activityLog
      .slice(0, 50)
      .map(
        (l) =>
          `<div class="log-item"><div class="log-time">${Utils.formatDateFull(l.time)} • ${l.user}</div><div>${Utils.sanitizeInput(l.msg)}</div></div>`,
      )
      .join("");
  },

  renderReports() {
    const tv = this.state.sales.reduce((t, s) => t + s.total, 0);
    const avg = this.state.sales.length > 0 ? tv / this.state.sales.length : 0;
    const prodCount = {};
    this.state.sales.forEach((s) =>
      s.items.forEach((i) => {
        prodCount[i.name] = (prodCount[i.name] || 0) + i.quantity;
      }),
    );
    const top = Object.entries(prodCount).sort((a, b) => b[1] - a[1])[0];
    document.getElementById("repVentasHoy").textContent = Utils.formatCurrency(tv);
    document.getElementById("repPromedio").textContent = Utils.formatCurrency(avg);
    document.getElementById("repTop").textContent = top
      ? `${top[0].substring(0, 10)} (${Utils.formatNumber(top[1])})`
      : "-";
    const lowStock = this.state.products.filter(
      (p) => p.category !== "pollo" && p.active !== false && p.stock <= 3,
    ).length;
    document.getElementById("repStockBajo").textContent = Utils.formatNumber(lowStock);
    const hourData = {};
    for (let i = 0; i < 24; i++) hourData[i] = 0;
    this.state.sales.forEach((s) => {
      const h = new Date(s.timestamp).getHours();
      hourData[h] = (hourData[h] || 0) + s.total;
    });
    const maxHour = Math.max(...Object.values(hourData), 1);
    document.getElementById("salesByHourChart").innerHTML =
      Object.entries(hourData)
        .filter(([h, v]) => v > 0)
        .map(
          ([h, v]) =>
            `<div class="chart-bar"><div class="chart-bar-label">${h}:00</div><div class="chart-bar-track"><div class="chart-bar-fill" style="width:${(v / maxHour) * 100}%">${Utils.formatCurrency(v)}</div></div></div>`,
        )
        .join("") || '<div class="empty-state"><p>Sin datos</p></div>';
    const top5 = Object.entries(prodCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    const maxTop = top5.length > 0 ? top5[0][1] : 1;
    document.getElementById("topProductsChart").innerHTML =
      top5.length === 0
        ? '<div class="empty-state"><i class="fas fa-chart-bar"></i><p>Sin datos</p></div>'
        : top5
            .map(
              ([n, v]) =>
                `<div class="chart-bar"><div class="chart-bar-label" style="width:100px">${Utils.sanitizeInput(n.substring(0, 12))}</div><div class="chart-bar-track"><div class="chart-bar-fill" style="width:${(v / maxTop) * 100}%">${Utils.formatNumber(v)}</div></div></div>`,
            )
            .join("");
  },
});
