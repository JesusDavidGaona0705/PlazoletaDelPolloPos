const Cloud = (() => {
  const COLS = [
    "products",
    "sales",
    "pendingSales",
    "expenses",
    "clients",
    "usageHistory",
    "mermas",
    "stockHistory",
    "arqueos",
    "activityLog",
    "categories",
    "settings",
  ];
  const CFG_KEYS = ["dailyGoal", "cashFund"];
  const CNT = {
    raw: ["chickens", "raw"],
    cooked: ["chickens", "cooked"],
    sold: ["totalChickensSold"],
    inv: ["invoiceSeq"],
  };
  const NODES = COLS.concat(["stock", "cfg", "cnt", "meta"]);
  /* Qué puede escribir cada rol (se usa para generar las reglas de Firebase) */
  const EMP_NODES = [
    "sales",
    "pendingSales",
    "clients",
    "stock",
    "cnt",
    "activityLog",
    "presence",
  ];
  const ADM_NODES = [
    "products",
    "expenses",
    "usageHistory",
    "mermas",
    "stockHistory",
    "arqueos",
    "cfg",
    "meta",
    "archives",
    "categories",
    "settings",
  ];
  const LABEL = {
    local: "Modo local",
    connecting: "Conectando…",
    online: "Conectado en tiempo real",
    offline: "Sin conexión",
    error: "Error de sincronización",
    paused: "En pausa",
  };
  const LS = (k) => {
    try {
      return localStorage.getItem(k);
    } catch (e) {
      return null;
    }
  };
  const LSset = (k, v) => {
    try {
      localStorage.setItem(k, v);
      return true;
    } catch (e) {
      return false;
    }
  };

  let app = null,
    db = null,
    ref = null,
    auth = null,
    user = null,
    staff = null,
    me = null,
    accountsCloud = false,
    staffKnown = false,
    dbStarted = false,
    booted = false,
    offset = 0;
  let connected = false,
    ready = false,
    paused = false,
    first = false,
    deniedNotified = false,
    dbUid = null,
    listenFailed = false;
  const denied = new Set();
  let R = {},
    got = {},
    shadow = {},
    status = "local",
    statusMsg = "",
    authNote = "",
    lastSync = null,
    devices = [],
    pendingWrites = 0;
  let pushT = null,
    pullT = null,
    shT = null,
    notifiedOffline = false,
    errShown = false;
  const inflight = new Set();
  const t0 = Date.now();
  const storeId = (() => {
    const c = LS("pos_store_code");
    return /^[A-Za-z0-9_-]{3,40}$/.test(c || "") ? c : "principal";
  })();
  const shKey = "pos_shadow_" + storeId;
  const deviceId = (() => {
    let d = LS("pos_device_id");
    if (!d) {
      d =
        "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
      LSset("pos_device_id", d);
    }
    return d;
  })();

  /* ---------- utilidades ---------- */
  function hash(s) {
    let h1 = 0xdeadbeef,
      h2 = 0x41c6ce57;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 2654435761);
      h2 = Math.imul(h2 ^ c, 1597334677);
    }
    h1 =
      Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
      Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 =
      Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
      Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (
      (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36) + "." + s.length
    );
  }
  const key = (id) => String(id).replace(/[.#$\[\]\/\s]/g, "_");
  const getPath = (o, p) => p.reduce((a, k) => (a == null ? a : a[k]), o);
  const setPath = (o, p, v) => {
    let a = o;
    for (let i = 0; i < p.length - 1; i++) {
      if (a[p[i]] == null) a[p[i]] = {};
      a = a[p[i]];
    }
    a[p[p.length - 1]] = v;
  };
  function ser(e, c) {
    if (c === "products") {
      const { stock, ...r } = e;
      return JSON.stringify(r);
    }
    return JSON.stringify(e);
  }
  function orderOf(e) {
    return e._o != null
      ? e._o
      : e.timestamp != null
        ? e.timestamp
        : e.createdAt != null
          ? e.createdAt
          : e.time != null
            ? e.time
            : 0;
  }
  function sortCol(c, list) {
    return c === "activityLog"
      ? list.sort((a, b) => (b.time || 0) - (a.time || 0))
      : list.sort((a, b) => orderOf(a) - orderOf(b));
  }
  function loadShadow() {
    try {
      return JSON.parse(LS(shKey) || "{}") || {};
    } catch (e) {
      return {};
    }
  }
  function modalOpen() {
    const m = document.getElementById("syncModal");
    return !!(m && m.classList.contains("active"));
  }

  /* ---------- estado visual ---------- */
  function setStatus(s, msg) {
    status = s;
    statusMsg = msg || "";
    const d = document.getElementById("cloudDot");
    if (d) d.className = "cloud-dot " + s;
    const b = document.getElementById("cloudBtn");
    if (b) b.title = "Sincronización: " + LABEL[s];
    if (modalOpen()) renderModal();
  }
  function fail(e) {
    const code = (e && (e.code || e.message)) || String(e);
    setStatus(
      "error",
      "Firebase rechazó la operación (" +
        code +
        "). Revisa las reglas de la base de datos y la autenticación.",
    );
    if (!errShown && typeof Toast !== "undefined") {
      errShown = true;
      Toast.error("☁️ No se pudo sincronizar: " + code);
    }
  }

  /* ---------- preparar / aplanar estado local ---------- */
  function prep() {
    const S = app.state;
    let n = 0;
    COLS.forEach((c) => {
      if (!Array.isArray(S[c])) S[c] = [];
    });
    S.activityLog.forEach((e) => {
      if (!e.id)
        e.id =
          "L" + (e.time || Date.now()) + Math.random().toString(36).slice(2, 6);
    });
    S.products.forEach((p) => {
      if (p._o == null) {
        const m = /^prod-(\d+)$/.exec(p.id);
        p._o = m ? +m[1] : Utils.now() + n++;
      }
    });
  }
  function flat() {
    prep();
    const S = app.state,
      ent = {},
      num = {};
    COLS.forEach((c) =>
      S[c].forEach((e) => {
        ent[c + "/" + key(e.id)] = ser(e, c);
      }),
    );
    S.products.forEach((p) => {
      num["stock/" + key(p.id)] = +p.stock || 0;
    });
    CFG_KEYS.forEach((k) => {
      num["cfg/" + k] = +S[k] || 0;
    });
    Object.keys(CNT).forEach((k) => {
      num["cnt/" + k] = +getPath(S, CNT[k]) || 0;
    });
    return { ent, num };
  }

  /* ---------- ENVIAR cambios locales ---------- */
  function buildPush() {
    const { ent, num } = flat();
    const up = {},
      undo = [];
    const setSh = (p, v) => {
      undo.push([
        p,
        Object.prototype.hasOwnProperty.call(shadow, p) ? shadow[p] : undefined,
      ]);
      if (v === undefined) delete shadow[p];
      else shadow[p] = v;
    };
    const skip = (p) => denied.has(p.split("/")[0]);
    for (const p in ent) {
      if (skip(p)) continue;
      const h = hash(ent[p]);
      if (shadow[p] !== h) {
        up[p] = ent[p];
        setSh(p, h);
      }
    }
    Object.keys(shadow).forEach((p) => {
      const top = p.split("/")[0];
      if (denied.has(top)) return;
      if (
        (COLS.indexOf(top) >= 0 && !(p in ent)) ||
        (top === "stock" && !(p in num))
      ) {
        up[p] = null;
        setSh(p, undefined);
      }
    });
    for (const p in num) {
      const v = num[p],
        top = p.split("/")[0];
      if (denied.has(top)) continue;
      if (top === "cfg") {
        if (shadow[p] !== v) {
          up[p] = v;
          setSh(p, v);
        }
      } else {
        const sv = shadow[p] || 0;
        if (v !== sv) {
          up[p] = firebase.database.ServerValue.increment(v - sv);
          setSh(p, v);
        }
      }
    }
    return { up, undo };
  }
  function revert(undo) {
    undo
      .slice()
      .reverse()
      .forEach(([p, v]) => {
        if (v === undefined) delete shadow[p];
        else shadow[p] = v;
      });
  }
  function writeShadow() {
    clearTimeout(shT);
    const copy = { ...shadow };
    inflight.forEach((u) => {
      u.slice()
        .reverse()
        .forEach(([p, v]) => {
          if (v === undefined) delete copy[p];
          else copy[p] = v;
        });
    });
    LSset(shKey, JSON.stringify(copy));
  }
  function persistShadow() {
    clearTimeout(shT);
    shT = setTimeout(writeShadow, 400);
  }
  const readDenied = new Set();
  const NODE_LABEL = {
    categories: "categorías",
    settings: "ajustes de factura",
    products: "productos",
    sales: "ventas",
    pendingSales: "pendientes",
    clients: "clientes",
  };
  let permNote = "";
  function noteDenied() {
    const list = Array.from(readDenied).map((n) => NODE_LABEL[n] || n);
    permNote =
      "Las reglas de Firebase no permiten: " +
      list.join(", ") +
      ". Lo demás sí se sincroniza. Pega las reglas nuevas (☁️ → Opciones avanzadas → Reglas).";
    if (modalOpen()) renderModal();
    clearTimeout(noteDenied.t);
    noteDenied.t = setTimeout(() => {
      Toast.warning("☁️ Faltan permisos en Firebase para: " + list.join(", "));
    }, 300);
  }
  /* Datos que llegan de la nube: ids seguros y valores conocidos (evita inyectar código) */
  const SAFE_ID = /^[\w.-]{1,64}$/;
  function clean(c, e) {
    if (!e || typeof e !== "object") return null;
    if (e.id != null && !SAFE_ID.test(String(e.id))) return null;
    if (c === "sales" || c === "pendingSales") {
      if (!["pagado", "pendiente"].includes(e.status))
        e.status = c === "sales" ? "pagado" : "pendiente";
      if (!["efectivo", "transferencia", "mixto"].includes(e.paymentMethod))
        e.paymentMethod = "efectivo";
      if (e.clientId != null && !SAFE_ID.test(String(e.clientId)))
        e.clientId = null;
      (e.items || []).forEach((i) => delete i.image);
    }
    return e;
  }
  const isDenied = (e) =>
    !!(
      e &&
      (e.code === "PERMISSION_DENIED" ||
        /permission_denied/i.test(e.message || ""))
    );
  function restoreTops(tops) {
    const only = new Set(tops);
    reconcile(true, only);
  }
  async function splitSend(up, undo) {
    const groups = {};
    Object.keys(up).forEach((k) => {
      const t = k.split("/")[0];
      (groups[t] = groups[t] || {})[k] = up[k];
    });
    for (const top of Object.keys(groups)) {
      const keys = Object.keys(groups[top]);
      try {
        await ref.update(groups[top]);
        lastSync = Date.now();
      } catch (e) {
        revert(undo.filter(([p]) => keys.indexOf(p) >= 0));
        if (isDenied(e)) {
          denied.add(top);
          restoreTops([top]);
          if (!deniedNotified) {
            deniedNotified = true;
            Toast.warning(
              "Algunos cambios no se guardaron en la nube: tu cuenta no tiene permiso",
            );
          }
        } else fail(e);
      }
    }
  }
  function push() {
    if (!ready || paused || !ref) return;
    const { up, undo } = buildPush();
    if (!Object.keys(up).length) return;
    inflight.add(undo);
    pendingWrites++;
    persistShadow();
    ref
      .update(up)
      .then(() => {
        lastSync = Date.now();
      })
      .catch((e) => {
        if (isDenied(e) && Object.keys(up).length > 1)
          return splitSend(up, undo);
        revert(undo);
        if (isDenied(e)) {
          const t = Object.keys(up)[0].split("/")[0];
          denied.add(t);
          restoreTops([t]);
          Toast.warning(
            "Algunos cambios no se guardaron en la nube: tu cuenta no tiene permiso",
          );
        } else fail(e);
      })
      .then(() => {
        inflight.delete(undo);
        writeShadow(); /* guardar ya: si la app se cierra, no se vuelve a aplicar el cambio */
        pendingWrites--;
        if (modalOpen()) renderModal();
      });
  }
  function schedulePush() {
    if (!ready) return;
    clearTimeout(pushT);
    pushT = setTimeout(push, 120);
  }

  /* ---------- RECIBIR cambios remotos ---------- */
  function reconcile(adopt, only) {
    prep();
    const S = app.state;
    let changed = false,
      newSales = 0;
    const want = (n) => !readDenied.has(n) && (!only || only.has(n));
    COLS.forEach((c) => {
      if (!want(c)) return;
      const rm = R[c] || {};
      if (adopt) {
        const out = [];
        for (const k in rm) {
          try {
            const ce = clean(c, JSON.parse(rm[k]));
            if (ce) out.push(ce);
            shadow[c + "/" + k] = hash(rm[k]);
          } catch (e) {}
        }
        Object.keys(shadow).forEach((p) => {
          if (p.indexOf(c + "/") === 0 && !(p.slice(c.length + 1) in rm))
            delete shadow[p];
        });
        if (c === "products") {
          /* El stock viaja aparte (nodo «stock»): conservar el local para no ponerlo en 0 */
          const prev = new Map((S.products || []).map((p) => [p.id, p.stock]));
          const rs0 = R.stock || {};
          out.forEach((p) => {
            const r = rs0[key(p.id)];
            p.stock =
              r !== undefined
                ? +r
                : prev.has(p.id)
                  ? prev.get(p.id)
                  : p.stock || 0;
          });
        }
        S[c] = sortCol(c, out);
        changed = true;
        return;
      }
      const list = S[c],
        byKey = new Map(list.map((e) => [key(e.id), e]));
      let lc = false;
      for (const k in rm) {
        const str = rm[k],
          sR = hash(str),
          p = c + "/" + k,
          sS = shadow[p];
        if (sR === sS) continue;
        let e;
        try {
          e = clean(c, JSON.parse(str));
        } catch (x) {
          continue;
        }
        if (!e) continue;
        const loc = byKey.get(k);
        if (!loc) {
          list.push(e);
          byKey.set(k, e);
          lc = true;
          shadow[p] = sR;
          if (c === "sales" || c === "pendingSales") newSales++;
        } else {
          const sL = hash(ser(loc, c));
          if (sL === sS) {
            if (c === "products") e.stock = loc.stock;
            list[list.indexOf(loc)] = e;
            byKey.set(k, e);
            lc = true;
          }
          shadow[p] = sR;
        }
      }
      Object.keys(shadow).forEach((p) => {
        if (p.indexOf(c + "/") !== 0) return;
        const k = p.slice(c.length + 1);
        if (k in rm) return;
        const loc = byKey.get(k);
        if (loc && hash(ser(loc, c)) === shadow[p]) {
          list.splice(list.indexOf(loc), 1);
          byKey.delete(k);
          lc = true;
        }
        delete shadow[p];
      });
      if (lc) {
        S[c] = sortCol(c, list);
        changed = true;
      }
    });
    /* stock por producto (contador) */
    const rs = R.stock || {};
    if (want("stock"))
      S.products.forEach((p) => {
        const k = key(p.id),
          path = "stock/" + k;
        let rv = rs[k];
        if (rv === undefined) {
          if (p.stock == null) p.stock = 0;
          return;
        }
        rv = +rv;
        const sv = shadow[path];
        if (adopt || sv === undefined) {
          if (p.stock !== rv) {
            p.stock = rv;
            changed = true;
          }
        } else if (rv !== sv) {
          p.stock = Math.max(0, (+p.stock || 0) + (rv - sv));
          changed = true;
        }
        shadow[path] = rv;
      });
    /* contadores de pollos */
    const rc = R.cnt || {};
    if (want("cnt"))
      Object.keys(CNT).forEach((k) => {
        if (rc[k] === undefined) return;
        const rv = +rc[k],
          sv = shadow["cnt/" + k],
          cur = +getPath(S, CNT[k]) || 0;
        if (adopt || sv === undefined) {
          if (cur !== rv) {
            setPath(S, CNT[k], rv);
            changed = true;
          }
        } else if (rv !== sv) {
          setPath(S, CNT[k], cur + (rv - sv));
          changed = true;
        }
        shadow["cnt/" + k] = rv;
      });
    /* ajustes (último en escribir gana) */
    const rf = R.cfg || {};
    if (want("cfg"))
      CFG_KEYS.forEach((k) => {
        if (rf[k] === undefined) return;
        const rv = +rf[k],
          sv = shadow["cfg/" + k];
        if (adopt || sv === undefined || (+S[k] || 0) === sv) {
          if (S[k] !== rv) {
            S[k] = rv;
            changed = true;
          }
        }
        shadow["cfg/" + k] = rv;
      });
    if (changed) {
      app.persistLocal();
      persistShadow();
      if (app.currentRole) app.render();
      if (newSales > 0 && !adopt)
        Toast.info(
          "🔔 " +
            (newSales === 1
              ? "Nueva venta registrada"
              : newSales + " ventas nuevas") +
            " desde otro dispositivo",
        );
    }
    lastSync = Date.now();
    schedulePush();
  }

  function onFirst() {
    const hasRemote = !!(R.meta && R.meta.initAt);
    const hasShadow = Object.keys(shadow).length > 0;
    const S = app.state;
    if (!hasRemote) {
      shadow = {};
      ready = true;
      const { up, undo } = buildPush();
      up["meta/initAt"] = firebase.database.ServerValue.TIMESTAMP;
      inflight.add(undo);
      pendingWrites++;
      ref
        .update(up)
        .then(() => {
          lastSync = Date.now();
          inflight.delete(undo);
          persistShadow();
        })
        .catch((e) => {
          inflight.delete(undo);
          revert(undo);
          fail(e);
        })
        .then(() => {
          pendingWrites--;
          if (modalOpen()) renderModal();
        });
      setStatus(connected ? "online" : "offline");
      return;
    }
    if (!hasShadow) {
      const nontrivial =
        S.sales.length ||
        S.pendingSales.length ||
        S.clients.length ||
        S.expenses.length ||
        S.usageHistory.length ||
        S.mermas.length;
      if (nontrivial) {
        if (
          !confirm(
            "Este dispositivo tiene datos propios y la nube ya tiene los datos del negocio.\n\nAceptar = usar los datos de la nube (recomendado; se guarda una copia de seguridad de este dispositivo).\nCancelar = no sincronizar en este dispositivo.",
          )
        ) {
          paused = true;
          setStatus(
            "paused",
            "Elegiste no sincronizar. Pulsa «Reintentar» cuando quieras unirte a la nube.",
          );
          return;
        }
        LSset("pos_state_before_cloud", JSON.stringify(S));
      }
      reconcile(true);
    } else reconcile(false);
    ready = true;
    setStatus(connected ? "online" : "offline");
    schedulePush();
  }

  function onRemote() {
    if (paused || !ref) return;
    if (NODES.some((n) => !got[n])) return;
    if (!first) {
      first = true;
      onFirst();
      return;
    }
    reconcile(false);
  }
  function queuePull() {
    clearTimeout(pullT);
    pullT = setTimeout(onRemote, 40);
  }

  function onConn() {
    if (!db) return;
    if (connected) {
      const p = ref.child("presence/" + deviceId);
      try {
        const od = p.onDisconnect().remove();
        if (od && od.catch) od.catch(() => {});
      } catch (x) {}
      p.set({
        k: /Mobi|Android|iPhone/i.test(navigator.userAgent)
          ? "Celular"
          : "Computador",
        t: firebase.database.ServerValue.TIMESTAMP,
      }).catch(() => {});
      if (notifiedOffline) {
        notifiedOffline = false;
        Toast.success("☁️ Conexión restablecida");
      }
      if (ready) {
        setStatus("online");
        schedulePush();
      } else if (!paused && status !== "error") setStatus("connecting");
    } else {
      if (ready) {
        setStatus("offline");
        if (!notifiedOffline) {
          notifiedOffline = true;
          Toast.warning(
            "Sin conexión: tus cambios se guardan y se enviarán al reconectar",
          );
        }
      } else if (!paused && status !== "error")
        setStatus(Date.now() - t0 > 6000 ? "offline" : "connecting");
    }
  }

  /* ---------- carga del SDK e inicio ---------- */
  function loadScript(src, ms) {
    return new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = src;
      const t = setTimeout(() => rej(new Error("tiempo agotado")), ms || 15000);
      s.onload = () => {
        clearTimeout(t);
        res();
      };
      s.onerror = () => {
        clearTimeout(t);
        rej(new Error("no se pudo descargar " + src.split("/").pop()));
      };
      document.head.appendChild(s);
    });
  }
  async function loadOne(f) {
    try {
      await loadScript(FIREBASE_SDK_LOCAL + f, 6000);
    } catch (e) {
      await loadScript(FIREBASE_SDK_URL + f);
    }
  }
  async function loadSdk() {
    if (window.firebase && firebase.database) return;
    await loadOne("firebase-app-compat.js");
    await Promise.all([
      loadOne("firebase-database-compat.js"),
      loadOne("firebase-auth-compat.js").catch(() => {}),
    ]);
  }
  function withTimeout(p, ms, code) {
    return Promise.race([
      p,
      new Promise((_, rj) =>
        setTimeout(() => rj({ code: code || "timeout" }), ms),
      ),
    ]);
  }
  const accountsFlag = () => LS("pos_accounts") === "1";
  const accountsMode = () =>
    accountsFlag() || accountsCloud || !!(staff && Object.keys(staff).length);
  const emailUser = () => !!(user && !user.isAnonymous);
  const myRole = () => {
    if (!emailUser()) return null;
    if (staffKnown) return me ? me.r : null;
    return LS("pos_role_" + user.uid);
  };
  function ensureDb() {
    const uid = user ? user.uid : null;
    if (dbStarted && (listenFailed || dbUid !== uid)) stopDb();
    listenFailed = false;
    startDb();
  }
  const failListen = (e) => {
    listenFailed = true;
    fail(e);
  };
  function startDb() {
    if (dbStarted) return;
    dbStarted = true;
    dbUid = user ? user.uid : null;
    db.ref(".info/connected").on("value", (s) => {
      connected = !!s.val();
      onConn();
    });
    db.ref(".info/serverTimeOffset").on(
      "value",
      (s) => {
        offset = +s.val() || 0;
      },
      () => {},
    );
    NODES.forEach((n) =>
      ref.child(n).on(
        "value",
        (snap) => {
          R[n] = snap.val();
          got[n] = 1;
          queuePull();
        },
        (e) => {
          /* Un nodo sin permiso (reglas viejas) no debe detener toda la sincronización */
          if (!isDenied(e)) return failListen(e);
          readDenied.add(n);
          denied.add(n);
          got[n] = 1;
          noteDenied();
          queuePull();
        },
      ),
    );
    ref.child("presence").on(
      "value",
      (snap) => {
        const v = snap.val() || {};
        devices = Object.keys(v).map((k) => Object.assign({ id: k }, v[k]));
        if (modalOpen()) renderModal();
      },
      () => {},
    );
    ref.child("staff").on(
      "value",
      (snap) => {
        staff = snap.val();
        if (staff && Object.keys(staff).length) {
          accountsCloud = true;
          LSset("pos_accounts", "1");
        }
        if (modalOpen()) renderModal();
      },
      () => {},
    );
    if (emailUser())
      ref.child("staff/" + user.uid).on(
        "value",
        (snap) => {
          me = snap.val();
          staffKnown = true;
          if (booted) gate();
          if (modalOpen()) renderModal();
        },
        () => {},
      );
    ref.child("accounts").on(
      "value",
      (snap) => {
        if (snap.val() === true) {
          accountsCloud = true;
          LSset("pos_accounts", "1");
        }
      },
      () => {},
    );
    setTimeout(() => {
      if (!connected && !ready && status === "connecting") setStatus("offline");
    }, 6500);
  }
  function stopDb() {
    if (!dbStarted) return;
    try {
      NODES.concat(["presence", "staff", "accounts"]).forEach((n) =>
        ref.child(n).off(),
      );
      if (user) ref.child("staff/" + user.uid).off();
      db.ref(".info/connected").off();
    } catch (e) {}
    dbStarted = false;
    ready = false;
    first = false;
    got = {};
    R = {};
    connected = false;
    clearTimeout(pushT);
    clearTimeout(pullT);
  }
  async function readStaff() {
    if (!user || !ref) return;
    try {
      const f = await withTimeout(ref.child("accounts").once("value"), 7000);
      if (f.val() === true) {
        accountsCloud = true;
        LSset("pos_accounts", "1");
      }
      staffKnown = true;
      if (emailUser()) {
        const m = await withTimeout(
          ref.child("staff/" + user.uid).once("value"),
          7000,
        );
        me = m.val();
      }
    } catch (e) {
      staffKnown = false;
    }
  }
  /* Decide si se puede entrar: sin cuentas = modo anterior; con cuentas = hace falta sesión con correo y rol */
  function gate() {
    if (!app) return;
    const acc = accountsMode();
    app.setAccountsMode(acc);
    if (!acc) {
      denied.clear();
      ensureDb();
      return;
    }
    if (!emailUser()) {
      stopDb();
      setStatus("paused", "Inicia sesión con tu cuenta para sincronizar.");
      if (app.currentRole) app.forceLogout();
      return;
    }
    const r = myRole();
    if (!r) {
      if (staffKnown) {
        const uid = user.uid,
          mail = user.email;
        const done = () => {
          app.accountError(
            "Tu cuenta aún no tiene acceso a este negocio. Ya le enviamos una solicitud al administrador; vuelve a entrar cuando te apruebe.",
          );
          signOut();
        };
        ref
          .child("requests/" + uid)
          .set({ e: mail, t: Date.now() })
          .then(done, done);
      } else
        setStatus(
          "error",
          "No se pudo verificar tu cuenta. Revisa tu conexión.",
        );
      return;
    }
    if (r) {
      LSset("pos_role_" + user.uid, r);
      denied.clear();
      ensureDb();
      app.loginFromCloud(r, user.email);
      if (r === "admin")
        loadRequests().then(() => {
          const n = Object.keys(requests).length;
          if (n)
            Toast.info(
              n + " solicitud(es) de acceso pendientes (☁️ Sincronización)",
            );
        });
    }
  }
  function onUser(u) {
    user = u;
    if (!booted) return;
    readStaff().then(gate);
  }
  function firstUser() {
    return withTimeout(
      new Promise((res) => {
        const off = auth.onAuthStateChanged((u) => {
          off();
          res(u);
        });
      }),
      6000,
    ).catch(() => auth.currentUser);
  }
  async function start(a) {
    app = a;
    shadow = loadShadow();
    setStatus("connecting");
    try {
      await loadSdk();
    } catch (e) {
      app.setAccountsMode(false);
      setStatus(
        "local",
        "No se pudo cargar Firebase (" +
          e.message +
          "). La app sigue funcionando sin sincronizar.",
      );
      return;
    }
    try {
      if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
      db = firebase.database();
      ref = db.ref("pos/" + storeId);
      auth = firebase.auth ? firebase.auth() : null;
      if (auth) {
        user = await firstUser();
        if (!user && !accountsFlag()) {
          try {
            await withTimeout(auth.signInAnonymously(), 8000);
            user = auth.currentUser;
          } catch (e) {
            authNote = (e && (e.code || e.message)) || "";
          }
        }
        auth.onAuthStateChanged(onUser);
      }
      await readStaff();
      booted = true;
      gate();
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") writeShadow();
        else if (dbStarted) {
          try {
            db.goOnline();
          } catch (e) {}
          schedulePush();
        }
      });
      window.addEventListener("pagehide", writeShadow);
    } catch (e) {
      setStatus("error", (e && e.message) || String(e));
    }
  }

  /* ---------- cuentas ---------- */
  const AUTH_MSG = {
    "auth/invalid-credential": "Correo o contraseña incorrectos.",
    "auth/wrong-password": "Correo o contraseña incorrectos.",
    "auth/user-not-found": "Correo o contraseña incorrectos.",
    "auth/invalid-email": "El correo no es válido.",
    "auth/too-many-requests": "Demasiados intentos. Espera unos minutos.",
    "auth/network-request-failed": "Sin conexión con el servicio de cuentas.",
    "auth/email-already-in-use": "Ese correo ya tiene una cuenta.",
    "auth/weak-password": "La contraseña debe tener al menos 6 caracteres.",
    "auth/operation-not-allowed":
      "Activa «Correo electrónico/contraseña» en Firebase → Authentication → Método de acceso.",
    "auth/user-disabled": "Esta cuenta está deshabilitada.",
  };
  const authMsg = (c) => AUTH_MSG[c] || "No se pudo completar (" + c + ")";
  const $ = (id) => document.getElementById(id);
  const val = (id) => ($(id) ? $(id).value : "").trim();
  function formErr(m) {
    const e = $("accError");
    if (e) {
      e.textContent = m || "";
      e.style.display = m ? "block" : "none";
    }
  }
  async function signInFromForm() {
    const e = val("accEmail"),
      p = $("accPass") ? $("accPass").value : "";
    formErr("");
    if (!auth) {
      formErr("Sin conexión con el servicio de cuentas. Revisa tu internet.");
      return;
    }
    if (!e || !p) {
      formErr("Escribe tu correo y contraseña.");
      return;
    }
    const b = $("accBtn");
    if (b) b.disabled = true;
    try {
      await auth.signInWithEmailAndPassword(e, p);
      if ($("accPass")) $("accPass").value = "";
    } catch (err) {
      const bad = /invalid-credential|wrong-password|user-not-found/.test(
        err.code || "",
      );
      formErr(
        authMsg(err.code) +
          (bad ? " Si la olvidaste, pulsa «¿Olvidaste tu contraseña?»." : ""),
      );
    } finally {
      if (b) b.disabled = false;
    }
  }
  async function resetFromForm() {
    const e = val("accEmail");
    formErr("");
    if (!auth) {
      formErr("Sin conexión con el servicio de cuentas.");
      return;
    }
    if (!e) {
      formErr("Escribe tu correo arriba y vuelve a pulsar.");
      return;
    }
    try {
      await auth.sendPasswordResetEmail(e);
      Toast.success("Te enviamos un correo para cambiar la contraseña");
    } catch (err) {
      formErr(authMsg(err.code));
    }
  }
  async function signOut() {
    try {
      if (auth) await auth.signOut();
    } catch (e) {}
    user = null;
    if (accountsMode()) {
      stopDb();
      setStatus("paused", "Inicia sesión con tu cuenta para sincronizar.");
    }
  }
  function onLogout() {
    if (accountsMode()) signOut();
  }
  async function checkPassword(p) {
    if (
      accountsMode() &&
      emailUser() &&
      firebase.auth &&
      firebase.auth.EmailAuthProvider
    ) {
      try {
        await user.reauthenticateWithCredential(
          firebase.auth.EmailAuthProvider.credential(user.email, p),
        );
        return true;
      } catch (e) {
        return false;
      }
    }
    return checkAdminPassword(p);
  }
  let requests = {};
  function loadRequests() {
    if (!ref || !accountsMode()) return Promise.resolve();
    return ref
      .child("requests")
      .once("value")
      .then((sn) => {
        requests = sn.val() || {};
      })
      .catch(() => {
        requests = {};
      });
  }
  async function approveRequest(uid) {
    const q = requests[uid];
    if (!q) return;
    const sel = $("reqRole_" + uid);
    const r = sel && sel.value === "admin" ? "admin" : "employee";
    try {
      await ref.child("staff/" + uid).set({ r: r, e: q.e });
      await ref.child("requests/" + uid).remove();
      Toast.success("Acceso aprobado: " + q.e);
      await loadRequests();
      renderModal();
    } catch (err) {
      Toast.error(authMsg(err.code || err.message));
    }
  }
  async function rejectRequest(uid) {
    try {
      await ref.child("requests/" + uid).remove();
      await loadRequests();
      renderModal();
    } catch (err) {
      Toast.error(authMsg(err.code || err.message));
    }
  }
  async function sendReset(email) {
    if (!auth || !email) return;
    try {
      await auth.sendPasswordResetEmail(email);
      Toast.success("Correo para cambiar la contraseña enviado a " + email);
    } catch (err) {
      Toast.error(authMsg(err.code || err.message));
    }
  }
  function resetMine() {
    if (user && user.email) sendReset(user.email);
  }
  function resetStaff(uid) {
    const s = (staff || {})[uid];
    if (s && s.e) sendReset(s.e);
  }
  /* Crea la cuenta; si el correo ya existía (cuenta quitada antes) intenta reactivarla con esa contraseña */
  async function createOrReuse(authObj, e, p) {
    try {
      return (await authObj.createUserWithEmailAndPassword(e, p)).user;
    } catch (err) {
      if (err.code !== "auth/email-already-in-use") throw err;
      try {
        return (await authObj.signInWithEmailAndPassword(e, p)).user;
      } catch (e2) {
        const x = new Error("exists");
        x.code = "pos/exists-other-password";
        throw x;
      }
    }
  }
  const EXISTS_MSG =
    "Ese correo ya tuvo una cuenta con otra contraseña. Pídele a la persona que entre con «Entrar con una cuenta» (puede usar «¿Olvidaste tu contraseña?»): te llegará aquí una solicitud para aprobar.";
  async function createAdmin() {
    const e = val("accNewEmail"),
      p = ($("accNewPass") || { value: "" }).value;
    if (!auth) {
      Toast.error("Sin conexión con Firebase");
      return;
    }
    if (!e || p.length < 6) {
      Toast.error("Escribe un correo y una contraseña de 6 o más caracteres");
      return;
    }
    try {
      user = await createOrReuse(auth, e, p);
      await ref.update({
        ["staff/" + user.uid]: { r: "admin", e: e },
        accounts: true,
      });
      LSset("pos_accounts", "1");
      LSset("pos_role_" + user.uid, "admin");
      accountsCloud = true;
      staffKnown = true;
      me = { r: "admin", e: e };
      staff = Object.assign({}, staff, { [user.uid]: { r: "admin", e: e } });
      Toast.success(
        "✅ Cuenta de administrador creada. Ahora actualiza las reglas de Firebase (abajo).",
      );
      gate();
      renderModal();
    } catch (err) {
      if (err.code === "pos/exists-other-password")
        Toast.error(
          "Ese correo ya existe con otra contraseña. Escribe la contraseña que tenía.",
        );
      else Toast.error(authMsg(err.code || err.message));
    }
  }
  async function addStaff() {
    const e = val("accNewEmail"),
      p = ($("accNewPass") || { value: "" }).value,
      r = val("accNewRole") || "employee";
    if (!e || p.length < 6) {
      Toast.error("Escribe un correo y una contraseña de 6 o más caracteres");
      return;
    }
    let sec = null;
    try {
      sec = firebase.initializeApp(FIREBASE_CONFIG, "sec" + Date.now());
      const u = await createOrReuse(sec.auth(), e, p);
      const uid = u.uid;
      await sec.auth().signOut();
      await ref.child("staff/" + uid).set({ r: r, e: e });
      await ref
        .child("requests/" + uid)
        .remove()
        .catch(() => {});
      Toast.success("✅ Cuenta agregada: " + e);
      if ($("accNewEmail")) $("accNewEmail").value = "";
      if ($("accNewPass")) $("accNewPass").value = "";
    } catch (err) {
      if (err.code === "pos/exists-other-password") Toast.warning(EXISTS_MSG);
      else Toast.error(authMsg(err.code || err.message));
    } finally {
      if (sec) {
        try {
          await sec.delete();
        } catch (x) {}
      }
    }
  }
  async function removeStaff(uid) {
    if (user && uid === user.uid) {
      Toast.error("No puedes quitarte a ti mismo");
      return;
    }
    if (
      !confirm(
        "¿Quitar el acceso a esta cuenta? Ya no podrá ver ni registrar datos.",
      )
    )
      return;
    try {
      await ref.child("staff/" + uid).remove();
      Toast.success("Acceso retirado");
    } catch (err) {
      Toast.error(authMsg(err.code || err.message));
    }
  }

  /* ---------- reglas recomendadas de Firebase ---------- */
  function rulesText(mode) {
    if (mode === "A")
      return JSON.stringify(
        {
          rules: {
            pos: {
              $store: { ".read": "auth != null", ".write": "auth != null" },
            },
          },
        },
        null,
        2,
      );
    const S =
      "auth != null && root.child('pos').child($store).child('staff').child(auth.uid).exists()";
    const A =
      "auth != null && root.child('pos').child($store).child('staff').child(auth.uid).child('r').val() === 'admin'";
    const BOOT = "!root.child('pos').child($store).child('staff').exists()";
    const node = {
      accounts: {
        ".read": "auth != null",
        ".write":
          "auth != null && (" +
          A.replace("auth != null && ", "") +
          " || (" +
          BOOT +
          " && newData.val() === true))",
        ".validate": "newData.val() === true",
      },
      staff: {
        ".read": A,
        $uid: {
          ".read": "auth != null && auth.uid === $uid",
          ".write":
            "auth != null && (" +
            A.replace("auth != null && ", "") +
            " || (auth.uid === $uid && newData.child('r').val() === 'admin' && !root.child('pos').child($store).child('staff').exists()))",
          ".validate":
            "newData.child('r').val() === 'admin' || newData.child('r').val() === 'employee'",
        },
      },
    };
    node.requests = {
      ".read": A,
      $uid: {
        ".write":
          "auth != null && (auth.uid === $uid || " +
          A.replace("auth != null && ", "") +
          ")",
        ".validate": "newData.hasChildren(['e','t'])",
      },
    };
    EMP_NODES.forEach((n) => {
      node[n] = { ".read": S, ".write": S };
    });
    ADM_NODES.forEach((n) => {
      node[n] = { ".read": n === "archives" ? A : S, ".write": A };
    });
    return JSON.stringify({ rules: { pos: { $store: node } } }, null, 2);
  }
  function copyRules() {
    const t = $("rulesTxt");
    if (!t) return;
    t.select();
    try {
      navigator.clipboard.writeText(t.value);
      Toast.success("Reglas copiadas");
    } catch (e) {
      document.execCommand && document.execCommand("copy");
      Toast.success("Reglas copiadas");
    }
  }

  /* ---------- ventana «Sincronización» ---------- */
  function renderModal() {
    const el = $("syncBody");
    if (!el) return;
    const admin = app && app.currentRole === "admin";
    const esc = (v) => Utils.sanitizeInput(String(v));
    const dev = devices.length
      ? devices
          .map(
            (d) =>
              '<div class="sync-dev">' +
              (d.id === deviceId
                ? "📍 Este dispositivo"
                : d.k === "Celular"
                  ? "📱 Celular"
                  : "💻 Computador") +
              "</div>",
          )
          .join("")
      : '<div class="sync-dev">—</div>';
    const acc = accountsMode();
    let h =
      '<div class="sync-status"><span class="cloud-dot ' +
      status +
      ' static"></span><b>' +
      LABEL[status] +
      "</b></div>" +
      (statusMsg ? '<p class="sync-note">' + esc(statusMsg) + "</p>" : "") +
      (permNote
        ? '<p class="sync-note" style="color:var(--warning,#f59e0b)">⚠️ ' +
          esc(permNote) +
          "</p>"
        : "") +
      (/operation-not-allowed|admin-restricted|configuration-not-found/.test(
        authNote,
      )
        ? '<p class="sync-note">El inicio de sesión anónimo no está activado (' +
          esc(authNote) +
          `). Si tus reglas exigen sesión, actívalo en Firebase → Authentication → Método de acceso → Anónimo.</p>`
        : "") +
      '<p class="sync-note">' +
      (lastSync
        ? "Última sincronización: " +
          new Date(lastSync).toLocaleTimeString("es-CO")
        : "Aún sin sincronizar") +
      (pendingWrites ? " · enviando…" : "") +
      "</p>" +
      '<div class="form-group"><label class="form-label">Dispositivos conectados (' +
      devices.length +
      ")</label>" +
      dev +
      "</div>";
    if (emailUser())
      h +=
        `<div class="form-group">
          <label class="form-label">Tu cuenta</label><div class="sync-dev">👤 ` +
        esc(user.email) +
        " · <b>" +
        (myRole() === "admin" ? "Administrador" : "Empleado") +
        `</b></div>
          <button
            class="btn btn-outline btn-sm"
            style="margin-top:.4rem"
            onclick="app.hideModal('syncModal');app.logout()">Cerrar sesión</button>
          <button
            class="btn btn-outline btn-sm"
            style="margin-top:.4rem"
            onclick="Cloud.resetMine()">🔑 Cambiar mi contraseña</button></div>`;
    let adv = "";
    if (admin) {
      adv +=
        `<div class="form-group">
        <label class="form-label">Código del negocio</label><input class="form-input"
        id="syncCode"
        value="` +
        esc(storeId) +
        `" autocapitalize="off"
        autocomplete="off"
        spellcheck="false"><p class="sync-note">⚠️ Solo cámbialo si sabes lo que haces: todos los dispositivos deben usar el mismo código. Pide la contraseña de administrador.</p>
        </div><button
            class="btn btn-outline"
            style="width:100%"
            onclick="Cloud.saveCode()">Cambiar código</button>`;
    }
    if (admin && auth) {
      h += `<div class="sync-sep">
          </div>
          <div class="form-group">
          <label class="form-label">🔐 Cuentas del negocio</label>`;
      if (!acc) {
        h +=
          `<p class="sync-note">Ahora cualquiera con el enlace y el código puede entrar. Crea la cuenta del administrador para exigir correo y contraseña (los empleados se agregan después).</p>` +
          `<input
              class="form-input"
              id="accNewEmail"
              type="email"
              placeholder="Correo del administrador"
              autocomplete="off"
              style="margin-bottom:.4rem"><input
              class="form-input"
              id="accNewPass"
              type="password"
              placeholder="Contraseña (mínimo 6)"
              autocomplete="new-password"
              style="margin-bottom:.5rem"><button
              class="btn btn-primary"
              style="width:100%"
              onclick="Cloud.createAdmin()">Crear cuenta y proteger</button>`;
      } else {
        const rows = Object.keys(staff || {})
          .map((uid) => {
            const s = staff[uid] || {};
            return (
              '<div class="sync-dev sync-staff"><span>' +
              (s.r === "admin" ? "🛡️" : "👤") +
              " " +
              esc(s.e || uid) +
              " <small>(" +
              (s.r === "admin" ? "admin" : "empleado") +
              ")</small></span>" +
              '<button class="btn btn-outline btn-sm" title="Enviar correo para cambiar la contraseña" onclick="Cloud.resetStaff(\'' +
              esc(uid) +
              "')\">🔑</button>" +
              (user && uid === user.uid
                ? ""
                : '<button class="btn btn-outline btn-sm" onclick="Cloud.removeStaff(\'' +
                  esc(uid) +
                  "')\">Quitar</button>") +
              "</div>"
            );
          })
          .join("");
        const reqs = Object.keys(requests || {})
          .map(
            (uid) =>
              '<div class="sync-dev sync-staff"><span>🔔 ' +
              esc((requests[uid] || {}).e || uid) +
              '</span><span><select class="form-select" id="reqRole_' +
              esc(uid) +
              '"><option value="employee">Empleado</option><option value="admin">Admin</option></select> ' +
              '<button class="btn btn-primary btn-sm" onclick="Cloud.approveRequest(\'' +
              esc(uid) +
              "')\">Aprobar</button> " +
              '<button class="btn btn-outline btn-sm" onclick="Cloud.rejectRequest(\'' +
              esc(uid) +
              "')\">✕</button></span></div>",
          )
          .join("");
        h +=
          (reqs
            ? '<p class="sync-note" style="margin-top:.6rem">Solicitudes de acceso:</p>' +
              reqs
            : "") +
          rows +
          `<p
              class="sync-note"
              style="margin-top:.6rem">Agregar persona:</p>
            <input
              class="form-input"
              id="accNewEmail"
              type="email"
              placeholder="Correo"
              autocomplete="off"
              style="margin-bottom:.4rem"><input
              class="form-input"
              id="accNewPass"
              type="password"
              placeholder="Contraseña (mínimo 6)"
              autocomplete="new-password"
              style="margin-bottom:.4rem"><select
              class="form-select"
              id="accNewRole"
              style="margin-bottom:.5rem"><option value="employee">Empleado / Cajero</option><option value="admin">Administrador</option></select><button
              class="btn btn-primary"
              style="width:100%"
              onclick="Cloud.addStaff()">Agregar</button>`;
      }
      h += "</div>";
      adv +=
        `<details style="margin-top:.8rem"><summary
            class="sync-note"
            style="cursor:pointer">Reglas de Firebase recomendadas (` +
        (acc ? "con cuentas" : "actuales") +
        ')</summary><p class="sync-note">' +
        (acc
          ? "Pégalas en Firebase → Realtime Database → Reglas → Publicar. Hazlo apenas crees la cuenta de administrador."
          : "Mientras no uses cuentas, estas reglas exigen al menos sesión anónima.") +
        `</p>
          <textarea
            id="rulesTxt"
            class="form-input"
            readonly
            rows="8"
            style="font-family:monospace;font-size:12px">` +
        esc(rulesText(acc ? "B" : "A")) +
        `</textarea><button
            class="btn btn-outline btn-sm"
            style="margin-top:.4rem"
            onclick="Cloud.copyRules()">Copiar reglas</button></details>`;
    }
    h +=
      `<div class="sync-sep">
        </div>
        <details><summary class="sync-note" style="cursor:pointer">⚙️ Opciones avanzadas</summary>` +
      (adv ||
        '<p class="sync-note">Solo el administrador puede ver estas opciones.</p>') +
      `</details>
        <button
          class="btn btn-outline"
          style="width:100%;margin-top:.6rem"
          onclick="Cloud.retry()">Reintentar / sincronizar ahora</button>` +
      (PWA.canInstall()
        ? `<button
            class="btn btn-primary"
            style="width:100%;margin-top:.5rem"
            onclick="PWA.install()">📲 Instalar la app en este dispositivo</button>`
        : `<p
            class="sync-note"
            style="margin-top:.6rem">Para instalarla: en Android, menú ⋮ → «Instalar app»; en iPhone, Compartir → «Agregar a inicio».</p>`) +
      '<p class="sync-note">Versión ' +
      APP_VERSION +
      "</p>";
    el.innerHTML = h;
  }
  function openModal() {
    if (!(app && app.currentRole === "admin")) {
      Toast.info(
        "Sincronización: " +
          LABEL[status] +
          (devices.length ? " · " + devices.length + " dispositivo(s)" : ""),
      );
      return;
    }
    app.showModal("syncModal");
    renderModal();
    loadRequests().then(() => {
      if (modalOpen()) renderModal();
    });
  }
  function saveCode() {
    if (!(app && app.currentRole === "admin")) {
      Toast.error("Solo el administrador puede cambiar el código");
      return;
    }
    const c = (document.getElementById("syncCode").value || "").trim();
    if (!/^[A-Za-z0-9_-]{3,40}$/.test(c)) {
      Toast.error("Usa 3 a 40 letras, números, - o _");
      return;
    }
    if (c === storeId) {
      Toast.info("Ese ya es el código actual");
      return;
    }
    app.hideModal("syncModal");
    app.state.passwordCallback = () => {
      const warn =
        "Cambiar el código abre un espacio de datos NUEVO y vacío en este dispositivo; las ventas actuales no se mueven. ¿Continuar?";
      if (!confirm(warn)) return;
      app.persistLocal();
      LSset("pos_store_code", c);
      Toast.success("Código guardado. Recargando…");
      setTimeout(() => location.reload(), 600);
    };
    document.getElementById("adminPassword").value = "";
    document.getElementById("passwordError").style.display = "none";
    document.getElementById("passwordModalDesc").textContent =
      "Contraseña de administrador";
    app.showModal("passwordModal");
  }
  function retry() {
    if (!ref || readDenied.size) {
      if (app) app.persistLocal();
      location.reload();
      return;
    }
    paused = false;
    errShown = false;
    deniedNotified = false;
    denied.clear();
    if (status === "error" || status === "paused") setStatus("connecting");
    readStaff().then(() => {
      if (!first) onRemote();
      else {
        reconcile(false);
        schedulePush();
      }
    });
  }
  function pushArchive(a) {
    try {
      if (ref && !paused)
        ref
          .child("archives/" + a.archivedAt)
          .set(JSON.stringify(a))
          .catch((e) => {
            if (isDenied(e))
              Toast.warning(
                "No se pudo guardar el archivo del día en la nube: tu cuenta no tiene permiso",
              );
          });
    } catch (e) {}
  }

  return {
    start,
    schedulePush,
    pushArchive,
    openModal,
    saveCode,
    retry,
    renderModal,
    signInFromForm,
    resetFromForm,
    signOut,
    onLogout,
    checkPassword,
    createAdmin,
    addStaff,
    removeStaff,
    approveRequest,
    rejectRequest,
    resetMine,
    resetStaff,
    copyRules,
    rulesText,
    now: () => Date.now() + offset,
    offset: () => offset,
    accountsFlag,
    available: () => !!auth,
    rulesSpec: () => ({ emp: EMP_NODES.slice(), adm: ADM_NODES.slice() }),
    info: () => ({
      status,
      ready,
      storeId,
      deviceId,
      devices: devices.length,
      shadow: Object.keys(shadow).length,
      pendingWrites,
    }),
  };
})();
