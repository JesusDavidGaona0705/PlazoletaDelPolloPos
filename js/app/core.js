/* Núcleo de la aplicación: estado, guardado, renderizado general y eventos.
   Las demás áreas se añaden a POSApp.prototype desde los archivos de js/app/. */

class POSApp {
  constructor() {
    this.state = {
      cart: [],
      chickens: { raw: 0, cooked: 0 },
      cashFund: 0,
      sales: [],
      expenses: [],
      products: [],
      pendingSales: [],
      usageHistory: [],
      mermas: [],
      stockHistory: [],
      arqueos: [],
      clients: [],
      activityLog: [],
      currentSection: "home",
      selectedPaymentMethod: "efectivo",
      selectedOrderStatus: "pagado",
      selectedExpenseCategory: null,
      selectedUsageType: null,
      selectedMermaType: null,
      passwordCallback: null,
      selectedSellCategory: "all",
      selectedManageCategory: "all",
      tempVariants: [],
      tempImageData: null,
      editSaleTempItems: [],
      editSaleIsPending: false,
      totalChickensSold: 0,
      invoiceSeq: 0,
      dailyGoal: 30,
      categories: [],
      settings: [],
      openOrders: [],
      orderItems: [],
      migrations: {},
      selectedUsageSource: "cooked",
      discountType: "none",
      discountValue: 0,
      mixtoEfectivo: 0,
      mixtoTransferencia: 0,
    };
    this.currentRole = null;
    this.ventasDesgloseOpen = false;
    this.currentSaleDetail = null;
    this.init();
  }

  async init() {
    this.loadState();
    if (!this.state.products || this.state.products.length === 0) {
      this.state.products = this.getDefaultProducts();
      this.saveState();
    }
    if (!this.state.clients) this.state.clients = [];
    if (!this.state.mermas) this.state.mermas = [];
    if (!this.state.stockHistory) this.state.stockHistory = [];
    if (!this.state.arqueos) this.state.arqueos = [];
    if (!this.state.activityLog) this.state.activityLog = [];
    if (!this.state.dailyGoal) this.state.dailyGoal = 30;
    if (!this.state.categories) this.state.categories = [];
    if (!this.state.settings) this.state.settings = [];
    if (!Array.isArray(this.state.openOrders)) this.state.openOrders = [];
    if (!Array.isArray(this.state.orderItems)) this.state.orderItems = [];
    if (!this.state.migrations) this.state.migrations = {};
    this.ensureData(false);
    this.loadTheme();
    document.getElementById("loginScreen").classList.remove("hidden");
    document.getElementById("loadingScreen").classList.add("hidden");
    this.logActivity("Sistema iniciado");
    setInterval(() => this.autoBackup(), 5 * 60 * 1000);
    setInterval(() => Cloud.schedulePush(), 30000);
    this.setAccountsMode(Cloud.accountsFlag());
    PWA.register();
    Cloud.start(this);
  }

  loadState() {
    const s = Storage_get("pos_state");
    if (s) {
      this.state = { ...this.state, ...s };
      if (!this.state.products) this.state.products = [];
      Object.assign(this.state, {
        currentSection: "home",
        selectedPaymentMethod: "efectivo",
        selectedOrderStatus: "pagado",
        selectedExpenseCategory: null,
        selectedUsageType: null,
        selectedMermaType: null,
        selectedUsageSource: "cooked",
        passwordCallback: null,
        selectedSellCategory: "all",
        selectedManageCategory: "all",
        tempVariants: [],
        tempImageData: null,
        editSaleTempItems: [],
        editSaleIsPending: false,
        discountType: "none",
        discountValue: 0,
        mixtoEfectivo: 0,
        mixtoTransferencia: 0,
      });
    }
  }

  persistLocal() {
    /* Durante el cobro de una mesa el carrito tiene los productos de la mesa: se guarda el
       carrito real para que, si la app se cierra ahí, no se vuelvan a cobrar ni a descontar. */
    const h = this.checkoutSource && this._held;
    Storage_set(
      "pos_state",
      h
        ? {
            ...this.state,
            cart: h.cart || [],
            discountType: h.discountType || "none",
            discountValue: h.discountValue || 0,
          }
        : this.state,
    );
  }

  saveState() {
    this.persistLocal();
    Cloud.schedulePush();
  }

  logActivity(msg) {
    if (!this.state.activityLog) this.state.activityLog = [];
    this.state.activityLog.unshift({
      time: Utils.now(),
      user: this.currentRole || "sistema",
      msg,
    });
    if (this.state.activityLog.length > 200)
      this.state.activityLog = this.state.activityLog.slice(0, 200);
  }

  showModal(id) {
    document.getElementById(id).classList.add("active");
    document.body.classList.add("modal-open");
    setTimeout(() => setupMoneyInputs(), 50);
  }

  hideModal(id) {
    document.getElementById(id).classList.remove("active");
    /* Si se cierra el cobro de una mesa sin cobrar, vuelve el carrito que se estaba armando */
    if (id === "checkoutModal" && this.checkoutSource) this.restoreHeldCart();
    if (!document.querySelector(".modal-overlay.active"))
      document.body.classList.remove("modal-open");
  }

  loadTheme() {
    const t = Storage_get("theme", "dark");
    document.documentElement.setAttribute("data-theme", t);
    const i = document.querySelector("#themeToggle i");
    if (i) i.className = t === "light" ? "fas fa-moon" : "fas fa-sun";
  }

  toggleTheme() {
    const h = document.documentElement,
      t = h.getAttribute("data-theme"),
      n = t === "light" ? "dark" : "light";
    h.setAttribute("data-theme", n);
    const i = document.querySelector("#themeToggle i");
    if (i) i.className = n === "light" ? "fas fa-moon" : "fas fa-sun";
    Storage_set("theme", n);
  }

  autoBackup() {
    const backup = {
      state: {
        ...this.state,
        activityLog: [],
        tempImageData: null,
        products: this.state.products.map((p) => ({ ...p, image: null })),
      },
      timestamp: Utils.now(),
    };
    Storage_set("pos_backup_auto", backup);
    const bi = document.getElementById("backupIndicator");
    bi.classList.add("show");
    setTimeout(() => bi.classList.remove("show"), 2000);
  }

  render() {
    if (this.ensureData(false)) this.saveState();
    this.renderDashboard();
    this.renderSellSections();
    this.renderCart();
    this.renderTables();
    if (
      document.getElementById("tableDetailModal")?.classList.contains("active")
    )
      this.renderTableDetail();
    if (this.currentRole === "admin") {
      this.renderCategoryTabs();
      this.renderProductsManage();
      this.renderInventory();
      this.renderExpenses();
      this.renderPendingSales();
      this.renderUsageHistory();
      this.renderMermas();
      this.renderStockHistory();
      this.renderArqueos();
      this.renderActivityLog();
      this.renderReports();
      this.renderClients();
    }
    this.renderRecentSales();
  }

  setupEventListeners() {
    document
      .getElementById("themeToggle")
      .addEventListener("click", () => this.toggleTheme());
    document.querySelectorAll("#paymentMethods .payment-method").forEach((m) =>
      m.addEventListener("click", () => {
        document
          .querySelectorAll("#paymentMethods .payment-method")
          .forEach((x) => x.classList.remove("active"));
        m.classList.add("active");
        this.state.selectedPaymentMethod = m.dataset.method;
        document.getElementById("cashReceivedGroup").style.display =
          m.dataset.method === "efectivo" ? "block" : "none";
        document.getElementById("mixtoPaymentSection").style.display =
          m.dataset.method === "mixto" ? "block" : "none";
        this.updateChangeDisplay();
      }),
    );
    document.querySelectorAll("#statusMethods .payment-method").forEach((m) =>
      m.addEventListener("click", () => {
        document
          .querySelectorAll("#statusMethods .payment-method")
          .forEach((x) => x.classList.remove("active"));
        m.classList.add("active");
        this.state.selectedOrderStatus = m.dataset.status;
        this.updateCheckoutRules();
      }),
    );
    document.querySelectorAll("#expenseCategories .category-btn").forEach((b) =>
      b.addEventListener("click", () => {
        document
          .querySelectorAll("#expenseCategories .category-btn")
          .forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        this.state.selectedExpenseCategory = b.dataset.category;
      }),
    );
    document.querySelectorAll(".usage-type-btn").forEach((b) =>
      b.addEventListener("click", () => {
        document
          .querySelectorAll(".usage-type-btn")
          .forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        this.state.selectedUsageType = b.dataset.type;
        this.syncUsageDeduct(b.dataset.type);
      }),
    );
    document.querySelectorAll(".merma-type-btn").forEach((b) =>
      b.addEventListener("click", () => {
        document
          .querySelectorAll(".merma-type-btn")
          .forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        this.state.selectedMermaType = b.dataset.type;
      }),
    );
    document.querySelectorAll(".modal-overlay").forEach((o) =>
      o.addEventListener("click", (e) => {
        if (e.target === o) this.hideModal(o.id);
      }),
    );
    document
      .getElementById("adminPassword")
      .addEventListener("keypress", (e) => {
        if (e.key === "Enter") this.verifyPassword();
      });
    document
      .getElementById("resetPassword")
      .addEventListener("keypress", (e) => {
        if (e.key === "Enter") this.resetDay();
      });
    document
      .getElementById("loginPassword")
      .addEventListener("keypress", (e) => {
        if (e.key === "Enter") this.confirmLogin();
      });
    document.querySelectorAll("#productsSubTabs .category-tab").forEach((t) =>
      t.addEventListener("click", () => {
        document
          .querySelectorAll("#productsSubTabs .category-tab")
          .forEach((x) => x.classList.remove("active"));
        t.classList.add("active");
        const s = t.dataset.sub;
        document.getElementById("productsManageView").style.display =
          s === "manage" ? "block" : "none";
        document.getElementById("productsInventoryView").style.display =
          s === "inventory" ? "block" : "none";
        document.getElementById("productsMermasView").style.display =
          s === "mermas" ? "block" : "none";
        document.getElementById("productsUsageView").style.display =
          s === "usage" ? "block" : "none";
      }),
    );
    ["chickensRaw", "chickensCooked"].forEach((id) => {
      document
        .getElementById(id)
        .addEventListener("input", () => this.updateChickenTotalPreview());
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "F2" && this.state.currentSection === "sell") {
        e.preventDefault();
        this.showCheckout();
      }
      if (e.key === "Escape") {
        document
          .querySelectorAll(".modal-overlay.active")
          .forEach((m) => this.hideModal(m.id));
        document.body.classList.remove("modal-open");
      }
    });
  }
}
