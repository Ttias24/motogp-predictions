// Små hjälpfunktioner för HTML-rendering.
import { t, fmt } from "./i18n.js";
import { DNF_STATUSES } from "./scoring.js";

export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// 200 spelarfärger som delas ut i tur och ordning (spelare 1 får den första osv.).
// De tio första är de ursprungliga. Resten är valda så att varje ny färg ligger så långt som
// möjligt från alla tidigare (OKLab-avstånd), så de första spelarna får de mest olika färgerna.
// Inga gråtoner: låg färgmättnad finns bara som ljusa pastellfärger. Fungerar i mörkt och ljust läge.
export const PLAYER_COLORS = [
  "#4fc3f7", "#ffb74d", "#81c784", "#ce93d8", "#f48fb1", "#fff176", "#4db6ac", "#ff8a65", "#9fa8da", "#c5e1a5",
  "#805bfe", "#de1399", "#9c7b22", "#ea2413", "#36fe6a", "#1387cc", "#0aa424", "#f7cdff", "#ab6887", "#d254f5",
  "#0dfef3", "#34d107", "#409272", "#c0a523", "#c5d203", "#f7537d", "#a8e0f6", "#e4bbb0", "#947fd4", "#fb63cb",
  "#d86d2b", "#ff9bff", "#b351bd", "#5e9efd", "#04dacb", "#7da55c", "#2a76fe", "#6beba2", "#bbf633", "#d271aa",
  "#9bc9bf", "#c9bafe", "#12a6d0", "#00bc70", "#d38685", "#e17ffe", "#cc525c", "#91c119", "#6b8e1f", "#c8c26b",
  "#bb8d52", "#ab41eb", "#fcd6b1", "#a892ff", "#e71a63", "#e68f1b", "#b06c52", "#ff5421", "#737ffd", "#f7d42e",
  "#c74c8d", "#268fa2", "#e1a975", "#a46bf5", "#f1add7", "#84e33d", "#fe38a1", "#14d782", "#df45c3", "#6a91c9",
  "#9bf3d6", "#c56fd5", "#51e5f7", "#a9f68f", "#6578d3", "#a3d976", "#69ad0a", "#9170ab", "#fda297", "#9ec2e6",
  "#989401", "#e76b67", "#b283ba", "#12a49d", "#fe65f6", "#c62fca", "#8867da", "#fa87d9", "#25caa2", "#f2d37e",
  "#3b9f58", "#e4ac17", "#c5caa5", "#f573ad", "#fdc5cf", "#fc374d", "#1a91fb", "#95d8a9", "#bea4fc", "#6caedc",
  "#cfe362", "#d15224", "#a2ae68", "#fcbf8e", "#98aa19", "#63c8d2", "#ccb4d3", "#bb6802", "#14b2fa", "#c77185",
  "#5bffca", "#dd8556", "#c4ccef", "#fe7383", "#19eecc", "#8c98e3", "#f67214", "#85acfd", "#4eac82", "#10bad5",
  "#2feb75", "#8fdfd5", "#23be34", "#c374fb", "#b864ac", "#d38eb1", "#e2a3ef", "#e07ad8", "#e14fa4", "#e39887",
  "#59d9a2", "#ff9945", "#bbbe31", "#848f49", "#dfc637", "#72bc57", "#0cfca4", "#646cf4", "#71d4fe", "#c5a05e",
  "#fd2578", "#7af4fc", "#c27a66", "#e063e2", "#dd4a76", "#72caae", "#c57d08", "#72b88d", "#62d450", "#a768ca",
  "#5c81b9", "#88f727", "#00d4f3", "#2d97dd", "#84f572", "#ecb7fd", "#c8e8cd", "#9f9a51", "#b884e0", "#dadaff",
  "#698ae4", "#cb90f8", "#df9eca", "#da63c1", "#e2698d", "#af7c46", "#9482f8", "#c742a7", "#377ee3", "#9756ea",
  "#ebe62c", "#ba53fd", "#4ae12e", "#e4c0e6", "#ad97e3", "#db2f82", "#b753de", "#eba9b6", "#9af6b6", "#e3c17d",
  "#1cc6c2", "#e1e58e", "#7e80c0", "#e14e46", "#a0d235", "#d0d57e", "#e88396", "#dcd8b2", "#f54fd7", "#89cb61",
  "#b8636b", "#b0e24a", "#3a9eb2", "#e181bf", "#abca88", "#599051", "#95d1e1", "#789f1e", "#45961f", "#ca9415",
];

/** id → { color, short, index } för alla spelare, med unika förkortningar. */
export function playerMeta(players) {
  const meta = new Map();
  const used = new Set();
  players.forEach((p, i) => {
    let short = p.short || "";
    if (!short) {
      const base = (p.name || "?").trim();
      for (let len = 1; len <= base.length; len++) {
        const cand = base.slice(0, len).toUpperCase();
        if (!used.has(cand)) {
          short = len === 1 ? cand : base[0].toUpperCase() + base.slice(1, len).toLowerCase();
          break;
        }
      }
      short ||= String(i + 1);
    }
    used.add(short.toUpperCase());
    meta.set(p.id, { color: p.color || PLAYER_COLORS[i % PLAYER_COLORS.length], short, index: i, name: p.name });
  });
  return meta;
}

/** Liten bricka i spelarens färg med rollen, t.ex. "1", "BU" eller "DNF". */
export function chip(m, { tag = "", variant = "", title = "" } = {}) {
  if (!m) return "";
  return `<span class="chip ${variant}" style="--c:${m.color}" title="${esc(title || m.name)}">${esc(tag || m.short)}</span>`;
}

export function playerName(m, name) {
  return `<span class="pname"><span class="dot" style="--c:${m?.color ?? "#888"}"></span>${esc(name)}</span>`;
}

/** Tolkning av en resultatrad till text + css-klass för tabellceller. */
export function resultCell(entry, mode = "points") {
  if (entry === undefined) return { text: "", cls: "none", title: "" };
  if (entry === null) return { text: "–", cls: "absent", title: t("notEntered") };
  const st = entry.status;
  if (DNF_STATUSES.has(st)) return { text: "DNF", cls: "dnf", title: t("dnfTitle") };
  if (st === "NOTSTARTED" || st === "NOTONRESTARTGRID") return { text: "DNS", cls: "dns", title: t("dnsTitle") };
  if (st === "DISQUALIFIED") return { text: "DQ", cls: "dnf", title: t("dqTitle") };
  if (!entry.pos) return { text: "NC", cls: "dns", title: t("ncTitle") };
  const pos = entry.pos;
  const cls = pos === 1 ? "p1" : pos === 2 ? "p2" : pos === 3 ? "p3" : pos <= 5 ? "top5" : entry.pts > 0 ? "pts" : "nopts";
  const text = mode === "pos" ? String(pos) : fmt(entry.pts);
  return { text, cls, title: `P${pos} · ${fmt(entry.pts)} p` };
}

/** Segmenterad knappgrupp. Klick skickar data-action="set" med nyckel/värde. */
export function segmented(key, options, value, label = "") {
  return `<div class="seg" role="group" ${label ? `aria-label="${esc(label)}"` : ""}>${options
    .map(
      ([val, text]) =>
        `<button type="button" data-action="set" data-key="${esc(key)}" data-value="${esc(val)}" aria-pressed="${
          String(val) === String(value)
        }">${esc(text)}</button>`
    )
    .join("")}</div>`;
}

export const classTabs = (classes, value) => segmented("cls", classes.map((c) => [c, c]), value, "Klass");

// Förarnas nationalitet (sätts av app.js när resultaten laddats).
let riderInfo = {};
export function setRiderInfo(riders) {
  riderInfo = riders ?? {};
}

/** Flagga utifrån landskod (ISO 3166-1 alpha-2), via flag-icons. */
export function flag(iso) {
  const code = String(iso ?? "").toLowerCase();
  if (!/^[a-z]{2}$/.test(code)) return "";
  return `<span class="fi fi-${code} flag" title="${esc(iso)}" aria-hidden="true"></span>`;
}

/**
 * Startnummer: förarens egen nummergrafik (från motogp.com) om den finns,
 * annars numret på en platta i teamets färger.
 */
export function numberBadge(r, size = "") {
  if (!r || (r.number == null && !r.numberArt)) return "";
  const num = esc(r.number ?? "");
  if (r.numberArt)
    return `<span class="num-plate art ${size}" title="#${num} · ${esc(r.team)}"><img src="${esc(r.numberArt)}" alt="${num}" loading="lazy" data-fallback="${num}"></span>`;
  const style = r.teamColor ? ` style="--team:${esc(r.teamColor)};--team-text:${esc(r.teamTextColor || "#fff")}"` : "";
  return `<span class="num-plate ${size}"${style} title="#${num} · ${esc(r.team)}">${num}</span>`;
}

/** "Marc Marquez" → "M Mar", "Fabio Di Giannantonio" → "F DiG" (som tv-grafiken). */
export function shortRiderName(name) {
  const words = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return [...(words[0] ?? "")].slice(0, 3).join("");
  return [...words[0]][0] + " " + [...words.slice(1).join("")].slice(0, 3).join("");
}

/** Namn i två former: hela på stor skärm, kort ("M Mar") på mobil. */
function nameForms(name) {
  return `<span class="rn-full">${esc(name)}</span><span class="rn-short" aria-hidden="true">${esc(shortRiderName(name))}</span>`;
}

/** Förarnamn med flagga; klick öppnar förardialogen. */
export function riderLink(cls, key, name) {
  if (!key) return `<span class="unknown" title="${esc(name)}">${nameForms(name)}</span>`;
  const iso = riderInfo[cls]?.[key]?.country;
  return `<span class="rider">${flag(iso)}<button type="button" class="link" data-action="rider" data-cls="${esc(cls)}" data-key="${esc(
    key
  )}" aria-label="${esc(name)}">${nameForms(name)}</button></span>`;
}

/** "GRAND PRIX OF THE UNITED STATES" → "United States" */
export function roundTitle(r) {
  const short = String(r?.name ?? "")
    .replace(/^GRAND PRIX (OF (THE )?|DE (LA )?|DU )?/i, "")
    .toLowerCase()
    .replace(/(^|[\s-])\p{L}/gu, (m) => m.toUpperCase());
  return short || r?.country || r?.code || "";
}

export function empty(text) {
  return `<div class="empty">${esc(text)}</div>`;
}
