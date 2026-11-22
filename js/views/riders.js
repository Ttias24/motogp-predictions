import { t, fmt } from "../i18n.js";
import { SESSION_TYPES, normalizeName, riderStats } from "../scoring.js";
import { esc, chip, classTabs, segmented, resultCell, playerName, roundTitle, riderLink, flag } from "../ui.js";


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

function roleChips(roles) {
  return roles
    .map((r) =>
      chip(r.m, {
        tag: r.tags.join("·"),
        variant: r.inLineup ? "" : r.replaced ? "struck" : "outline",
        title: `${r.p.name}: ${r.tags.join(", ")}`,
      })
    )
    .join("");
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
  const rounds = results.rounds;
  const types = SESSION_TYPES[cls];

  const head = rounds
    .map(
      (r) =>
        `<th class="rd ${r.round > ctx.upto ? "future" : ""}" title="${esc(roundTitle(r))} · ${esc(r.circuit)}">R${r.round}<small>${esc(
          r.code
        )}</small></th>`
    )
    .join("");

  const body = list
    .map(({ key, name }) => {
      const stats = key ? riderStats(results, cls, key, { uptoRound: ctx.upto }) : null;
      const roles = rolesFor(ctx, cls, name);
      const cells = rounds
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
      return `<tr>
        <td class="sticky c1">${roleChips(roles)}</td>
        <td class="sticky c2">${riderLink(cls, key, name)}</td>
        <td class="sticky c3 num big">${stats ? fmt(stats.points) : "–"}</td>
        ${cells}
      </tr>`;
    })
    .join("");

  return `<section class="card">
    <div class="card-head">
      <h2>${t("nav.riders")}</h2>
      <div class="controls">
        ${classTabs(ctx.classes, cls)}
        ${segmented("display", [["points", t("showPoints")], ["pos", t("showPos")]], mode, t("show"))}
      </div>
    </div>
    ${types.length > 1 ? `<p class="muted small">${t("race")} / ${t("sprint")}</p>` : ""}
    <div class="table-wrap grid-wrap">
      <table class="grid">
        <thead><tr>
          <th class="sticky c1">${t("pickedBy")}</th>
          <th class="sticky c2">${t("rider")}</th>
          <th class="sticky c3 num">${t("points")}</th>
          ${head}
        </tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  </section>`;
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
        <h2>${r.number ? `<span class="num-badge">${esc(r.number)}</span>` : ""}${flag(r.country)}${esc(r.name)}</h2>
        <div class="muted">${esc(r.team)} · ${esc(r.country)} · ${cls}</div>
      </div>
      <button type="button" class="icon-btn" data-action="close-dialog" aria-label="${esc(t("close"))}">✕</button>
    </div>
    <div class="stat-row">
      <div class="stat"><b>${pos ?? "–"}</b><span>${t("champPos")}</span></div>
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
        ? `<h3>${t("pickedBy")}</h3><ul class="roles">${roles
            .map((ro) => `<li>${playerName(ro.m, ro.p.name)} <span class="muted">${ro.tags.map((x) => (x === "×" ? t("replaced") : /^\d$/.test(x) ? `${t("slot")} ${x}` : x)).join(", ")}</span></li>`)
            .join("")}</ul>`
        : ""
    }`;
}
