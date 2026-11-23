import { t, fmt } from "../i18n.js";
import { SESSION_TYPES, normalizeName, riderStats } from "../scoring.js";
import { esc, classTabs, segmented, resultCell, playerName, roundTitle, riderLink, flag, numberBadge } from "../ui.js";


/** Vilka spelare som valt en förare, och i vilken roll (plats 1–5, BU, DNF, ersatt). */
export function rolesFor(ctx, cls, riderName) {
  const n = normalizeName(riderName);
  const roles = [];
  for (const p of ctx.score.players) {
    const c = p.byClass[cls];
    const m = ctx.meta.get(p.id);
    const slot = c.lineupNow.findIndex((x) => normalizeName(x) === n);
    const tags = [];
    if (slot >= 0) tags.push(String(slot + 1));
    else if (c.original.some((x) => normalizeName(x) === n)) tags.push("×");
    else if (c.backup && normalizeName(c.backup) === n) tags.push("BU");
    if (c.bowling && normalizeName(c.bowling) === n) tags.push("DNF");
    if (tags.length) roles.push({ p, m, tags, inLineup: slot >= 0, replaced: tags[0] === "×" });
  }
  return roles;
}

/** Rubriker R1…R22 för resultatrutnätet (delas av Förare och VM-tabell). */
export function roundHeads(ctx) {
  return ctx.results.rounds
    .map(
      (r) =>
        `<th class="rd ${r.round > ctx.upto ? "future" : ""}" title="${esc(roundTitle(r))} · ${esc(r.circuit)}">R${r.round}<small>${esc(
          r.code
        )}</small></th>`
    )
    .join("");
}

/** En förares resultatceller per runda (race, och sprint under i MotoGP). */
export function roundCells(ctx, cls, stats, mode) {
  const types = SESSION_TYPES[cls];
  return ctx.results.rounds
    .map((r) => {
      if (r.round > ctx.upto || !stats) return `<td class="rd future"></td>`;
      const pr = stats.perRound[r.round];
      const half = (r.halfPoints ?? []).some((h) => h.startsWith(cls + "/"));
      const parts = types.map((type) => {
        const cell = resultCell(pr ? pr[type] : undefined, mode);
        return `<span class="res ${cell.cls}" title="${esc((type === "SPR" ? t("sprint") : t("race")) + ": " + cell.title)}">${esc(cell.text)}</span>`;
      });
      return `<td class="rd ${types.length > 1 ? "two" : ""}${half ? " half" : ""}">${parts.join("")}</td>`;
    })
    .join("");
}

/** Roller i visningsordning: platserna, sedan backup, DNF och ersatt. */
const ROLE_ORDER = ["1", "2", "3", "4", "5", "BU", "DNF", "×"];
const ROLE_CLASS = { "1": "r1", "2": "r2", "3": "r3", "4": "r4", "5": "r5", BU: "rbu", DNF: "rdnf", "×": "rx" };

/**
 * En bricka per roll som föraren tippats i (t.ex. "1" och "DNF"), färgad efter rollen.
 * Klick visar vilka spelare som valt honom och var.
 */
export function roleChips(roles, cls, name) {
  if (!roles.length) return "";
  const who = new Map();
  for (const ro of roles) for (const tag of ro.tags) who.set(tag, [...(who.get(tag) ?? []), ro.p.name]);
  const chips = ROLE_ORDER.filter((tag) => who.has(tag))
    .map((tag) => `<span class="chip ${ROLE_CLASS[tag]}" title="${esc(who.get(tag).join(", "))}">${esc(tag)}</span>`)
    .join("");
  return `<button type="button" class="who" data-action="who" data-cls="${esc(cls)}" data-name="${esc(name)}" aria-label="${esc(
    t("pickedBy") + ": " + roles.map((r) => r.p.name).join(", ")
  )}">${chips}</button>`;
}

/** Lista "Spelare – Plats 1, DNF" (förardialogen och tippad-av-rutan). */
export function rolesList(roles) {
  return `<ul class="roles">${roles
    .map((ro) => `<li>${playerName(ro.m, ro.p.name)} <span class="muted">${ro.tags.map((x) => (x === "×" ? t("replaced") : /^\d$/.test(x) ? `${t("slot")} ${x}` : x)).join(", ")}</span></li>`)
    .join("")}</ul>`;
}

export function renderRiders(ctx) {
  const { state, results, score } = ctx;
  const cls = state.cls;
  const mode = state.display;

  // Alla förare som någon spelare valt i klassen.
  const names = new Map();
  for (const p of score.players) {
    const c = p.byClass[cls];
    for (const n of [...c.original, c.backup, c.bowling]) {
      if (!n) continue;
      const key = ctx.riderKey(cls, n);
      const id = key ?? "name:" + normalizeName(n);
      if (!names.has(id)) names.set(id, { key, name: key ? results.riders[cls][key].name : n });
    }
  }
  const pts = ctx.standingsPts[cls];
  const list = [...names.values()].sort((a, b) => (pts.get(b.key) ?? -1) - (pts.get(a.key) ?? -1));
  const types = SESSION_TYPES[cls];

  const body = list
    .map(({ key, name }) => {
      const stats = key ? riderStats(results, cls, key, { uptoRound: ctx.upto }) : null;
      const roles = rolesFor(ctx, cls, name);
      return `<tr>
        <td class="sticky c1">${roleChips(roles, cls, name)}</td>
        <td class="sticky c2">${riderLink(cls, key, name)}</td>
        <td class="sticky c3 num big">${stats ? fmt(stats.points) : "–"}</td>
        ${roundCells(ctx, cls, stats, mode)}
      </tr>`;
    })
    .join("");
  const head = roundHeads(ctx);

  return `<section class="card">
    <div class="card-head">
      <h2>${t("ridersTitle")}</h2>
      <div class="controls">
        ${classTabs(ctx.classes, cls)}
        <div class="hide-sm">${segmented("display", [["points", t("showPoints")], ["pos", t("showPos")]], mode, t("show"))}</div>
      </div>
    </div>
    ${types.length > 1 ? `<p class="muted small hide-sm">${t("race")} / ${t("sprint")}</p>` : ""}
    <div class="table-wrap grid-wrap">
      <table class="grid">
        <thead><tr>
          <th class="sticky c1">${t("picksCol")}</th>
          <th class="sticky c2">${t("rider")}</th>
          <th class="sticky c3 num">${t("points")}</th>
          ${head}
        </tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  </section>`;
}

/** Ålder i dag utifrån födelsedatum ("YYYY-MM-DD"). */
function age(birthDate) {
  const m = String(birthDate ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const now = new Date();
  let a = now.getFullYear() - Number(m[1]);
  if (now.getMonth() + 1 < Number(m[2]) || (now.getMonth() + 1 === Number(m[2]) && now.getDate() < Number(m[3]))) a--;
  return a;
}

/** Karriärstatistik (alla klasser, från motogp.com) överst i förardialogen. */
function careerSection(c) {
  if (!c) return "";
  const split = (o) =>
    Object.entries(o ?? {})
      .map(([k, v]) => `${v} ${esc(k)}`)
      .join(" · ");
  const box = (value, label, title = "") =>
    `<div class="stat"${title ? ` title="${esc(title)}"` : ""}><b>${fmt(value ?? 0)}</b><span>${label}</span></div>`;
  return `<h3 class="career-head">${t("career")}${c.debut ? ` <span class="muted small">· ${t("careerDebut", { year: c.debut })}</span>` : ""}</h3>
    <div class="stat-row six">
      ${box(c.titles, t("careerTitles"), split(c.titlesByClass))}
      ${box(c.starts, t("careerStarts"), split(c.startsByClass))}
      ${box(c.wins, t("careerWins"), split(c.winsByClass))}
      ${box(c.podiums, t("careerPodiums"), split(c.podiumsByClass))}
      ${box(c.poles, t("careerPoles"), split(c.polesByClass))}
      ${box(c.fastestLaps, t("careerFastest"), split(c.fastestLapsByClass))}
    </div>
    ${
      c.titles || c.sprintWins
        ? `<p class="muted small career-note">${[
            c.titles ? `${t("careerTitles")}: ${split(c.titlesByClass)}` : "",
            c.sprintWins ? `${t("careerSprintWins")}: ${c.sprintWins}` : "",
          ]
            .filter(Boolean)
            .join(" · ")}</p>`
        : ""
    }
    <hr class="divider">`;
}

/** Innehåll i förardialogen. */
export function renderRiderDialog(ctx, cls, key) {
  const r = ctx.results.riders[cls]?.[key];
  if (!r) return "";
  const stats = riderStats(ctx.results, cls, key, { uptoRound: ctx.upto });
  const pos = ctx.standingsPos[cls].get(key);
  const types = SESSION_TYPES[cls];
  const roles = rolesFor(ctx, cls, r.name);
  const wins = types.reduce((a, ty) => a + stats.counts[ty][0], 0);
  const podiums = types.reduce((a, ty) => a + stats.counts[ty].slice(0, 3).reduce((x, y) => x + y, 0), 0);

  return `<div class="dlg-head">
      <div>
        <h2>${numberBadge(r, "lg")}${flag(r.country)}${esc(r.name)}${age(r.birthDate) != null ? ` <span class="age">- ${age(r.birthDate)}</span>` : ""}</h2>
        <div class="muted">${esc(r.team)} · ${esc(r.country)} · ${cls}</div>
      </div>
      <button type="button" class="icon-btn" data-action="close-dialog" aria-label="${esc(t("close"))}">✕</button>
    </div>
    ${careerSection(r.career)}
    <h3 class="season-head">${t("thisSeason", { year: ctx.year })}</h3>
    <div class="stat-row">
      <div class="stat"><b>${pos ?? "–"}</b><span>${t("seasonPosition")}</span></div>
      <div class="stat"><b>${fmt(stats.points)}</b><span>${t("points")}</span></div>
      <div class="stat"><b>${wins}</b><span>${t("wins")}</span></div>
      <div class="stat"><b>${podiums}</b><span>${t("podiums")}</span></div>
      <div class="stat"><b>${stats.dnf}</b><span>${t("dnfs")}</span></div>
    </div>
    <h3>${t("placesTitle")}</h3>
    <table class="board compact">
      <thead><tr><th></th>${[1, 2, 3, 4, 5].map((n) => `<th class="num">${n}</th>`).join("")}</tr></thead>
      <tbody>${types
        .map(
          (ty) =>
            `<tr><td>${ty === "SPR" ? t("sprint") : t("race")}</td>${stats.counts[ty].map((v) => `<td class="num">${v}</td>`).join("")}</tr>`
        )
        .join("")}</tbody>
    </table>
    ${
      roles.length
        ? `<h3>${t("pickedBy")}</h3>${rolesList(roles)}`
        : ""
    }`;
}
