/* Pantalla de venta: catálogo, carrito y cobro. */

Object.assign(POSApp.prototype, {
  renderProductCard(p) {
    const info = this.getChickenInfo(p);
    let stockText = `Stock:${Utils.formatNumber(p.stock)}`;
    let lowStock = false;
    let noStock = false;
    let stockAlert = "";
    if (info) {
      const avail = this.state.chickens[info.source] || 0;
      stockText = `${Utils.formatChickens(avail)} ${SOURCE_LABEL[info.source]}`;
      noStock = avail + 1e-9 < info.units;
    } else if (p.stock <= 3) {
      lowStock = true;
      if (p.stock > 0) stockAlert = '<div class="stock-alert">⚠️</div>';
    }
    const classes = [
      "product-card",
      lowStock ? "low-stock" : "",
      noStock ? "out-of-stock" : "",
      p.favorite ? "favorite" : "",
    ].join(" ");
    const picture = p.image
      ? `<img src="${p.image}" class="product-image">`
      : `<div class="product-image-placeholder">${Utils.sanitizeInput(this.emojiOf(p))}</div>`;
    return `
      <div class="${classes}" onclick="app.handleProductClick('${p.id}')">
        ${stockAlert}
        ${p.hasVariants ? '<div class="product-variants-badge"><i class="fas fa-list"></i></div>' : ""}
        ${picture}
        <div class="product-name">${Utils.sanitizeInput(p.name)}</div>
        <div class="product-price">${Utils.formatCurrency(p.price)}</div>
        <div class="product-stock">${stockText}</div>
      </div>`;
  },

  /* Una sección por cada categoría que tenga productos activos. */
  renderSellSections() {
    const box = document.getElementById("sellSections");
    if (!box) return;
    const sections = this.getCategories()
      .map((c) => ({ c, items: this.getProductsByCategory(c.id) }))
      .filter((s) => s.items.length > 0);
    if (sections.length === 0) {
      box.innerHTML =
        '<div class="empty-state"><i class="fas fa-box-open"></i><p>Sin productos</p></div>';
      return;
    }
    box.innerHTML = sections
      .map(({ c, items }) => {
        const kind = this.categoryKind(c.id);
        let count = `${items.length} productos`;
        if (kind === "asado")
          count = `${Utils.formatChickens(this.state.chickens.cooked)} asados`;
        if (kind === "broaster")
          count = `${Utils.formatChickens(this.state.chickens.raw)} crudos`;
        return `
        <div class="product-section" data-category="${Utils.sanitizeInput(c.id)}">
          <div class="product-section-header" style="border-left-color:${this.categoryColor(c)}">
            <span class="section-emoji">${Utils.sanitizeInput(c.emoji)}</span>
            <span class="section-title">${Utils.sanitizeInput(c.name)}</span>
            <span class="section-count">${count}</span>
          </div>
          <div class="products-grid">${items.map((p) => this.renderProductCard(p)).join("")}</div>
        </div>`;
      })
      .join("");
  },

  handleProductClick(pid) {
    const p = this.state.products.find((x) => x.id === pid);
    if (!p) return;
    const info = this.getChickenInfo(p);
    if (info) {
      const avail = this.state.chickens[info.source] || 0;
      if (avail + 1e-9 < info.units) {
        const msg = `⚠️ Solo hay ${Utils.formatChickens(avail)} ${SOURCE_LABEL[info.source]}. ¿Vender de todos modos?`;
        if (!confirm(msg)) return;
      }
    }
    if (p.hasVariants && p.variants.length > 0) this.showVariantModal(p);
    else this.addToCart(pid, null);
  },

  showVariantModal(p) {
    document.getElementById("variantModalTitle").textContent = p.name;
    document.getElementById("variantModalContent").innerHTML = `<p
          style="font-size:.8rem;color:var(--tx2);margin-bottom:.6rem">Elige opción:</p>
        <div class="variant-options">${p.variants
          .map((v) => {
            const tp = p.price + v.price;
            return `<div class="variant-option" onclick="app.selectVariant('${p.id}','${v.id}')"><div class="variant-emoji">${Utils.sanitizeInput(v.emoji || "🍽️")}</div><div class="variant-option-info"><div class="variant-option-name">${Utils.sanitizeInput(v.name)}</div><div class="variant-option-price">${Utils.formatCurrency(tp)}</div></div></div>`;
          })
          .join("")}</div>`;
    this.showModal("variantModal");
  },

  selectVariant(pid, vid) {
    this.addToCart(pid, vid);
    this.hideModal("variantModal");
  },

  addToCart(pid, vid) {
    const p = this.state.products.find((x) => x.id === pid);
    if (!p) return;
    let v = null,
      fp = p.price,
      dn = p.name;
    if (vid) {
      v = p.variants.find((x) => x.id === vid);
      if (v) {
        fp = p.price + v.price;
        dn = `${p.name} - ${v.name}`;
      }
    }
    const ck = vid ? `${pid}-${vid}` : pid;
    const ex = this.state.cart.find((x) => x.cartKey === ck);
    if (ex) ex.quantity++;
    else
      this.state.cart.push({
        cartKey: ck,
        productId: pid,
        variantId: vid,
        name: dn,
        price: fp,
        quantity: 1,
        emoji: (v && v.emoji) || this.emojiOf(p),
        image: p.image,
        ...this.chickenFields(p),
      });
    this.renderCart();
    Toast.success("Agregado");
    if (navigator.vibrate)
      try {
        navigator.vibrate(12);
      } catch (e) {}
  },

  removeFromCart(ck) {
    this.state.cart = this.state.cart.filter((x) => x.cartKey !== ck);
    this.renderCart();
  },

  updateCartQuantity(ck, d) {
    const i = this.state.cart.find((x) => x.cartKey === ck);
    if (i) {
      i.quantity += d;
      if (i.quantity <= 0) this.removeFromCart(ck);
      else this.renderCart();
    }
  },

  clearCart() {
    if (this.state.cart.length === 0) return;
    this.state.cart = [];
    this.state.discountType = "none";
    this.state.discountValue = 0;
    document.getElementById("discountType").value = "none";
    document.getElementById("discountValue").value = "";
    this.renderCart();
    Toast.info("Vaciado");
  },

  scrollToCart() {
    const el = document.getElementById("cartPanel");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  },

  getCartSubtotal() {
    return this.state.cart.reduce((t, i) => t + i.price * i.quantity, 0);
  },

  getCartDiscount() {
    const sub = this.getCartSubtotal();
    if (this.state.discountType === "percent")
      return sub * (this.state.discountValue / 100);
    if (this.state.discountType === "fixed")
      return Math.min(this.state.discountValue, sub);
    return 0;
  },

  getCartTotal() {
    return Math.max(0, this.getCartSubtotal() - this.getCartDiscount());
  },

  applyDiscount() {
    this.state.discountType = document.getElementById("discountType").value;
    this.state.discountValue = Utils.parseFormattedNumber(
      document.getElementById("discountValue").value,
    );
    this.renderCart();
  },

  showCheckout() {
    if (this.state.cart.length === 0) {
      Toast.warning("Vacío");
      return;
    }
    document.getElementById("checkoutTotalDisplay").textContent =
      Utils.formatCurrency(this.getCartTotal());
    document.getElementById("checkoutDiscountInfo").textContent =
      this.getCartDiscount() > 0
        ? `Desc: -${Utils.formatCurrency(this.getCartDiscount())}`
        : "";
    document.getElementById("cashReceived").value = "";
    document.getElementById("cashDisplay").textContent = "$0";
    document.getElementById("changeDisplayContainer").innerHTML = "";
    document.getElementById("mixtoEfectivo").value = "";
    document.getElementById("mixtoTransferencia").value = "";
    document.getElementById("mixtoTotalCubierto").textContent = "$0";
    const cs = document.getElementById("checkoutClient");
    cs.innerHTML =
      '<option value="">General</option>' +
      this.state.clients
        .map(
          (c) =>
            `<option value="${c.id}">${Utils.sanitizeInput(c.name)}</option>`,
        )
        .join("");
    this.state.selectedOrderStatus = "pagado";
    document
      .querySelectorAll("#statusMethods .payment-method")
      .forEach((x) =>
        x.classList.toggle("active", x.dataset.status === "pagado"),
      );
    this.updateCheckoutRules();
    this.renderQuickCashButtons();
    this.showModal("checkoutModal");
  },

  /* Cliente obligatorio cuando la venta queda debiendo. */
  fillCheckoutClients(selectId) {
    const cs = document.getElementById("checkoutClient");
    const keep = selectId || cs.value;
    cs.innerHTML =
      '<option value="">General</option>' +
      this.state.clients
        .map(
          (c) =>
            `<option value="${c.id}">${Utils.sanitizeInput(c.name)}</option>`,
        )
        .join("");
    if (keep && this.state.clients.some((c) => c.id === keep)) cs.value = keep;
  },

  updateCheckoutRules() {
    const pending = this.state.selectedOrderStatus === "pendiente";
    const cs = document.getElementById("checkoutClient");
    const general = cs.options[0];
    general.textContent = pending ? "— Elige el cliente —" : "General";
    document.getElementById("clientRequiredMark").textContent = pending
      ? "*"
      : "";
    document.getElementById("clientRequiredHint").style.display =
      pending && !cs.value ? "block" : "none";
    cs.parentElement.classList.toggle("invalid", pending && !cs.value);
    const cashGroup = document.getElementById("cashReceivedGroup");
    if (cashGroup && pending) cashGroup.style.opacity = ".55";
    else if (cashGroup) cashGroup.style.opacity = "";
  },

  openClientFromCheckout() {
    this.openClientModal();
    this._clientFromCheckout = true;
  },

  renderQuickCashButtons() {
    const t = this.getCartTotal(),
      s = [t];
    [1000, 2000, 5000, 10000, 20000, 50000, 100000].forEach((r) => {
      const rd = Math.ceil(t / r) * r;
      if (rd > t && !s.includes(rd)) s.push(rd);
    });
    const u = [...new Set(s)].sort((a, b) => a - b).slice(0, 8);
    document.getElementById("quickCashBtns").innerHTML = u
      .map(
        (v) =>
          `<button class="quick-cash-btn" onclick="app.setQuickCash(${v})">${Utils.formatCurrency(v)}</button>`,
      )
      .join("");
  },

  setQuickCash(a) {
    document.getElementById("cashReceived").value = Utils.formatNumber(a);
    this.updateChangeDisplay();
  },

  updateChangeDisplay() {
    const t = this.getCartTotal();
    const cash = Utils.parseFormattedNumber(
      document.getElementById("cashReceived").value,
    );
    const d = document.getElementById("cashDisplay"),
      c = document.getElementById("changeDisplayContainer");
    if (cash > 0) {
      d.textContent = Utils.formatCurrency(cash);
      const ch = cash - t;
      if (ch >= 0)
        c.innerHTML = `<div class="change-display">
          <div class="change-label">💰 Cambio</div>
          <div class="change-amount">${Utils.formatCurrency(ch)}</div></div>`;
      else
        c.innerHTML = `<div
            class="change-display insufficient">
          <div class="change-label">⚠️ Faltan</div>
          <div class="change-amount">${Utils.formatCurrency(Math.abs(ch))}</div></div>`;
    } else {
      d.textContent = "$0";
      c.innerHTML = "";
    }
  },

  updateMixto() {
    const e = Utils.parseFormattedNumber(
      document.getElementById("mixtoEfectivo").value,
    );
    const t = Utils.parseFormattedNumber(
      document.getElementById("mixtoTransferencia").value,
    );
    this.state.mixtoEfectivo = e;
    this.state.mixtoTransferencia = t;
    document.getElementById("mixtoTotalCubierto").textContent =
      Utils.formatCurrency(e + t);
  },

  async completeSale() {
    if (this.state.cart.length === 0) {
      this.hideModal("checkoutModal");
      Toast.warning("Carrito vacío");
      return;
    }
    const cid = document.getElementById("checkoutClient").value;
    const client = this.state.clients.find((c) => c.id === cid);
    if (this.state.selectedOrderStatus === "pendiente" && !client) {
      Toast.error("Elige o registra al cliente: la venta queda debiendo");
      this.updateCheckoutRules();
      document.getElementById("checkoutClient").focus();
      return;
    }
    const customerName = client ? client.name : "Cliente";
    const total = this.getCartTotal();
    const discount = this.getCartDiscount();
    let pm = this.state.selectedPaymentMethod;
    let cashReceived = Utils.parseFormattedNumber(
      document.getElementById("cashReceived").value,
    );
    let mixtoE = this.state.mixtoEfectivo,
      mixtoT = this.state.mixtoTransferencia;
    const pagado = this.state.selectedOrderStatus === "pagado";
    if (pm === "mixto") {
      if (pagado && mixtoE + mixtoT < total) {
        Toast.error("Insuficiente");
        return;
      }
      cashReceived = mixtoE + mixtoT;
    } else if (pm === "efectivo" && pagado && cashReceived < total) {
      Toast.error("Insuficiente");
      return;
    }
    const sale = {
      id: Utils.generateId(),
      number: this.nextInvoiceNumber(),
      by: this.currentUserLabel(),
      timestamp: Utils.now(),
      customer: customerName,
      clientId: cid || null,
      items: [...this.state.cart],
      total,
      discount,
      paymentMethod: pm,
      cashReceived,
      mixtoEfectivo: pm === "mixto" ? mixtoE : 0,
      mixtoTransferencia: pm === "mixto" ? mixtoT : 0,
      status: this.state.selectedOrderStatus,
      change:
        pm === "efectivo" && cashReceived
          ? Math.max(0, cashReceived - total)
          : 0,
      notes: document.getElementById("orderNotes")?.value || "",
    };
    if (sale.status === "pagado") {
      this.state.sales.push(sale);
      Toast.success("✅ Venta");
    } else {
      this.state.pendingSales.push(sale);
      Toast.info("Pendiente");
    }
    this.applySaleInventory(this.state.cart, -1);
    this.state.cart = [];
    this.state.discountType = "none";
    this.state.discountValue = 0;
    this.renderCart();
    this.hideModal("checkoutModal");
    if (document.getElementById("orderNotes"))
      document.getElementById("orderNotes").value = "";
    this.saveState();
    this.render();
    this.logActivity(`Venta ${sale.status}: ${Utils.formatCurrency(total)}`);
    this.afterSale(sale);
  },

  renderCart() {
    const c = document.getElementById("cartItems");
    document.getElementById("cartCount").textContent =
      `(${this.state.cart.length})`;
    if (this.state.cart.length === 0) {
      c.innerHTML =
        '<div class="empty-state"><i class="fas fa-shopping-basket"></i><p>Toca productos</p></div>';
    } else {
      c.innerHTML = this.state.cart
        .map(
          (i) =>
            `<div class="cart-item"><div class="cart-item-info"><div class="cart-item-name">${Utils.sanitizeInput(i.emoji || "📦")} ${Utils.sanitizeInput(i.name)}</div><div class="cart-item-price">${Utils.formatCurrency(i.price)} × ${Utils.formatNumber(i.quantity)} = ${Utils.formatCurrency(i.price * i.quantity)}</div>
              </div>
              <div class="cart-item-controls">
              <button class="qty-btn"
              onclick="app.updateCartQuantity('${i.cartKey}',-1)">−</button><span class="qty-value">${Utils.formatNumber(i.quantity)}</span><button class="qty-btn" onclick="app.updateCartQuantity('${i.cartKey}',1)">+</button></div></div>`,
        )
        .join("");
    }
    document.getElementById("cartSubtotal").textContent = Utils.formatCurrency(
      this.getCartSubtotal(),
    );
    const disc = this.getCartDiscount();
    document.getElementById("discountTotalRow").style.display =
      disc > 0 ? "flex" : "none";
    document.getElementById("cartDiscount").textContent =
      "-" + Utils.formatCurrency(disc);
    document.getElementById("cartTotal").textContent = Utils.formatCurrency(
      this.getCartTotal(),
    );
    const bar = document.getElementById("cartBar");
    if (bar) {
      const n = this.state.cart.reduce((q, i) => q + i.quantity, 0);
      bar.classList.toggle("has-items", n > 0);
      document.getElementById("cartBarCount").textContent =
        Utils.formatNumber(n);
      document.getElementById("cartBarTotal").textContent =
        Utils.formatCurrency(this.getCartTotal());
    }
  },
});
