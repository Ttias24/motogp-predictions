import { t, fmt } from "../i18n.js";
import { esc, chip, classTabs, empty, riderLink } from "../ui.js";

import { rolesFor } from "./riders.js";

export function renderChampionship(ctx) {
  const { state, results } = ctx;
  const cls = state.cls;
  const list = ctx.standings[cls];
  if (!list.length) return empty(t("noResults"));

  const rows = list
    .map((s) => {
      const r = results.riders[cls][s.rider];
      const roles = rolesFor(ctx, cls, r.name);
      const chips = roles
        .map((ro) => chip(ro.m, { tag: ro.tags.join("·"), variant: ro.inLineup ? "" : ro.replaced ? "struck" : "outline", title: `${ro.p.name}: ${ro.tags.join(", ")}` }))
        .join("");
      return `<tr class="${roles.some((x) => x.inLineup) ? "picked" : ""} ${s.pos <= 5 ? "top5row" : ""}">
        <td class="rank">${s.pos}</td>
        <td><span class="num-badge small">${esc(r.number ?? "")}</span>${riderLink(cls, s.rider, r.name)}</td>
        <td class="dim hide-sm">${esc(r.team)}</td>
        <td class="num big">${fmt(s.pts)}</td>
        <td>${chips}</td>
      </tr>`;
    })
    .join("");

  return `<section class="card">
    <div class="card-head">
      <h2>${t("nav.championship")}</h2>
      ${classTabs(ctx.classes, cls)}
    </div>
    <div class="table-wrap">
      <table class="board">
        <thead><tr>
          <th class="rank">#</th><th>${t("rider")}</th><th class="hide-sm">${t("team")}</th>
          <th class="num">${t("points")}</th><th>${t("pickedBy")}</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </section>`;
}
