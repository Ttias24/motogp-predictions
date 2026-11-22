// Små hjälpfunktioner för HTML-rendering.
import { t, fmt } from "./i18n.js";
import { DNF_STATUSES } from "./scoring.js";

export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// Spelarfärger – fungerar mot mörk bakgrund och skiljer sig tydligt åt.
export const PLAYER_COLORS = ["#4fc3f7", "#ffb74d", "#81c784", "#ce93d8", "#f48fb1", "#fff176", "#4db6ac", "#ff8a65", "#9fa8da", "#c5e1a5"];

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

/** Spelarbricka, t.ex. "C" med ett litet tillägg som "1" eller "DNF". */
export function chip(m, { tag = "", variant = "", title = "" } = {}) {
  if (!m) return "";
  return `<span class="chip ${variant}" style="--c:${m.color}" title="${esc(title || m.name)}">${esc(m.short)}${
    tag ? `<sub>${esc(tag)}</sub>` : ""
  }</span>`;
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

/** Förarnamn med flagga; klick öppnar förardialogen. */
export function riderLink(cls, key, name) {
  if (!key) return `<span class="unknown" title="?">${esc(name)}</span>`;
  const iso = riderInfo[cls]?.[key]?.country;
  return `<span class="rider">${flag(iso)}<button type="button" class="link" data-action="rider" data-cls="${esc(cls)}" data-key="${esc(
    key
  )}">${esc(name)}</button></span>`;
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
