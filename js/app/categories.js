/* Categorías de productos y reglas de pollo (asado / broaster / normal).

   Cada categoría tiene un "tipo" que decide de dónde se descuenta el inventario:
     asado    → cada venta resta pollo de los ASADOS
     broaster → cada venta resta pollo de los CRUDOS (se fríe al momento de vender)
     general  → producto normal con inventario en unidades

   Cada producto de pollo guarda cuánto pollo consume en "chickenUnits":
     1 = entero · 0.5 = 1/2 · 0.25 = 1/4 · 0.125 = 1/8 (una porción) */

const CATEGORY_KINDS = {
  general: { label: "Producto normal (se cuenta en unidades)", source: null },
  asado: { label: "Pollo asado (resta de los asados)", source: "cooked" },
  broaster: { label: "Pollo broaster (resta de los crudos)", source: "raw" },
};

const CATEGORY_COLORS = [
  "#ef4444",
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#f97316",
];

const SOURCE_LABEL = { raw: "crudos", cooked: "asados" };

Object.assign(POSApp.prototype, {
  /* ---------- categorías ---------- */

  defaultCategories() {
    return [
      {
        id: "pollo",
        name: "Pollos",
        emoji: "🍗",
        kind: "asado",
        color: "#ef4444",
        _o: 1,
      },
      {
        id: "bebida",
        name: "Bebidas",
        emoji: "🥤",
        kind: "general",
        color: "#3b82f6",
        _o: 3,
      },
      {
        id: "acompanante",
        name: "Adiciones",
        emoji: "🍟",
        kind: "general",
        color: "#10b981",
        _o: 4,
      },
      {
        id: "otro",
        name: "Otros",
        emoji: "📦",
        kind: "general",
        color: "#64748b",
        _o: 5,
      },
    ];
  },

  broasterCategory() {
    return {
      id: "broaster",
      name: "Pollo broaster",
      emoji: "🔥",
      kind: "broaster",
      color: "#f97316",
      _o: 2,
    };
  },

  /* Lista de categorías en orden. Mientras nadie las edite se usan las básicas (no se guardan). */
  getCategories() {
    const stored = this.state.categories;
    const list =
      stored && stored.length ? stored.slice() : this.defaultCategories();
    const known = new Set(list.map((c) => c.id));
    let n = 100;
    this.state.products.forEach((p) => {
      if (known.has(p.category)) return;
      known.add(p.category);
      list.push({
        id: p.category,
        name: p.category,
        emoji: "📦",
        kind: "general",
        color: "#64748b",
        _o: n++,
      });
    });
    return list.sort((a, b) => (a._o || 0) - (b._o || 0));
  },

  getCategory(id) {
    const found = this.getCategories().find((c) => c.id === id);
    return (
      found || { id, name: id, emoji: "📦", kind: "general", color: "#64748b" }
    );
  },

  categoryKind(id) {
    const kind = this.getCategory(id).kind;
    return CATEGORY_KINDS[kind] ? kind : "general";
  },

  categoryColor(c) {
    return /^#[0-9a-f]{6}$/i.test(c.color || "") ? c.color : "#64748b";
  },

  /* Guarda las categorías en el estado (así se pueden editar y sincronizar). */
  materializeCategories() {
    if (!this.state.categories || this.state.categories.length === 0) {
      this.state.categories = this.getCategories().map((c) => ({ ...c }));
    }
  },

  /* ---------- pollo: de dónde sale y cuánto consume ---------- */

  chickenSourceOf(p) {
    return CATEGORY_KINDS[this.categoryKind(p.category)].source;
  },

  isChickenProduct(p) {
    return !!this.chickenSourceOf(p);
  },

  /* Para productos antiguos sin fracción guardada: se deduce del nombre. */
  guessChickenUnits(name) {
    const n = String(name || "").toLowerCase();
    if (/(1\s*\/\s*8|octavo|porci[oó]n)/.test(n)) return 0.125;
    if (/(1\s*\/\s*4|cuarto|cuarta)/.test(n)) return 0.25;
    if (/(1\s*\/\s*2|medio|media|mitad)/.test(n)) return 0.5;
    return 1;
  },

  /* { source: "cooked" | "raw", units } o null si el producto no consume pollo. */
  getChickenInfo(p) {
    const source = this.chickenSourceOf(p);
    if (!source) return null;
    const units = Number(p.chickenUnits) || this.guessChickenUnits(p.name);
    return { source, units: units > 0 ? units : 1 };
  },

  /* Campos que se guardan en cada renglón del carrito o de la factura. */
  chickenFields(p) {
    const info = this.getChickenInfo(p);
    return info
      ? { chickenUnits: info.units, chickenSource: info.source }
      : { chickenUnits: 0, chickenSource: null };
  },

  /* Compatibilidad: fracción de pollo que consume un producto. */
  getChickenUnits(pid) {
    const p = this.state.products.find((x) => x.id === pid);
    const info = p && this.getChickenInfo(p);
    return info ? info.units : 1;
  },

  /* Pollo que consumió un renglón de factura (también facturas antiguas). */
  itemChickenInfo(item) {
    if (item.chickenSource && item.chickenUnits > 0) {
      return { source: item.chickenSource, units: item.chickenUnits };
    }
    if (item.chickenUnits > 0)
      return { source: "cooked", units: item.chickenUnits };
    return null;
  },

  /* Descuenta (dir = -1) o devuelve (dir = +1) al inventario lo que llevan estos renglones.
     Devuelve cuántos pollos crudos/asados se movieron. */
  applySaleInventory(items, dir) {
    const used = { raw: 0, cooked: 0 };
    items.forEach((i) => {
      const info = this.itemChickenInfo(i);
      if (info) {
        used[info.source] += info.units * i.quantity;
        return;
      }
      const p = this.state.products.find((x) => x.id === i.productId);
      if (p && !this.isChickenProduct(p)) {
        /* Sin recortar a 0: así, quitar de una mesa o borrar una factura devuelve
           exactamente lo que se descontó (antes se «creaba» stock). */
        p.stock = (Number(p.stock) || 0) + dir * i.quantity;
      }
    });
    const ch = this.state.chickens;
    /* Sin recortar a 0: si se vendió sin pollos contados, queda en negativo (y al borrar la
       factura vuelve exactamente al valor anterior). */
    ch.raw = (ch.raw || 0) + dir * used.raw;
    ch.cooked = (ch.cooked || 0) + dir * used.cooked;
    const total = used.raw + used.cooked;
    this.state.totalChickensSold = Math.max(
      0,
      (this.state.totalChickensSold || 0) - dir * total,
    );
    return used;
  },

  /* ---------- datos iniciales y migraciones ---------- */

  broasterProducts() {
    const base = {
      category: "broaster",
      stock: 0,
      image: null,
      hasVariants: false,
      favorite: false,
      active: true,
      variants: [],
      emoji: "🍗",
    };
    return [
      {
        ...base,
        id: "prod-b1",
        name: "Pollo broaster entero",
        price: 42000,
        chickenUnits: 1,
        favorite: true,
        _o: 31,
      },
      {
        ...base,
        id: "prod-b2",
        name: "1/2 pollo broaster",
        price: 22000,
        chickenUnits: 0.5,
        _o: 32,
      },
      {
        ...base,
        id: "prod-b3",
        name: "1/4 pollo broaster",
        price: 12000,
        chickenUnits: 0.25,
        _o: 33,
      },
      {
        ...base,
        id: "prod-b4",
        name: "Porción de pollo broaster",
        price: 6500,
        chickenUnits: 0.125,
        _o: 34,
      },
    ];
  },

  /* Ordena datos antiguos. Devuelve true si cambió algo.
     seed = true solo lo usa el administrador: agrega el pollo broaster una única vez. */
  ensureData(seed) {
    const S = this.state;
    let changed = false;
    if (!S.migrations) S.migrations = {};
    if (!S.categories) S.categories = [];

    /* Las ventas ya no guardan la foto del producto en cada renglón (llenaba el almacenamiento) */
    const strip = (i) => {
      if (i && i.image !== undefined) {
        delete i.image;
        changed = true;
      }
    };
    [S.sales, S.pendingSales].forEach((list) =>
      (list || []).forEach((s) => (s.items || []).forEach(strip)),
    );
    (S.cart || []).forEach(strip);
    S.products.forEach((p) => {
      if (this.isChickenProduct(p) && !p.chickenUnits) {
        p.chickenUnits = this.guessChickenUnits(p.name);
        changed = true;
      }
    });

    const hasBroaster = S.products.some((p) => /^prod-b\d$/.test(p.id));
    if (hasBroaster) {
      S.migrations.broaster = true;
    } else if (seed && !S.migrations.broaster) {
      this.materializeCategories();
      if (!S.categories.some((c) => c.id === "broaster"))
        S.categories.push(this.broasterCategory());
      this.broasterProducts().forEach((p) => S.products.push(p));
      S.migrations.broaster = true;
      this.logActivity("Se agregó el pollo a la broaster (revisa los precios)");
      changed = true;
    }
    return changed;
  },

  /* ---------- pestañas y selector de categoría ---------- */

  renderCategoryTabs() {
    const box = document.getElementById("manageCategoryTabs");
    if (!box) return;
    const cur = this.state.selectedManageCategory || "all";
    const tab = (id, label) =>
      `<button class="category-tab ${cur === id ? "active" : ""}"
        onclick="app.selectManageCategory('${id}')">${label}</button>`;
    box.innerHTML =
      tab("all", "Todos") +
      this.getCategories()
        .map((c) =>
          tab(
            c.id,
            `${Utils.sanitizeInput(c.emoji)} ${Utils.sanitizeInput(c.name)}`,
          ),
        )
        .join("") +
      tab("inactive", "🚫 Inactivos");
  },

  selectManageCategory(id) {
    this.state.selectedManageCategory = id;
    this.renderCategoryTabs();
    this.renderProductsManage();
  },

  fillCategorySelect(selected) {
    const sel = document.getElementById("productCategory");
    if (!sel) return;
    sel.innerHTML =
      this.getCategories()
        .map(
          (c) =>
            `<option value="${Utils.sanitizeInput(c.id)}">
              ${Utils.sanitizeInput(c.emoji)} ${Utils.sanitizeInput(c.name)}</option>`,
        )
        .join("") + '<option value="__new">➕ Nueva categoría…</option>';
    const first = this.getCategories()[0].id;
    sel.value =
      selected && this.getCategories().some((c) => c.id === selected)
        ? selected
        : first;
    this._lastProductCategory = sel.value;
  },

  /* Muestra u oculta los campos del formulario según el tipo de categoría. */
  onProductCategoryChange() {
    const sel = document.getElementById("productCategory");
    if (sel.value === "__new") {
      sel.value = this._lastProductCategory;
      this.openCategoriesModal();
      return;
    }
    this._lastProductCategory = sel.value;
    const kind = this.categoryKind(sel.value);
    const isChicken = kind !== "general";
    document.getElementById("productChickenGroup").style.display = isChicken
      ? ""
      : "none";
    document.getElementById("productStockGroup").style.display = isChicken
      ? "none"
      : "";
    document.getElementById("productChickenHint").textContent =
      kind === "broaster"
        ? "Cada venta resta esta cantidad de los pollos CRUDOS (se fríen al momento)."
        : "Cada venta resta esta cantidad de los pollos ASADOS.";
  },

  /* ---------- ventana «Categorías» ---------- */

  openCategoriesModal() {
    if (this.currentRole !== "admin") {
      Toast.error("Solo el administrador puede editar categorías");
      return;
    }
    this.resetCategoryForm();
    this.renderCategoriesList();
    this.showModal("categoriesModal");
  },

  renderCategoriesList() {
    const kindText = {
      general: "unidades",
      asado: "pollo asado",
      broaster: "pollo broaster",
    };
    document.getElementById("categoriesList").innerHTML = this.getCategories()
      .map((c) => {
        const count = this.state.products.filter(
          (p) => p.category === c.id,
        ).length;
        return `
        <div class="category-row">
          <span class="category-row-emoji">${Utils.sanitizeInput(c.emoji)}</span>
          <div class="category-row-info">
            <div class="category-row-name">${Utils.sanitizeInput(c.name)}</div>
            <div class="category-row-meta">${count} productos • ${kindText[this.categoryKind(c.id)]}</div>
          </div>
          <button class="icon-btn" title="Editar" onclick="app.editCategory('${c.id}')">
            <i class="fas fa-edit"></i>
          </button>
          <button class="icon-btn danger" title="Eliminar" onclick="app.deleteCategory('${c.id}')">
            <i class="fas fa-trash"></i>
          </button>
        </div>`;
      })
      .join("");
  },

  resetCategoryForm() {
    document.getElementById("editCategoryId").value = "";
    document.getElementById("categoryName").value = "";
    document.getElementById("categoryEmoji").value = "";
    document.getElementById("categoryKind").value = "general";
    document.getElementById("categoryFormTitle").textContent =
      "➕ Nueva categoría";
    document.getElementById("categoryCancelBtn").style.display = "none";
  },

  editCategory(id) {
    const c = this.getCategory(id);
    document.getElementById("editCategoryId").value = c.id;
    document.getElementById("categoryName").value = c.name;
    document.getElementById("categoryEmoji").value = c.emoji;
    document.getElementById("categoryKind").value = this.categoryKind(c.id);
    document.getElementById("categoryFormTitle").textContent =
      "✏️ Editar categoría";
    document.getElementById("categoryCancelBtn").style.display = "";
    document.getElementById("categoryName").focus();
  },

  saveCategory() {
    if (this.currentRole !== "admin") return;
    const eid = document.getElementById("editCategoryId").value;
    const name = document.getElementById("categoryName").value.trim();
    const kind = document.getElementById("categoryKind").value;
    let emoji = document.getElementById("categoryEmoji").value.trim();
    if (!name) {
      Toast.error("Escribe el nombre de la categoría");
      return;
    }
    const repeated = this.getCategories().some(
      (c) => c.id !== eid && c.name.toLowerCase() === name.toLowerCase(),
    );
    if (repeated) {
      Toast.error("Ya existe una categoría con ese nombre");
      return;
    }
    if (!emoji) emoji = kind === "general" ? "📦" : "🍗";
    this.materializeCategories();
    if (eid) {
      const c = this.state.categories.find((x) => x.id === eid);
      if (!c) return;
      const inUse = this.state.products.some((p) => p.category === eid);
      if (c.kind !== kind && inUse) {
        const msg =
          "Esta categoría ya tiene productos. Cambiar su tipo cambia de dónde se descuenta " +
          "el inventario. ¿Continuar?";
        if (!confirm(msg)) return;
      }
      Object.assign(c, { name, emoji, kind });
      this.logActivity(`Categoría editada: ${name}`);
    } else {
      const slug =
        name
          .normalize("NFD")
          .replace(/[̀-ͯ]/g, "")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "") || "cat";
      let id = slug;
      for (let n = 2; this.state.categories.some((c) => c.id === id); n++)
        id = `${slug}-${n}`;
      const color =
        CATEGORY_COLORS[this.state.categories.length % CATEGORY_COLORS.length];
      this.state.categories.push({
        id,
        name,
        emoji,
        kind,
        color,
        _o: Utils.now(),
      });
      this.logActivity(`Categoría creada: ${name}`);
      this._lastProductCategory = id;
    }
    this.saveState();
    this.render();
    this.resetCategoryForm();
    this.renderCategoriesList();
    if (
      document.getElementById("addProductModal").classList.contains("active")
    ) {
      this.fillCategorySelect(eid || this._lastProductCategory);
      this.onProductCategoryChange();
      if (!eid) this.hideModal("categoriesModal");
    }
    Toast.success(eid ? "Categoría actualizada" : "Categoría creada");
  },

  deleteCategory(id) {
    if (this.currentRole !== "admin") return;
    if (this.state.products.some((p) => p.category === id)) {
      Toast.error("Primero mueve o elimina los productos de esta categoría");
      return;
    }
    if (this.getCategories().length <= 1) {
      Toast.error("Debe quedar al menos una categoría");
      return;
    }
    if (!confirm("¿Eliminar esta categoría?")) return;
    this.materializeCategories();
    this.state.categories = this.state.categories.filter((c) => c.id !== id);
    this.logActivity("Categoría eliminada");
    this.saveState();
    this.render();
    this.renderCategoriesList();
    Toast.success("Categoría eliminada");
  },
});
