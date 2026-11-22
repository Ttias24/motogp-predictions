// Adminsidan (#/admin): inloggning, tipsperiod, inbjudningar och redigering av tips.
// Allt skydd sitter i databasen – sidan i sig är inte hemlig.
import { t, fmtDate } from "../i18n.js";
import { CLASSES } from "../scoring.js";
import { esc, empty } from "../ui.js";
import { isConfigured } from "../remote.js";
import { classForm, riderDatalists, roundOptionsFor } from "./edit.js";
import { errorText } from "./predict.js";

const pad = (n) => String(n).padStart(2, "0");
/** ISO-tid → värde för <input type="datetime-local"> (lokal tid). */
export function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null);

/** Förslag: tipsen öppnar 1 januari och stänger 23:59 dagen före första tävlingshelgen. */
export function suggestWindow(year, yearResults) {
  const first = yearResults?.rounds?.[0];
  let closes = "";
  if (first?.dateStart) {
    const d = new Date(String(first.dateStart).slice(0, 10) + "T00:00:00");
    d.setDate(d.getDate() - 1);
    closes = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T23:59`;
  }
  return { opens: `${year}-01-01T00:00`, closes, firstRound: first };
}

export const inviteUrl = (token) => `${location.origin}${location.pathname}#/tippa/${token}`;
export const joinUrl = (code) => `${location.origin}${location.pathname}#/join/${code}`;

/** Delad inbjudningslänk + inställning för godkännande. */
function joinSection(st) {
  const has = Boolean(st.season.join_code_hash);
  const link = st.joinCode
    ? `<input type="text" readonly class="inline-input link-out wide" value="${esc(joinUrl(st.joinCode))}">
       <button type="button" class="btn ghost" data-action="copy-text" data-text="${esc(joinUrl(st.joinCode))}">${t("copy")}</button>`
    : `<span class="muted">${has ? t("adminJoinActive") : t("adminJoinNone")}</span>`;
  return `<h3 class="sub">${t("adminJoinLink")}</h3>
    <p class="muted small">${t("adminJoinHelp")}</p>
    <div class="edit-actions">
      ${link}
      <button type="button" class="btn ghost" data-action="admin-new-join" ${st.busy ? "disabled" : ""}>${t(has ? "adminJoinReplace" : "adminJoinCreate")}</button>
    </div>
    <label class="edit-check" style="margin-top:8px">
      <input type="checkbox" data-action="admin-join-approval" ${st.season.join_approval ? "checked" : ""}> ${t("adminJoinApproval")}
    </label>`;
}

function msg(st) {
  if (!st.msg) return "";
  return `<p class="${st.msgType === "error" ? "warn" : "ok"}" role="status">${esc(st.msg)}</p>`;
}

export function renderAdmin(ctx) {
  const st = ctx.state.admin;
  if (!isConfigured())
    return `<section class="card"><h2>Admin</h2><p>${t("dbNotConfigured")}</p><p><a href="#/edit">${t("adminFileEditor")}</a></p></section>`;
  if (!st || st.loading) return empty("…");

  if (!st.session) {
    return `<section class="card admin-login">
      <h2>${t("adminLoginTitle")}</h2>
      <p class="muted">${t("adminLoginHelp")}</p>
      <div class="edit-actions">
        <input type="email" id="admin-email" placeholder="${esc(t("email"))}" autocomplete="email" aria-label="${esc(t("email"))}">
        <button type="button" class="btn primary" data-action="admin-login" ${st.busy ? "disabled" : ""}>${t("adminSendLink")}</button>
      </div>
      ${msg(st)}
    </section>`;
  }

  if (!st.isAdmin) {
    return `<section class="card"><h2>Admin</h2><p class="warn">${t("adminNotAdmin")}</p>
      <button type="button" class="btn ghost" data-action="admin-logout">${t("logout")}</button></section>`;
  }

  const year = st.year;
  const sug = suggestWindow(year, st.yearResults);
  const sd = st.seasonDraft;
  const players = st.players ?? [];
  const submitted = players.filter((p) => p.picks).length;

  const seasonCard = `<section class="card">
    <div class="card-head">
      <h2>${t("adminSeason")} ${year}</h2>
      <div class="controls">
        <label class="round-pick">${t("season")}
          <select data-action="admin-year">${st.years.map((y) => `<option ${y === year ? "selected" : ""}>${y}</option>`).join("")}</select>
        </label>
        <button type="button" class="btn ghost" data-action="admin-logout">${t("logout")}</button>
      </div>
    </div>
    ${st.season ? "" : `<p class="warn">${t("adminSeasonMissing")}</p>`}
    <div class="edit-scoring">
      <label>${t("adminOpens")} <input type="datetime-local" data-root="admin" data-path="seasonDraft.opens" value="${esc(sd.opens)}"></label>
      <label>${t("adminCloses")} <input type="datetime-local" data-root="admin" data-path="seasonDraft.closes" value="${esc(sd.closes)}"></label>
      <button type="button" class="btn primary" data-action="admin-save-season" ${st.busy ? "disabled" : ""}>${t(st.season ? "save" : "adminCreateSeason")}</button>
    </div>
    <p class="muted small">${
      sug.firstRound
        ? t("adminSuggest", { round: esc(sug.firstRound.name ?? sug.firstRound.code), date: fmtDate(sug.firstRound.dateStart, { day: "numeric", month: "long" }) })
        : t("adminNoCalendar")
    }${sug.closes && sug.closes !== sd.closes ? ` <button type="button" class="link" data-action="admin-use-suggestion">${t("adminUseSuggestion")}</button>` : ""}</p>
    ${st.season ? joinSection(st) : ""}
  </section>`;

  const rows = players
    .map((p) => {
      const link = st.links[p.id];
      return `<tr>
        <td>
          <input type="text" class="inline-input" value="${esc(p.name ?? "")}" placeholder="${esc(t("adminNoNameYet"))}" data-action="admin-rename" data-id="${esc(p.id)}" aria-label="${esc(t("name"))}">
          ${p.label ? `<div class="muted small">${esc(p.label)}</div>` : ""}
        </td>
        <td>${p.picks ? `✓ <span class="muted small">${fmtDate(p.picks.updated_at, { day: "numeric", month: "short" })}</span>` : `<span class="muted">–</span>`}</td>
        <td class="actions">
          ${p.approved === false ? `<button type="button" class="btn primary" data-action="admin-approve" data-id="${esc(p.id)}">${t("adminApprove")}</button>` : ""}
          ${
            link
              ? `<input type="text" readonly class="inline-input link-out" value="${esc(inviteUrl(link))}"><button type="button" class="btn ghost" data-action="admin-copy" data-id="${esc(p.id)}">${t("copy")}</button>`
              : `<button type="button" class="btn ghost" data-action="admin-new-link" data-id="${esc(p.id)}">${t("adminNewLink")}</button>`
          }
          <button type="button" class="btn ghost" data-action="admin-edit" data-id="${esc(p.id)}">${t("adminEditPicks")}</button>
          <button type="button" class="btn ghost" data-action="admin-delete" data-id="${esc(p.id)}">${t("delete")}</button>
        </td>
      </tr>`;
    })
    .join("");

  const playersCard = `<section class="card">
    <div class="card-head"><h2>${t("adminPlayers")}</h2><span class="muted">${t("adminSubmitted", { n: submitted, m: players.length })}</span></div>
    ${st.season ? "" : `<p class="muted">${t("adminCreateSeasonFirst")}</p>`}
    <div class="table-wrap"><table class="board admin-players">
      <thead><tr><th>${t("name")}</th><th>${t("adminStatus")}</th><th></th></tr></thead>
      <tbody>${rows || `<tr><td colspan="3" class="muted">–</td></tr>`}</tbody>
    </table></div>
    <div class="edit-actions" style="margin-top:12px">
      <input type="text" id="admin-new-name" maxlength="60" placeholder="${esc(t("adminInviteNote"))}" aria-label="${esc(t("adminInviteNote"))}" ${st.season ? "" : "disabled"}>
      <button type="button" class="btn primary" data-action="admin-add-player" ${st.season && !st.busy ? "" : "disabled"}>+ ${t("adminInvite")}</button>
    </div>
    <p class="muted small">${t("adminLinkHelp")}</p>
    ${msg(st)}
  </section>`;

  let editCard = "";
  const editing = players.find((p) => p.id === st.editing);
  if (editing && st.draft) {
    const roundOptions = roundOptionsFor(st.yearResults ?? { rounds: [] });
    editCard = `<section class="card">
      <div class="card-head"><h2>${t("adminEditPicksFor", { name: esc(editing.name ?? editing.label ?? "?") })}</h2>
        <button type="button" class="btn ghost" data-action="admin-edit" data-id="">${t("close")}</button></div>
      <div class="edit-classes">${CLASSES.map((cls) => classForm({ cls, c: st.draft[cls], base: `draft.${cls}`, root: "admin", roundOptions })).join("")}</div>
      <div class="edit-actions" style="margin-top:14px"><span class="spacer"></span>
        <button type="button" class="btn primary" data-action="admin-save-picks" ${st.busy ? "disabled" : ""}>${t("save")}</button></div>
    </section>`;
  }

  return `${seasonCard}${playersCard}${editCard}
    <p class="muted small"><a href="#/edit">${t("adminFileEditor")}</a></p>
    ${riderDatalists(ctx)}`;
}
