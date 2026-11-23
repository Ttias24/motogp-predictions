// Teamfärger. MotoGP:s teamlista har en färg per team, men flera team har bara en mörkgrå
// platshållare (#262626). Deras bakgrundsbild (en suddig bild i teamets riktiga färger) används då
// i stället: den vanligaste tydliga färgen i bilden. Bilden läses med Nodes inbyggda zlib.
import { inflateSync } from "node:zlib";

/** Mörkgrå platshållare eller i praktiken svart: ingen riktig teamfärg. */
export function isPlaceholder(hex) {
  const c = parseHex(hex);
  if (!c) return true;
  return hex.toLowerCase() === "#262626" || luminance(c) < 0.03;
}

/** Läsbar textfärg på en platta i färgen (för nummerplattor). */
export function textColorFor(hex) {
  const c = parseHex(hex);
  return c && luminance(c) > 0.45 ? "#1b2027" : "#ffffff";
}

function parseHex(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? "").trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance([r, g, b]) {
  const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** Minimal PNG-avkodare: 8 bitar, RGB/RGBA, inte radsprängd (som MotoGP:s bakgrundsbilder). */
export function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not a png");
  let pos = 8;
  let w, h, depth, ctype, interlace;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      depth = data[8];
      ctype = data[9];
      interlace = data[12];
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  if (depth !== 8 || interlace !== 0 || ![2, 6].includes(ctype)) throw new Error(`unsupported png (${depth}/${ctype}/${interlace})`);
  const bpp = ctype === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)];
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const row = px.subarray(y * stride, (y + 1) * stride);
    const prev = y ? px.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? row[x - bpp] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= bpp ? prev[x - bpp] : 0;
      let v = src[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      row[x] = v & 255;
    }
  }
  return { w, h, bpp, px };
}

/** Vanligaste tydliga färgen: pixlarna sorteras i färgfack, viktade efter mättnad och ljushet. */
export function dominantColor({ w, h, bpp, px }) {
  const bins = new Map();
  const step = Math.max(1, Math.floor(Math.sqrt((w * h) / 40000)));
  for (let y = 0; y < h; y += step)
    for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * bpp;
      if (bpp === 4 && px[i + 3] < 128) continue;
      const r = px[i], g = px[i + 1], b = px[i + 2];
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      if (max < 40) continue;
      const sat = (max - min) / max;
      const key = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
      const e = bins.get(key) ?? { n: 0, r: 0, g: 0, b: 0, weight: 0 };
      e.n++;
      e.r += r;
      e.g += g;
      e.b += b;
      e.weight += 0.25 + sat * (max / 255);
      bins.set(key, e);
    }
  const best = [...bins.values()].sort((a, b) => b.weight - a.weight)[0];
  if (!best) return null;
  const hex = (v) => Math.round(v / best.n).toString(16).padStart(2, "0");
  return "#" + hex(best.r) + hex(best.g) + hex(best.b);
}

/**
 * Färg för ett team från teamlistan. `cached` = samma team från förra hämtningen, så bilden
 * bara laddas ner när den är ny eller har bytts.
 */
export async function teamColor(team, cached) {
  const api = team.color ?? null;
  const base = { name: team.name, color: api, textColor: team.text_color ?? textColorFor(api), source: "api" };
  if (!isPlaceholder(api) || !team.background_picture) return base;
  if (cached?.bg === team.background_picture && cached.source === "image") return { ...cached, name: team.name };
  try {
    const res = await fetch(team.background_picture, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const color = dominantColor(decodePng(Buffer.from(await res.arrayBuffer())));
    if (!color || isPlaceholder(color)) return base;
    return { name: team.name, color, textColor: textColorFor(color), source: "image", bg: team.background_picture };
  } catch (err) {
    console.warn(`  Kunde inte läsa teamfärg ur bild för ${team.name}: ${err.message}`);
    return base;
  }
}

/** Nyckel för att känna igen ett team på namnet ("Leopard Racing " = "leopard racing"). */
export const teamKey = (name) => String(name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
