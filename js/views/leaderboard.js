import { t, fmt } from "../i18n.js";
import { CLASSES, rankPlayers } from "../scoring.js";
import { esc, playerName, segmented, empty, riderLink } from "../ui.js";

export function renderLeaderboard(ctx) {
  const { state, score, prev, meta } = ctx;
  if (!score.rounds.length) return empty(t("noResults"));
  const metric = state.metric;
  const ranked = rankPlayers(score.players, metric);
  const prevRank = new Map(prev ? rankPlayers(prev.players, metric).map((r) => [r.player.id, r.rank]) : []);
  const other = metric === "placement" ? "series" : "placement";

  const rows = ranked
    .map(({ player: p, rank, value }) => {
      const m = meta.get(p.id);
      const last = p.perRound.at(-1);
      const gained = last && last.round === ctx.upto ? last[metric] : 0;
      const pr = prevRank.get(p.id);
      const move = pr ? pr - rank : 0;
      const moveHtml = move > 0 ? `<span class="up">▲${move}</span>` : move < 0 ? `<span class="down">▼${-move}</span>` : "";
      return `<tr class="${rank === 1 ? "leader" : ""}">
        <td class="rank">${rank}${moveHtml}</td>
        <td>${playerName(m, p.name)}</td>
        <td class="num big">${fmt(value)}</td>
        ${CLASSES.map((c) => `<td class="num">${fmt(p.byClass[c][metric])}</td>`).join("")}
        <td class="num gain">${gained ? "+" + fmt(gained) : "–"}</td>
        <td class="num dim hide-sm">${fmt(p.totals[other])}</td>
      </tr>`;
    })
    .join("");

  const table = `
    <div class="table-wrap">
      <table class="board">
        <thead><tr>
          <th class="rank">${t("rank")}</th><th>${t("player")}</th>
          <th class="num">${t("total")}</th>
          ${CLASSES.map((c) => `<th class="num">${c}</th>`).join("")}
          <th class="num" title="${esc(t("lastRound"))}">${t("lastRound")}</th>
          <th class="num dim hide-sm">${metric === "placement" ? t("series") : t("placement")}</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  // Did Not Finish
  const bkRows = [...score.players]
    .map((p) => ({ p, total: CLASSES.reduce((a, c) => a + p.byClass[c].bowlingDnf, 0) }))
    .sort((a, b) => b.total - a.total)
    .map(
      ({ p, total }) => `<tr>
        <td>${playerName(meta.get(p.id), p.name)}</td>
        ${CLASSES.map((c) => {
          const b = p.byClass[c];
          return `<td><span class="bk-rider">${b.bowling ? riderLink(c, b.bowlingKey, b.bowling) : "–"}</span> <span class="num bk-count">${
            b.bowling ? b.bowlingDnf : ""
          }</span></td>`;
        }).join("")}
        <td class="num big">${total}</td>
      </tr>`
    )
    .join("");

  return `
    <section class="card">
      <div class="card-head">
        <h2>${t("nav.leaderboard")}</h2>
        ${segmented("metric", [["placement", t("placement")], ["series", t("series")]], metric)}
      </div>
      ${table}
      <details class="rules">
        <summary>${t("rulesTitle")}</summary>
        <ul>${t("rules").map((r) => `<li>${r}</li>`).join("")}</ul>
      </details>
    </section>

    <section class="card">
      <div class="card-head"><h2>${t("bowling")}</h2></div>
      <p class="muted">${t("bowlingDesc")}</p>
      <div class="table-wrap">
        <table class="board bk">
          <thead><tr><th>${t("player")}</th>${CLASSES.map((c) => `<th>${c}</th>`).join("")}<th class="num">${t("total")}</th></tr></thead>
          <tbody>${bkRows}</tbody>
        </table>
      </div>
    </section>`;
}
