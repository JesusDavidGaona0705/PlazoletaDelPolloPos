/* Acceso, sesión, navegación y contraseñas. */

Object.assign(POSApp.prototype, {
  loginAs(role) {
    this.pendingRole = role;
    if (role === "employee") {
      this.currentRole = "employee";
      this.finishLogin();
    } else {
      document.getElementById("loginPasswordSection").style.display = "block";
      document.getElementById("loginPassword").value = "";
      document.getElementById("loginPasswordError").style.display = "none";
      document.getElementById("loginPassword").focus();
    }
  },

  confirmLogin() {
    const p = document.getElementById("loginPassword").value;
    if (checkAdminPassword(p)) {
      this.currentRole = "admin";
      this.finishLogin();
    } else {
      document.getElementById("loginPasswordError").style.display = "block";
      Toast.error("Contraseña incorrecta");
    }
  },

  cancelLogin() {
    document.getElementById("loginPasswordSection").style.display = "none";
    this.pendingRole = null;
  },

  setAccountsMode(on) {
    this.accountsOn = !!on;
    const rb = document.querySelectorAll(".login-role-btn"),
      ps = document.getElementById("loginPasswordSection"),
      al = document.getElementById("accountLogin"),
      tg = document.getElementById("accToggle");
    if (!al) return;
    this.renderKnownAccounts();
    if (on) {
      rb.forEach((b) => (b.style.display = "none"));
      ps.style.display = "none";
      al.style.display = "block";
      tg.style.display = "none";
    } else {
      const f = !!this.forceAccountForm;
      rb.forEach((b) => (b.style.display = f ? "none" : ""));
      if (f) ps.style.display = "none";
      al.style.display = f ? "block" : "none";
      tg.style.display = Cloud.available() ? "block" : "none";
      tg.textContent = f ? "← Volver al acceso local" : "Entrar con una cuenta";
    }
  },

  /* Sesión recordada por Firebase: se ofrece, no se usa sola. email = null la oculta. */
  showSessionOffer(email) {
    const box = document.getElementById("accSession"),
      form = document.getElementById("accForm");
    if (!box || !form) return;
    if (email) {
      document.getElementById("accSessionEmail").textContent = email;
      box.style.display = "block";
      form.style.display = "none";
    } else {
      box.style.display = "none";
      form.style.display = "block";
      this.renderKnownAccounts();
    }
  },

  /* Correos que ya entraron en este equipo: tocar uno lo escribe en el formulario. */
  renderKnownAccounts() {
    const box = document.getElementById("accKnown");
    if (!box) return;
    const list =
      typeof Cloud !== "undefined" && Cloud.knownEmails
        ? Cloud.knownEmails()
        : [];
    if (!list.length) {
      box.innerHTML = "";
      return;
    }
    box.innerHTML =
      '<div class="acc-known-label">Cuentas usadas en este equipo</div>' +
      list
        .map(
          (e) =>
            `<div class="acc-chip"><button type="button" class="acc-chip-pick" data-email="${Utils.sanitizeInput(e)}">${Utils.sanitizeInput(e)}</button><button type="button" class="acc-chip-x" data-forget="${Utils.sanitizeInput(e)}" aria-label="Quitar de la lista">×</button></div>`,
        )
        .join("");
    box.onclick = (ev) => {
      const pick = ev.target.closest("[data-email]"),
        x = ev.target.closest("[data-forget]");
      if (x) {
        Cloud.forgetEmail(x.dataset.forget);
        return;
      }
      if (pick) {
        document.getElementById("accEmail").value = pick.dataset.email;
        const p = document.getElementById("accPass");
        p.value = "";
        p.focus();
      }
    };
  },

  toggleAccountLogin() {
    this.forceAccountForm = !this.forceAccountForm;
    this.setAccountsMode(this.accountsOn);
  },

  accountError(m) {
    const e = document.getElementById("accError");
    if (e) {
      e.textContent = m;
      e.style.display = "block";
    }
    Toast.error(m);
  },

  loginFromCloud(role, email) {
    this.accountEmail = email;
    const hidden = document
      .getElementById("loginScreen")
      .classList.contains("hidden");
    if (hidden && this.currentRole) {
      if (this.currentRole !== role) {
        this.currentRole = role;
        this.setupAppForRole();
      }
      return;
    }
    this.currentRole = role;
    this.finishLogin();
  },

  forceLogout() {
    this.currentRole = null;
    delete document.body.dataset.section;
    document.body.classList.remove("modal-open");
    document.getElementById("loginScreen").classList.remove("hidden");
    document
      .querySelectorAll(".section")
      .forEach((s) => s.classList.remove("active"));
  },

  finishLogin() {
    document.getElementById("loginScreen").classList.add("hidden");
    document.getElementById("loadingScreen").classList.remove("hidden");
    setTimeout(() => {
      document.getElementById("loadingScreen").classList.add("hidden");
      this.setupAppForRole();
      Toast.success(
        `Bienvenido ${this.currentRole === "admin" ? "Admin" : "Empleado"}`,
      );
    }, 400);
  },

  logout() {
    if (!confirm("¿Cerrar sesión?")) return;
    this.currentRole = null;
    Cloud.onLogout();
    delete document.body.dataset.section;
    document.body.classList.remove("modal-open");
    this.ventasDesgloseOpen = false;
    document.getElementById("loginScreen").classList.remove("hidden");
    document.getElementById("loginPasswordSection").style.display = "none";
    document
      .querySelectorAll(".section")
      .forEach((s) => s.classList.remove("active"));
  },

  setupAppForRole() {
    const rb = document.getElementById("roleBadge");
    rb.textContent = this.currentRole === "admin" ? "Admin" : "Empleado";
    rb.className = `role-badge ${this.currentRole}`;
    document.getElementById("welcomeRole").textContent =
      this.currentRole === "admin" ? "Modo Administrador" : "Modo Empleado";
    document
      .querySelectorAll(".admin-only")
      .forEach(
        (el) => (el.style.display = this.currentRole === "admin" ? "" : "none"),
      );
    document.getElementById("adminChickenActions").style.display =
      this.currentRole === "admin" ? "grid" : "none";
    document.getElementById("goalCard").style.display =
      this.currentRole === "admin" ? "" : "none";
    if (this.currentRole === "admin" && this.ensureData(true)) this.saveState();
    this.buildNavigation();
    this.showSection("home");
    setTimeout(() => setupMoneyInputs(), 100);
  },

  buildNavigation() {
    const n = document.getElementById("navItems");
    const mesas = `<button
          class="nav-item"
          data-section="tables"><i class="fas fa-chair"></i><span>Mesas</span><span
          class="nav-badge"
          id="tablesBadge"
          style="display:none">0</span></button>`;
    if (this.currentRole === "employee") {
      n.innerHTML = `<button
          class="nav-item active"
          data-section="home"><i class="fas fa-home"></i><span>Inicio</span></button><button
          class="nav-item"
          data-section="sell"><i class="fas fa-shopping-cart"></i><span>Vender</span></button>${mesas}`;
    } else {
      n.innerHTML = `<button
          class="nav-item active"
          data-section="home"><i class="fas fa-home"></i><span>Inicio</span></button><button
          class="nav-item"
          data-section="sell"><i class="fas fa-shopping-cart"></i><span>Vender</span></button>${mesas}<button
          class="nav-item"
          data-section="cash"><i class="fas fa-cash-register"></i><span>Caja</span><span
          class="nav-badge"
          id="pendingBadge"
          style="display:none">0</span></button><button
          class="nav-item"
          data-section="products"><i class="fas fa-utensils"></i><span>Prod.</span></button><button
          class="nav-item"
          data-section="reports"><i class="fas fa-chart-bar"></i><span>Reportes</span></button>`;
    }
    n.querySelectorAll(".nav-item").forEach((i) =>
      i.addEventListener("click", () => this.showSection(i.dataset.section)),
    );
  },

  showSection(name) {
    if (
      this.currentRole !== "admin" &&
      (name === "cash" ||
        name === "products" ||
        name === "reports" ||
        name === "clients")
    ) {
      Toast.error("Solo admin");
      return;
    }
    document
      .querySelectorAll(".nav-item")
      .forEach((i) => i.classList.toggle("active", i.dataset.section === name));
    document
      .querySelectorAll(".section")
      .forEach((s) => s.classList.remove("active"));
    const map = {
      home: "homeSection",
      sell: "sellSection",
      products: "productsSection",
      cash: "cashSection",
      reports: "reportsSection",
      clients: "clientsSection",
      tables: "tablesSection",
    };
    const id = map[name];
    if (id) {
      document.getElementById(id).classList.add("active");
      this.state.currentSection = name;
      document.body.dataset.section = name;
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
    this.render();
    setTimeout(() => setupMoneyInputs(), 50);
  },

  requestPasswordForCashFund() {
    if (this.currentRole !== "admin") {
      Toast.error("Solo admin");
      return;
    }
    this.state.passwordCallback = () => {
      this.showModal("cashFundModal");
      document.getElementById("cashFundInput").value = Utils.formatNumber(
        this.state.cashFund || 0,
      );
    };
    document.getElementById("adminPassword").value = "";
    document.getElementById("passwordError").style.display = "none";
    document.getElementById("passwordModalDesc").textContent = "PIN fondo caja";
    this.showModal("passwordModal");
  },

  async verifyPassword() {
    const p = document.getElementById("adminPassword").value;
    if (await Cloud.checkPassword(p)) {
      this.hideModal("passwordModal");
      document.getElementById("passwordError").style.display = "none";
      if (this.state.passwordCallback) {
        this.state.passwordCallback();
        this.state.passwordCallback = null;
      }
    } else {
      document.getElementById("passwordError").style.display = "block";
      Toast.error("Incorrecta");
    }
  },
});
