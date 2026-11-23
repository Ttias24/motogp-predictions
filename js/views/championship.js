import { t, fmt } from "../i18n.js";
import { SESSION_TYPES, riderStats } from "../scoring.js";
import { esc, classTabs, segmented, empty, riderLink, numberBadge } from "../ui.js";
import { rolesFor, roundHeads, roundCells } from "./riders.js";

export function renderChampionship(ctx) {
  const { state, results } = ctx;
  const cls = state.cls;
  const mode = state.display;
  const list = ctx.standings[cls];
  if (!list.length) return empty(t("noResults"));
  const types = SESSION_TYPES[cls];

  const rows = list
    .map((s) => {
      const r = results.riders[cls][s.rider];
      const roles = rolesFor(ctx, cls, r.name);
      const stats = riderStats(results, cls, s.rider, { uptoRound: ctx.upto });
      return `<tr class="${roles.some((x) => x.inLineup) ? "picked" : ""}">
        <td class="sticky s-rank rank">${s.pos}</td>
        <td class="sticky s-rider"><span class="rider-cell">${numberBadge(r, "sm")}${riderLink(cls, s.rider, r.name)}</span></td>
        <td class="team" title="${esc(r.team)}">${esc(r.team)}</td>
        ${roundCells(ctx, cls, stats, mode)}
        <td class="sticky s-pts num big">${fmt(s.pts)}</td>
      </tr>`;
    })
    .join("");

  return `<section class="card">
    <div class="card-head">
      <h2>${t("nav.championship")}</h2>
      <div class="controls">
        ${classTabs(ctx.classes, cls)}
        ${segmented("display", [["points", t("showPoints")], ["pos", t("showPos")]], mode, t("show"))}
      </div>
    </div>
    ${types.length > 1 ? `<p class="muted small">${t("race")} / ${t("sprint")}</p>` : ""}
    <div class="table-wrap grid-wrap">
      <table class="grid vm-grid">
        <thead><tr>
          <th class="sticky s-rank">#</th>
          <th class="sticky s-rider">${t("rider")}</th>
          <th class="team">${t("team")}</th>
          ${roundHeads(ctx)}
          <th class="sticky s-pts num">${t("points")}</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </section>`;
}
