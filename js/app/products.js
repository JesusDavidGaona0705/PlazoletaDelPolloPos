/* Productos, variantes e inventario. */

Object.assign(POSApp.prototype, {
  getDefaultProducts() {
    return [
      {
        id: "prod-1",
        name: "Pollo Entero",
        category: "pollo",
        price: 40000,
        stock: 0,
        emoji: "🍗",
        image: null,
        hasVariants: true,
        favorite: true,
        active: true,
        variants: [
          { id: "v1", name: "Con papas fritas", price: 5000, emoji: "🍟" },
          { id: "v2", name: "Con papa cocida", price: 0, emoji: "🥔" },
          { id: "v3", name: "Con chocheco", price: 0, emoji: "🌽" },
          { id: "v4", name: "Solo pollo", price: 0, emoji: "🍗" },
        ],
      },
      {
        id: "prod-2",
        name: "Medio Pollo",
        category: "pollo",
        price: 21000,
        stock: 0,
        emoji: "🍗",
        image: null,
        hasVariants: true,
        favorite: true,
        active: true,
        variants: [
          { id: "v1", name: "Con papas fritas", price: 3000, emoji: "🍟" },
          { id: "v2", name: "Con papa cocida", price: 0, emoji: "🥔" },
          { id: "v3", name: "Con chocheco", price: 0, emoji: "🌽" },
          { id: "v4", name: "Solo medio", price: 0, emoji: "🍗" },
        ],
      },
      {
        id: "prod-3",
        name: "Cuarto de Pollo",
        category: "pollo",
        price: 12000,
        stock: 0,
        emoji: "🍗",
        image: null,
        hasVariants: true,
        favorite: false,
        active: true,
        variants: [
          { id: "v1", name: "Con papas fritas", price: 3000, emoji: "🍟" },
          { id: "v2", name: "Con papa cocida", price: 0, emoji: "🥔" },
          { id: "v3", name: "Con chocheco", price: 0, emoji: "🌽" },
          { id: "v4", name: "Solo cuarto", price: 0, emoji: "🍗" },
        ],
      },
      {
        id: "prod-4",
        name: "Gaseosa 1.5L",
        category: "bebida",
        price: 4000,
        stock: 20,
        emoji: "🥤",
        image: null,
        hasVariants: false,
        active: true,
        variants: [],
      },
      {
        id: "prod-5",
        name: "Gaseosa 400ml",
        category: "bebida",
        price: 2000,
        stock: 30,
        emoji: "🥤",
        image: null,
        hasVariants: false,
        active: true,
        variants: [],
      },
      {
        id: "prod-6",
        name: "Jugo Natural",
        category: "bebida",
        price: 3000,
        stock: 15,
        emoji: "🧃",
        image: null,
        hasVariants: false,
        active: true,
        variants: [],
      },
      {
        id: "prod-7",
        name: "Agua",
        category: "bebida",
        price: 1500,
        stock: 25,
        emoji: "💧",
        image: null,
        hasVariants: false,
        active: true,
        variants: [],
      },
      {
        id: "prod-8",
        name: "Papas Fritas",
        category: "acompanante",
        price: 2000,
        stock: 50,
        emoji: "🍟",
        image: null,
        hasVariants: false,
        active: true,
        variants: [],
      },
      {
        id: "prod-9",
        name: "Papa Cocida",
        category: "acompanante",
        price: 1500,
        stock: 50,
        emoji: "🥔",
        image: null,
        hasVariants: false,
        active: true,
        variants: [],
      },
      {
        id: "prod-10",
        name: "Chocheco",
        category: "acompanante",
        price: 1500,
        stock: 50,
        emoji: "🌽",
        image: null,
        hasVariants: false,
        active: true,
        variants: [],
      },
    ];
  },

  async handleImageUpload(e) {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const c = await Utils.compressImage(f, 400, 0.7);
      this.state.tempImageData = c;
      const p = document.getElementById("imagePreview");
      p.src = c;
      p.style.display = "block";
    } catch (err) {
      Toast.error("Error imagen");
    }
  },

  toggleVariantsForm() {
    document.getElementById("variantsFormSection").style.display =
      document.getElementById("productHasVariants").checked ? "block" : "none";
  },

  addVariantToForm() {
    const n = document.getElementById("variantName").value.trim();
    const p = Utils.parseFormattedNumber(
      document.getElementById("variantPrice").value,
    );
    const e = document.getElementById("variantEmoji").value.trim() || "";
    if (!n) {
      Toast.error("Nombre");
      return;
    }
    this.state.tempVariants.push({
      id: Utils.generateId(),
      name: n,
      price: p,
      emoji: e,
    });
    document.getElementById("variantName").value = "";
    document.getElementById("variantPrice").value = "";
    document.getElementById("variantEmoji").value = "";
    this.renderVariantsPreview();
    Toast.success("Agregada");
  },

  removeVariantFromForm(id) {
    this.state.tempVariants = this.state.tempVariants.filter(
      (v) => v.id !== id,
    );
    this.renderVariantsPreview();
  },

  renderVariantsPreview() {
    const c = document.getElementById("variantsListPreview");
    if (this.state.tempVariants.length === 0) {
      c.innerHTML =
        '<p style="font-size:.75rem;color:var(--tx2);text-align:center">Sin variantes</p>';
      return;
    }
    c.innerHTML = this.state.tempVariants
      .map(
        (v) =>
          `<div class="variant-item"><span style="font-size:1.1rem">${Utils.sanitizeInput(v.emoji || "🍽️")}</span><div class="variant-item-info">${Utils.sanitizeInput(v.name)}</div><div class="variant-item-price">+${Utils.formatCurrency(v.price)}</div><button class="icon-btn danger" onclick="app.removeVariantFromForm('${v.id}')"><i class="fas fa-times"></i></button></div>`,
      )
      .join("");
  },

  openAddProduct() {
    if (this.currentRole !== "admin") {
      Toast.error("Solo admin");
      return;
    }
    this.resetProductForm();
    this.showModal("addProductModal");
  },

  saveProduct() {
    const eid = document.getElementById("editProductId").value;
    const n = document.getElementById("productName").value.trim();
    const cat = document.getElementById("productCategory").value;
    const p = Utils.parseFormattedNumber(
      document.getElementById("productPrice").value,
    );
    const em = document.getElementById("productEmoji").value.trim() || "📦";
    const fav = document.getElementById("productFavorite").checked;
    const act = document.getElementById("productActive").checked;
    const hv = document.getElementById("productHasVariants").checked;
    const isChicken = this.categoryKind(cat) !== "general";
    const s = isChicken
      ? 0
      : Utils.parseFormattedNumber(
          document.getElementById("productStock").value,
        );
    if (!n) {
      Toast.error("Nombre");
      return;
    }
    if (p <= 0) {
      Toast.error("Precio");
      return;
    }
    const pd = {
      id: eid || Utils.generateId(),
      name: n,
      category: cat,
      price: p,
      stock: s,
      emoji: em,
      image: this.state.tempImageData || null,
      hasVariants: hv,
      favorite: fav,
      active: act,
      variants: hv ? [...this.state.tempVariants] : [],
    };
    if (isChicken)
      pd.chickenUnits =
        Number(document.getElementById("productChickenUnits").value) || 1;
    if (eid) {
      const idx = this.state.products.findIndex((x) => x.id === eid);
      if (idx !== -1) {
        const old = this.state.products[idx];
        if (!this.state.tempImageData && old.image) pd.image = old.image;
        if (old._o != null) pd._o = old._o;
        this.state.products[idx] = pd;
      }
      Toast.success("Actualizado");
      this.logActivity(`Editado: ${n}`);
    } else {
      this.state.products.push(pd);
      Toast.success("Agregado");
      if (navigator.vibrate)
        try {
          navigator.vibrate(12);
        } catch (e) {}
      this.logActivity(`Creado: ${n}`);
    }
    this.hideModal("addProductModal");
    this.resetProductForm();
    this.saveState();
    this.render();
  },

  editProduct(id) {
    const p = this.state.products.find((x) => x.id === id);
    if (!p) return;
    this.fillCategorySelect(p.category);
    document.getElementById("editProductId").value = p.id;
    document.getElementById("productName").value = p.name;
    document.getElementById("productPrice").value = Utils.formatNumber(p.price);
    document.getElementById("productStock").value = Utils.formatNumber(p.stock);
    document.getElementById("productEmoji").value = p.emoji;
    document.getElementById("productFavorite").checked = p.favorite || false;
    document.getElementById("productActive").checked = p.active !== false;
    document.getElementById("productHasVariants").checked = p.hasVariants;
    const info = this.getChickenInfo(p);
    document.getElementById("productChickenUnits").value = String(
      info ? info.units : 1,
    );
    this.onProductCategoryChange();
    const pr = document.getElementById("imagePreview");
    if (p.image) {
      pr.src = p.image;
      pr.style.display = "block";
      this.state.tempImageData = p.image;
    } else {
      pr.style.display = "none";
      this.state.tempImageData = null;
    }
    this.state.tempVariants = p.hasVariants ? [...p.variants] : [];
    this.toggleVariantsForm();
    this.renderVariantsPreview();
    document.getElementById("addProductModalTitle").textContent = "✏️ Editar";
    this.showModal("addProductModal");
  },

  deleteProduct(id) {
    if (!confirm("¿Eliminar?")) return;
    this.state.products = this.state.products.filter((p) => p.id !== id);
    this.saveState();
    this.render();
    this.logActivity("Eliminado");
    Toast.success("Eliminado");
  },

  toggleProductActive(id) {
    const p = this.state.products.find((x) => x.id === id);
    if (!p) return;
    p.active = !p.active;
    this.saveState();
    this.render();
    this.logActivity(`${p.active ? "Activado" : "Desactivado"}: ${p.name}`);
    Toast.success(p.active ? "Activado" : "Desactivado");
  },

  resetProductForm() {
    document.getElementById("editProductId").value = "";
    document.getElementById("productName").value = "";
    const cur = this.state.selectedManageCategory;
    this.fillCategorySelect(
      this.getCategories().some((c) => c.id === cur) ? cur : null,
    );
    document.getElementById("productPrice").value = "";
    document.getElementById("productStock").value = "";
    document.getElementById("productChickenUnits").value = "1";
    this.onProductCategoryChange();
    document.getElementById("productEmoji").value = "";
    document.getElementById("productFavorite").checked = false;
    document.getElementById("productActive").checked = true;
    document.getElementById("productHasVariants").checked = false;
    document.getElementById("productImageInput").value = "";
    document.getElementById("imagePreview").style.display = "none";
    document.getElementById("variantsFormSection").style.display = "none";
    document.getElementById("addProductModalTitle").textContent = "➕ Producto";
    this.state.tempVariants = [];
    this.state.tempImageData = null;
    this.renderVariantsPreview();
  },

  addStockEntry() {
    const pid = document.getElementById("entryProduct").value;
    const q = Utils.parseFormattedNumber(
      document.getElementById("entryQuantity").value,
    );
    const sup = document.getElementById("entrySupplier").value.trim();
    if (!pid) {
      Toast.error("Producto");
      return;
    }
    if (q <= 0) {
      Toast.error("Cantidad");
      return;
    }
    const p = this.state.products.find((x) => x.id === pid);
    if (!p) return;
    p.stock += q;
    this.state.stockHistory.push({
      id: Utils.generateId(),
      timestamp: Utils.now(),
      productId: pid,
      productName: p.name,
      quantity: q,
      type: "entrada",
      supplier: sup,
    });
    document.getElementById("entryQuantity").value = "";
    document.getElementById("entrySupplier").value = "";
    this.saveState();
    this.render();
    this.logActivity(`+${q} ${p.name}`);
    Toast.success(`+${Utils.formatNumber(q)} ${p.name}`);
  },

  getProductsByCategory(cat) {
    return this.state.products
      .filter((p) => p.category === cat && p.active !== false)
      .sort((a, b) => {
        if ((a.favorite ? 1 : 0) !== (b.favorite ? 1 : 0))
          return (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0);
        return a.name.localeCompare(b.name);
      });
  },

  emojiOf(p) {
    return (
      p.emoji ||
      { pollo: "🍗", bebida: "🥤", acompanante: "🍟" }[p.category] ||
      "📦"
    );
  },

  renderProductsManage() {
    const c = document.getElementById("productsManageList");
    const cat = this.state.selectedManageCategory;
    const prods =
      cat === "all"
        ? this.state.products
        : cat === "inactive"
          ? this.state.products.filter((p) => p.active === false)
          : this.state.products.filter((p) => p.category === cat);
    if (prods.length === 0) {
      c.innerHTML =
        '<div class="empty-state"><i class="fas fa-box-open"></i><p>Sin productos</p></div>';
      return;
    }
    c.innerHTML = prods
      .map((p) => {
        const picture = p.image
          ? `<img src="${p.image}">`
          : `<div class="product-manage-emoji">${Utils.sanitizeInput(this.emojiOf(p))}</div>`;
        const info = this.getChickenInfo(p);
        const portion = info
          ? ` • ${Utils.formatChickens(info.units)} pollo (${SOURCE_LABEL[info.source]})`
          : "";
        const variants = p.hasVariants
          ? ` • ${Utils.formatNumber(p.variants.length)} var.`
          : "";
        const inactive =
          p.active === false
            ? '<span style="color:var(--danger);font-size:.65rem">(Inactivo)</span>'
            : "";
        const on = p.active !== false;
        return `
        <div class="product-manage-item">
          ${picture}
          <div class="product-manage-info">
            <div class="product-manage-name">
              ${Utils.sanitizeInput(p.name)} ${p.favorite ? "⭐" : ""} ${inactive}
            </div>
            <div class="product-manage-meta">
              ${Utils.formatCurrency(p.price)}${portion}${variants}
            </div>
          </div>
          <div style="display:flex;gap:.2rem">
            <button class="icon-btn" onclick="app.toggleProductActive('${p.id}')"
              title="${on ? "Desactivar" : "Activar"}">
              <i class="fas fa-${on ? "pause" : "play"}"></i>
            </button>
            <button class="icon-btn" onclick="app.editProduct('${p.id}')" title="Editar">
              <i class="fas fa-edit"></i>
            </button>
            <button class="icon-btn danger" onclick="app.deleteProduct('${p.id}')" title="Eliminar">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>`;
      })
      .join("");
  },

  renderInventory() {
    const c = document.getElementById("inventoryGrid");
    const ip = this.state.products.filter(
      (p) => !this.isChickenProduct(p) && p.active !== false,
    );
    if (ip.length === 0) {
      c.innerHTML = `<div
            class="empty-state"
            style="grid-column:1/-1">
          <i class="fas fa-box-open"></i><p>Sin inventario</p>
          </div>`;
      return;
    }
    c.innerHTML = ip
      .map((p) => {
        let sc = "";
        if (p.stock <= 0) sc = "out-of-stock";
        else if (p.stock <= 3) sc = "low-stock";
        return `<div class="inventory-item ${sc}"><div class="inventory-actions"><button class="icon-btn" onclick="app.editProduct('${p.id}')"
          title="Editar"><i class="fas fa-edit"></i></button><button class="icon-btn danger"
          onclick="app.deleteProduct('${p.id}')" title="Eliminar"><i class="fas fa-trash"></i></button></div>${
            p.image
              ? `<img src="${p.image}"
          style="width:100%;height:65px;object-fit:cover;border-radius:var(--rs);margin-bottom:.4rem">`
              : `<div style="font-size:1.75rem;margin-bottom:.3rem;text-align:center">${Utils.sanitizeInput(this.emojiOf(p))}</div>`
          }<h4
            style="margin-bottom:.15rem;
            font-size:.8rem;
            white-space:nowrap;
            overflow:hidden;
            text-overflow:ellipsis">${Utils.sanitizeInput(p.name)}</h4><p style="color:var(--primary);font-weight:700;font-size:.85rem">${Utils.formatCurrency(p.price)}</p><p style="font-size:.7rem;color:var(--tx2);margin-top:.2rem">Stock: <strong>${Utils.formatNumber(p.stock)}</strong>${p.stock <= 3 && p.stock > 0 ? " ️" : ""}</p></div>`;
      })
      .join("");
    const ep = document.getElementById("entryProduct");
    if (ep)
      ep.innerHTML =
        '<option value="">Seleccionar...</option>' +
        this.state.products
          .filter((p) => !this.isChickenProduct(p) && p.active !== false)
          .map(
            (p) =>
              `<option value="${p.id}">${Utils.sanitizeInput(p.name)} (${Utils.formatNumber(p.stock)})</option>`,
          )
          .join("");
  },

  renderStockHistory() {
    const c = document.getElementById("stockHistoryList");
    if (!this.state.stockHistory || this.state.stockHistory.length === 0) {
      c.innerHTML =
        '<div class="empty-state"><i class="fas fa-history"></i><p>Sin movimientos</p></div>';
      return;
    }
    c.innerHTML = this.state.stockHistory
      .slice()
      .reverse()
      .map(
        (h) =>
          `<div class="sale-item"><div class="sale-info"><div class="sale-id">${h.type === "entrada" ? "📥 Entrada" : "📤 Salida"}</div><div class="sale-details">${Utils.formatDate(h.timestamp)} - ${Utils.sanitizeInput(h.productName)}${h.supplier ? ` - ${Utils.sanitizeInput(h.supplier)}` : ""}</div></div><div class="sale-amount" style="color:${h.type === "entrada" ? "var(--success)" : "var(--danger)"}">${h.type === "entrada" ? "+" : "-"}${Utils.formatNumber(h.quantity)}</div></div>`,
      )
      .join("");
  },
});
