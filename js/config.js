/* Configuración general: moneda, Firebase y versión. Edita aquí tus datos de Firebase. */

const DEFAULT_CONFIG = {
  adminHash: "240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9",
  currency: "COP",
  locale: "es-CO",
};

const CONFIG = {
  ...DEFAULT_CONFIG,
  ...(Storage_get("pos_config") || {}),
  adminHash: DEFAULT_CONFIG.adminHash,
};

/* ===== SINCRONIZACIÓN EN LA NUBE (Firebase Realtime Database) =====
   - Cada venta, producto, gasto, etc. se guarda como un registro independiente (no se pisan entre dispositivos).
   - Stock y contadores de pollos usan incrementos atómicos (dos ventas simultáneas se suman, no se pierden).
   - Si no hay internet la app sigue funcionando y se sincroniza al reconectar. */
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAhmitx-UIJwWUYtO-cdIRHj-j4shbKkO4",
  authDomain: "polloasadopos.firebaseapp.com",
  databaseURL: "https://polloasadopos-default-rtdb.firebaseio.com",
  projectId: "polloasadopos",
  storageBucket: "polloasadopos.firebasestorage.app",
  messagingSenderId: "171480225663",
  appId: "1:171480225663:web:bf82293ce40717d0972c4a",
  measurementId: "G-BBC04D246S",
};

const FIREBASE_SDK_URL = "https://www.gstatic.com/firebasejs/10.14.1/";

const FIREBASE_SDK_LOCAL = "vendor/firebase/";

const APP_VERSION = "2.3.0";
