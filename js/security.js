/* Contraseña de administrador (se guarda solo su huella SHA-256). */

function sha256(str) {
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  const bytes = Array.from(new TextEncoder().encode(str));
  const K = [],
    H = [];
  for (let p = 2, c = 0; c < 64; p++) {
    let pr = true;
    for (let d = 2; d * d <= p; d++)
      if (p % d === 0) {
        pr = false;
        break;
      }
    if (pr) {
      if (c < 8) H[c] = ((Math.pow(p, 0.5) % 1) * 4294967296) | 0;
      K[c] = ((Math.pow(p, 1 / 3) % 1) * 4294967296) | 0;
      c++;
    }
  }
  const bl = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  const hi = Math.floor(bl / 4294967296),
    lo = bl >>> 0;
  bytes.push(
    (hi >>> 24) & 255,
    (hi >>> 16) & 255,
    (hi >>> 8) & 255,
    hi & 255,
    (lo >>> 24) & 255,
    (lo >>> 16) & 255,
    (lo >>> 8) & 255,
    lo & 255,
  );
  for (let i = 0; i < bytes.length; i += 64) {
    const w = [];
    for (let j = 0; j < 16; j++)
      w[j] =
        (bytes[i + 4 * j] << 24) |
        (bytes[i + 4 * j + 1] << 16) |
        (bytes[i + 4 * j + 2] << 8) |
        bytes[i + 4 * j + 3];
    for (let j = 16; j < 64; j++) {
      const s0 = rotr(w[j - 15], 7) ^ rotr(w[j - 15], 18) ^ (w[j - 15] >>> 3),
        s1 = rotr(w[j - 2], 17) ^ rotr(w[j - 2], 19) ^ (w[j - 2] >>> 10);
      w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let j = 0; j < 64; j++) {
      const t1 =
          (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[j] + w[j]) | 0,
        t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }
    H[0] = (H[0] + a) | 0;
    H[1] = (H[1] + b) | 0;
    H[2] = (H[2] + c) | 0;
    H[3] = (H[3] + d) | 0;
    H[4] = (H[4] + e) | 0;
    H[5] = (H[5] + f) | 0;
    H[6] = (H[6] + g) | 0;
    H[7] = (H[7] + h) | 0;
  }
  return H.map((x) => (x >>> 0).toString(16).padStart(8, "0")).join("");
}

function checkAdminPassword(p) {
  return sha256(String(p || "")) === CONFIG.adminHash;
}
