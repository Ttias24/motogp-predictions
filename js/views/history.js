import { t, fmt, fmtDate } from "../i18n.js";
import { rankPlayers } from "../scoring.js";
import { esc, playerMeta, playerName, empty } from "../ui.js";

/** Lista över avslutade säsonger med slutställning. Data laddas av app.js (state.history). */
export function renderHistory(ctx) {
  const { state } = ctx;
  if (!state.history) return empty("…");
  const past = state.history.filter((h) => h.year !== state.currentSeason);
  if (!past.length) return `<section class="card"><h2>${t("historyTitle")}</h2><p class="muted">${t("historyEmpty")}</p></section>`;

  return past
    .map((h) => {
      const meta = playerMeta(h.picks.players ?? []);
      const ranked = rankPlayers(h.score.players, "placement");
      const rows = ranked
        .map(
          ({ player: p, rank }) => `<tr class="${rank === 1 ? "leader" : ""}">
            <td class="rank">${rank}</td>
            <td>${playerName(meta.get(p.id), p.name)}</td>
            <td class="num big">${fmt(p.totals.placement)}</td>
            <td class="num">${fmt(p.totals.series)}</td>
          </tr>`
        )
        .join("");
      return `<section class="card">
        <div class="card-head">
          <h2>${t("season")} ${h.year}</h2>
          <a class="btn ghost" href="?season=${h.year}#/">${t("openSeason")} →</a>
        </div>
        <p class="muted small">${t("roundsDone", { n: h.score.rounds.length })}</p>
        <div class="table-wrap">
          <table class="board">
            <thead><tr><th class="rank">#</th><th>${t("player")}</th><th class="num">${t("placement")}</th><th class="num">${t("series")}</th></tr></thead>
            <tbody>${rows || `<tr><td colspan="4" class="muted">–</td></tr>`}</tbody>
          </table>
        </div>
      </section>`;
    })
    .join("");
}

/** Kort som visas när säsongen inte har börjat (inga resultat ännu). */
export function seasonNotStarted(ctx) {
  const hasPicks = (ctx.state.picks.players ?? []).some((p) => Object.values(p.picks ?? {}).some((c) => (c.top5 ?? []).some(Boolean)));
  const w = ctx.state.window;
  // Databassäsong: visa tipsperioden och vilka som har lämnat tips.
  if (ctx.state.dbSeason && w) {
    const open = Date.parse(w.now) < Date.parse(w.closesAt);
    const players = w.players ?? [];
    const done = players.filter((p) => p.submitted).length;
    return `<section class="card">
      <h2>${t("seasonNotStarted", { year: ctx.year })}</h2>
      ${open ? `<p>${t("windowOpen", { year: ctx.year, date: fmtDate(w.closesAt, { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) })}</p>` : `<p>${t("waitingForRace")}</p>`}
      ${
        players.length
          ? `<p class="muted">${t("windowCount", { n: done, m: players.length })}</p>
             <ul class="submitted">${players.map((p) => `<li>${p.submitted ? "✓" : "–"} ${esc(p.name)}</li>`).join("")}</ul>`
          : ""
      }
      ${ctx.state.seasonList.length > 1 ? `<p><a href="#/history">${esc(t("seeHistory"))} →</a></p>` : ""}
    </section>`;
  }
  return `<section class="card">
    <h2>${t("seasonNotStarted", { year: ctx.year })}</h2>
    <p>${hasPicks ? t("waitingForRace") : t("fillPicks")}</p>
    ${ctx.state.seasonList.length > 1 ? `<p><a href="#/history">${esc(t("seeHistory"))} →</a></p>` : ""}
  </section>`;
}
