import { t } from "../i18n.js";
import { CLASSES, normalizeName } from "../scoring.js";
import { esc, playerMeta, playerName } from "../ui.js";

export function emptyClassPick() {
  return { top5: ["", "", "", "", ""], backup: "", bowling: "", backupActivated: null };
}

/** Gör en redigerbar kopia där alla fält finns. */
export function normalizePicks(picks) {
  const p = structuredClone(picks);
  p.scoring ??= { exactPosition: 2, insideTop5: 1 };
  p.players ??= [];
  for (const pl of p.players) {
    pl.picks ??= {};
    for (const cls of CLASSES) {
      const c = (pl.picks[cls] ??= emptyClassPick());
      c.top5 = [...(c.top5 ?? []), "", "", "", "", ""].slice(0, 5);
      c.backup ??= "";
      c.bowling ??= "";
      c.backupActivated ??= null;
    }
  }
  return p;
}

/** Tar bort tomma värden innan filen sparas. */
export function cleanPicks(picks) {
  const p = structuredClone(picks);
  for (const pl of p.players) {
    pl.name = (pl.name || "").trim() || pl.id;
    for (const cls of CLASSES) {
      const c = pl.picks[cls];
      c.top5 = c.top5.map((n) => (n || "").trim());
      c.backup = (c.backup || "").trim() || null;
      c.bowling = (c.bowling || "").trim() || null;
      if (c.backupActivated && !c.backup) c.backupActivated = null;
    }
  }
  return p;
}

/**
 * Formulär för en klass: topp 5, backup och DNF-förare.
 * root anger vilket utkast fälten skriver till (edit | predict | admin), base sökvägen i det.
 * roundOptions = null döljer backup-aktiveringen (spelare aktiverar på annat sätt).
 */
export function classForm({ cls, c, base, root, roundOptions = null, disabled = false }) {
  const dupes = new Set();
  const seen = new Set();
  c.top5.forEach((n) => {
    const k = normalizeName(n);
    if (k && seen.has(k)) dupes.add(k);
    seen.add(k);
  });
  const buInTop5 = c.backup && seen.has(normalizeName(c.backup));
  const act = c.backupActivated;
  const dis = disabled ? " disabled" : "";
  const input = (path, value, label) =>
    `<input type="text" list="riders-${cls}" value="${esc(value ?? "")}" data-root="${root}" data-path="${base}.${path}" aria-label="${esc(label)}" autocomplete="off"${dis}>`;
  return `<div class="edit-class">
    <h4>${cls}</h4>
    <ol class="edit-top5">${c.top5.map((n, k) => `<li>${input(`top5.${k}`, n, `${cls} ${k + 1}`)}</li>`).join("")}</ol>
    ${dupes.size ? `<p class="warn">${t("duplicates")}</p>` : ""}
    <label class="edit-row"><span class="tag bu">BU</span>${input("backup", c.backup, `${cls} backup`)}</label>
    ${buInTop5 ? `<p class="warn">${t("backupInTop5")}</p>` : ""}
    <label class="edit-row"><span class="tag bk">DNF</span>${input("bowling", c.bowling, `${cls} DNF`)}</label>
    ${
      roundOptions
        ? `<label class="edit-check"><input type="checkbox" data-action="toggle-backup" data-root="${root}" data-base="${base}" ${act ? "checked" : ""} ${
            c.backup ? "" : "disabled"
          }> ${t("buActivatedLabel")}</label>
          ${
            act
              ? `<div class="edit-act">
                  <label>${t("fromRound")}
                    <select data-root="${root}" data-path="${base}.backupActivated.round" data-type="number">${roundOptions
                      .map(([v, l]) => `<option value="${v}" ${v === act.round ? "selected" : ""}>${esc(l)}</option>`)
                      .join("")}</select>
                  </label>
                  <label>${t("replaces")}
                    <select data-root="${root}" data-path="${base}.backupActivated.replaces">${c.top5
                      .filter(Boolean)
                      .map((n) => `<option ${normalizeName(n) === normalizeName(act.replaces) ? "selected" : ""}>${esc(n)}</option>`)
                      .join("")}</select>
                  </label>
                  <p class="muted small">${t("irreversible")}</p>
                </div>`
              : ""
          }`
        : ""
    }
  </div>`;
}

/** Förslagslistor med förarnamn (används av alla formulär). */
export function riderDatalists(ctx) {
  return CLASSES.map(
    (cls) =>
      `<datalist id="riders-${cls}">${[...new Set(Object.values(ctx.riderSuggestions?.[cls] ?? {}).map((r) => r.name))]
        .sort((a, b) => a.localeCompare(b))
        .map((n) => `<option value="${esc(n)}"></option>`)
        .join("")}</datalist>`
  ).join("");
}

export function roundOptionsFor(results) {
  return results.rounds.length
    ? results.rounds.map((r) => [r.round, `R${r.round} ${r.code}`])
    : Array.from({ length: 22 }, (_, i) => [i + 1, `R${i + 1}`]);
}

export function renderEdit(ctx) {
  const { state, results } = ctx;
  const draft = state.editDraft;
  const meta = playerMeta(draft.players);
  const roundOptions = roundOptionsFor(results);

  const players = draft.players
    .map((pl, i) => {
      const m = meta.get(pl.id);
      const classes = CLASSES.map((cls) =>
        classForm({ cls, c: pl.picks[cls], base: `players.${i}.picks.${cls}`, root: "edit", roundOptions })
      ).join("");

      return `<fieldset class="card edit-player" style="--c:${m.color}">
        <div class="card-head">
          <h2>${playerName(m, "")}<input type="text" class="name-input" value="${esc(pl.name)}" data-path="players.${i}.name" aria-label="${esc(t("name"))}" data-rerender="1"></h2>
          <button type="button" class="btn ghost" data-action="remove-player" data-index="${i}">${t("removePlayer")}</button>
        </div>
        <div class="edit-classes">${classes}</div>
      </fieldset>`;
    })
    .join("");

  const datalists = riderDatalists(ctx);

  return `<section class="card">
      <div class="card-head"><h2>${t("editTitle")}</h2></div>
      <p>${t("editIntro", { year: ctx.year })}</p>
      <div class="edit-scoring">
        <strong>${t("scoringTitle")}:</strong>
        <label>${t("exactPts")} <input type="number" step="0.5" min="0" value="${esc(draft.scoring.exactPosition)}" data-path="scoring.exactPosition" data-type="number"></label>
        <label>${t("top5Pts")} <input type="number" step="0.5" min="0" value="${esc(draft.scoring.insideTop5)}" data-path="scoring.insideTop5" data-type="number"></label>
      </div>
    </section>
    ${players}
    <div class="edit-actions">
      <button type="button" class="btn ghost" data-action="add-player">+ ${t("addPlayer")}</button>
      <span class="spacer"></span>
      <button type="button" class="btn ghost" data-action="reset-picks">${t("resetToFile")}</button>
      <button type="button" class="btn ghost" data-action="download-picks">⬇ ${t("download")}</button>
      <button type="button" class="btn primary" data-action="apply-picks">${t("apply")}</button>
    </div>
    <p class="muted small" id="edit-status" role="status"></p>
    ${datalists}`;
}
