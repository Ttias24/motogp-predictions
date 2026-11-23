import { t, fmt } from "../i18n.js";
import { CLASSES, normalizeName, rankPlayers } from "../scoring.js";
import { esc, playerName, riderLink } from "../ui.js";

export function renderPicks(ctx) {
  const { score, meta, state } = ctx;
  const ranked = rankPlayers(score.players, state.metric);
  if (!ranked.length) return `<div class="empty">–</div>`;
  const selected = ranked.find((r) => r.player.id === state.player)?.player ?? ranked[0].player;

  const list = ranked
    .map(({ player: p, rank }) => {
      const m = meta.get(p.id);
      const on = p.id === selected.id;
      return `<li><button type="button" class="player-row" data-action="select-player" data-id="${esc(p.id)}" aria-pressed="${on}">
        <span class="pr-rank">${rank}</span>
        <span class="pr-swatch" style="--c:${m?.color ?? "#888"}"></span>
        <span class="pr-name">${esc(p.name)}</span>
        <small class="pr-lbl" title="${esc(t("placement"))}">${t("placementShort")}</small>
        <span class="pr-val num" title="${esc(t("placement"))}">${fmt(p.totals.placement)}</span>
        <small class="pr-lbl" title="${esc(t("series"))}">${t("seriesShort")}</small>
        <span class="pr-val num" title="${esc(t("series"))}">${fmt(p.totals.series)}</span>
      </button></li>`;
    })
    .join("");

  return `<div class="picks-layout">
    <div class="player-list-wrap">
      <aside class="card player-list">
        <h2>${t("player")}</h2>
        <ol>${list}</ol>
      </aside>
    </div>
    ${playerCard(ctx, selected, meta.get(selected.id))}
  </div>`;
}

function playerCard(ctx, p, m) {
  return `<section class="card player-card">
    <div class="card-head">
      <h2>${playerName(m, p.name)}</h2>
      <div class="totals">
        <span title="${esc(t("placement"))}"><small>${t("placementShort")}</small> ${fmt(p.totals.placement)}</span>
        <span title="${esc(t("series"))}"><small>${t("seriesShort")}</small> ${fmt(p.totals.series)}</span>
      </div>
    </div>
    <div class="class-columns">${CLASSES.map((cls) => classBlock(ctx, p, cls)).join("")}</div>
  </section>`;
}

function classBlock(ctx, p, cls) {
  const c = p.byClass[cls];
  const standing = ctx.standingsPos[cls];
  const act = c.backupActivated;
  const active = act && c.backup && act.round <= ctx.upto + 1;

  const rows = c.lineupNow
    .map((name, i) => {
      const r = c.riders[name] ?? { placement: 0, series: 0 };
      const key = ctx.riderKey(cls, name);
      const pos = key ? standing.get(key) : null;
      const hit = pos === i + 1 ? "exact" : pos && pos <= 5 ? "top5" : "";
      const isBackup = active && normalizeName(name) === normalizeName(c.backup);
      return `<tr>
        <td class="slot">${i + 1}</td>
        <td>${riderLink(cls, key, name)}${isBackup ? ` <span class="tag bu">BU</span>` : ""}</td>
        <td class="num"><span class="vm ${hit}" title="${esc(hit === "exact" ? t("exactHit") : hit ? t("top5Hit") : t("champPosTitle"))}">${pos ?? "–"}</span></td>
        <td class="num">${fmt(r.placement)}</td>
        <td class="num">${fmt(r.series)}</td>
      </tr>`;
    })
    .join("");

  // Backup och DNF som egna rader i samma tabell, så flaggor och namn står i linje med topp 5.
  const special = (tag, cls2, link, note) =>
    `<tr><td class="slot"><span class="tag ${cls2}">${tag}</span></td><td colspan="4">${link} <span class="muted note">${note}</span></td></tr>`;
  const specials = [];
  if (c.backup) {
    const link = riderLink(cls, ctx.riderKey(cls, c.backup), c.backup);
    if (active) {
      const old = c.riders[act.replaces] ?? Object.values(c.riders).find((x) => normalizeName(x.name) === normalizeName(act.replaces));
      specials.push(
        special(
          "BU",
          "bu",
          link,
          `${esc(t("buActive", { r: act.round, name: "" }))} <s>${esc(act.replaces)}</s>${old ? ` (${t("pShort")} ${fmt(old.placement)} · ${t("sShort")} ${fmt(old.series)})` : ""}`
        )
      );
    } else specials.push(special("BU", "bu", link, `– ${t("buInactive")}`));
  }
  if (c.bowling) specials.push(special("DNF", "bk", riderLink(cls, c.bowlingKey, c.bowling), `– ${t("dnfCount", { n: c.bowlingDnf })}`));

  return `<div class="class-block">
    <div class="class-head"><h3>${cls}</h3><span class="muted">${t("pShort")} ${fmt(c.placement)} · ${t("sShort")} ${fmt(c.series)}</span></div>
    <table class="picks">
      <thead><tr>
        <th class="slot">${t("slot")}</th><th>${t("rider")}</th>
        <th class="num" title="${esc(t("champPosTitle"))}">${t("champPos")}</th>
        <th class="num" title="${esc(t("pTitle"))}">${t("pShort")}</th>
        <th class="num" title="${esc(t("sTitle"))}">${t("sShort")}</th>
      </tr></thead>
      <tbody>${rows}</tbody>
      ${specials.length ? `<tbody class="special">${specials.join("")}</tbody>` : ""}
    </table>
  </div>`;
}

