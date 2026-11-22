// Adminsidan (#/admin): inloggning, tipsperiod, inbjudningar och redigering av tips.
// Allt skydd sitter i databasen – sidan i sig är inte hemlig.
import { t, fmtDate } from "../i18n.js";
import { CLASSES } from "../scoring.js";
import { esc, empty } from "../ui.js";
import { isConfigured } from "../remote.js";
import { classForm, riderDatalists, roundOptionsFor } from "./edit.js";
import { errorText } from "./predict.js";
import { autoWindow, isPublished, offList, entryRiderMap } from "../entrylist.js";

const pad = (n) => String(n).padStart(2, "0");
/** ISO-tid → värde för <input type="datetime-local"> (lokal tid). */
export function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null);

/** Automatiska datum (se js/entrylist.js) som värden för formuläret. */
export function suggestWindow(year, yearResults) {
  const a = autoWindow(yearResults);
  return { opens: toLocalInput(a.opens), closes: toLocalInput(a.closes), firstRound: a.firstRound, auto: a };
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
    ${entryStatus(year, st.yearResults)}
    <div class="window-grid">
      ${dateRow("opens", t("adminOpens"), sd, sug.auto.opens, t("adminOpensRule"), t("adminWaitList"))}
      ${dateRow("closes", t("adminCloses"), sd, sug.auto.closes, t("adminClosesRule"), t("adminWaitCalendar"))}
    </div>
    <div class="edit-actions" style="margin-top:10px">
      <span class="muted small">${t("adminManualNote")}</span><span class="spacer"></span>
      <button type="button" class="btn primary" data-action="admin-save-season" ${st.busy ? "disabled" : ""}>${t(st.season ? "save" : "adminCreateSeason")}</button>
    </div>
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
        <td>${p.picks ? `✓ <span class="muted small">${fmtDate(p.picks.updated_at, { day: "numeric", month: "short" })}</span>` : `<span class="muted">–</span>`}${offWarning(p.picks?.data, st.yearResults)}</td>
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
    ${riderDatalists(isPublished(st.yearResults) ? { ...ctx, riderSuggestions: entryRiderMap(st.yearResults) } : ctx)}`;
}

/** Startlistans status för året. */
function entryStatus(year, results) {
  const el = results?.entryList;
  const body = isPublished(results)
    ? t("adminEntryPublished", {
        date: fmtDate(el.firstPublished ?? el.changed, { day: "numeric", month: "long" }),
        a: el.MotoGP?.length ?? 0,
        b: el.Moto2?.length ?? 0,
        c: el.Moto3?.length ?? 0,
      })
    : t("adminEntryMissing");
  return `<p class="entry-status"><b>${t("adminEntryList", { year })}:</b> ${body}</p>`;
}

/** En rad för öppnings- eller stängningsdatum: automatiskt eller satt för hand. */
function dateRow(field, label, sd, autoIso, rule, waiting) {
  const isAuto = sd[field + "Auto"];
  const value = isAuto
    ? `<span class="auto-value">${autoIso ? fmtDate(autoIso, { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }) : `<span class="muted">${waiting}</span>`}</span>`
    : `<input type="datetime-local" data-root="admin" data-path="seasonDraft.${field}" value="${esc(sd[field])}" aria-label="${esc(label)}">`;
  return `<div class="window-row">
    <span class="window-label">${label}</span>
    ${value}
    <label class="edit-check small"><input type="checkbox" data-action="admin-auto" data-field="${field}" ${isAuto ? "checked" : ""}> ${t("adminAuto")}</label>
    <span class="muted small window-rule">${rule}</span>
  </div>`;
}

/** Varning om en spelare har tippat förare som inte finns på startlistan. */
function offWarning(picks, results) {
  const off = offList(picks, results);
  if (!off.length) return "";
  const names = off.map((o) => `${o.name} (${o.cls})`).join(", ");
  return `<div class="warn small" title="${esc(names)}">⚠ ${t("adminOffList", { n: off.length })}: ${esc(names)}</div>`;
}
