// "Mina tips": sidan som öppnas från en spelares personliga länk (#/tippa/<kod>).
import { t, fmtDate } from "../i18n.js";
import { CLASSES, normalizeName } from "../scoring.js";
import { esc, empty } from "../ui.js";
import { classForm, riderDatalists } from "./edit.js";
import { isConfigured } from "../remote.js";

export const emptyClassDraft = () => ({ top5: ["", "", "", "", ""], backup: "", bowling: "", backupActivated: null });

export function draftFromPicks(picks) {
  return Object.fromEntries(
    CLASSES.map((cls) => {
      const c = picks?.[cls];
      return [
        cls,
        c
          ? {
              top5: [...(c.top5 ?? []), "", "", "", "", ""].slice(0, 5),
              backup: c.backup ?? "",
              bowling: c.bowling ?? "",
              backupActivated: c.backupActivated ?? null,
            }
          : emptyClassDraft(),
      ];
    })
  );
}

const DATE_TIME = { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" };

export function countdown(ms) {
  if (ms <= 0) return "";
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (d > 0) return t("leftDays", { d, h });
  if (h > 0) return t("leftHours", { h, m });
  return t("leftMinutes", { m: Math.max(m, 1) });
}

/** Översätter felkoder från databasen ("incomplete:Moto2" m.fl.). */
export function errorText(code) {
  const [key, cls] = String(code ?? "").split(":");
  const known = t(`err.${key}`, { cls: cls ?? "" });
  return known === `err.${key}` ? t("err.unknown", { msg: code }) : known;
}

function message(st) {
  if (!st.msg) return "";
  return `<p class="${st.msgType === "error" ? "warn" : "ok"}" role="status">${esc(st.msg)}</p>`;
}

/** Sidan bakom den delade inbjudningslänken (#/join/<kod>). */
export function renderJoin(ctx) {
  const st = ctx.state.join;
  if (!isConfigured()) return empty(t("dbNotConfigured"));
  if (!st?.code) return `<section class="card"><h2>${t("joinTitle")}</h2><p class="warn">${t("err.bad_join_code")}</p></section>`;
  if (st.result) {
    const url = `${location.origin}${location.pathname}#/tippa/${st.result.token}`;
    return `<section class="card">
      <h2>${t("joinWelcome", { name: esc(st.result.name) })}</h2>
      ${st.result.approved ? "" : `<p class="warn">${t("joinPending")}</p>`}
      <p>${t("joinSaveLink")}</p>
      <div class="edit-actions">
        <input type="text" readonly class="inline-input link-out wide" value="${esc(url)}" aria-label="${esc(t("joinYourLink"))}">
        <button type="button" class="btn ghost" data-action="copy-text" data-text="${esc(url)}">${t("copy")}</button>
      </div>
      <p style="margin-top:14px"><a class="btn primary" href="#/tippa">${t("joinGoToPicks")} →</a></p>
    </section>`;
  }
  return `<section class="card">
    <h2>${t("joinTitle")}</h2>
    <p>${t("joinHelp")}</p>
    <div class="edit-actions">
      <input type="text" id="join-name" maxlength="40" value="${esc(st.name ?? "")}" data-root="join" data-path="name" placeholder="${esc(t("joinNamePlaceholder"))}" aria-label="${esc(t("name"))}" autocomplete="nickname">
      <button type="button" class="btn primary" data-action="join" ${st.busy ? "disabled" : ""}>${t("joinButton")}</button>
    </div>
    ${st.error ? `<p class="warn" role="status">${esc(errorText(st.error))}</p>` : ""}
    ${storedTokenHint()}
  </section>`;
}

function storedTokenHint() {
  try {
    return localStorage.getItem("tipset-token") ? `<p class="muted small">${t("joinAlready")} <a href="#/tippa">${t("nav.predict")}</a></p>` : "";
  } catch {
    return "";
  }
}

export function renderPredict(ctx) {
  const st = ctx.state.predict;
  if (!isConfigured()) return empty(t("dbNotConfigured"));
  if (!st?.token) return `<section class="card"><h2>${t("nav.predict")}</h2><p>${t("predictNoToken")}</p></section>`;
  if (st.error) return `<section class="card"><h2>${t("nav.predict")}</h2><p class="warn">${esc(errorText(st.error))}</p></section>`;
  if (!st.entry) return empty("…");

  const e = st.entry;
  const now = Date.now() + (st.offset ?? 0);
  const opens = Date.parse(e.opensAt);
  const closes = Date.parse(e.closesAt);
  const head = `<div class="card-head"><h2>${e.name ? t("predictHello", { name: esc(e.name) }) : t("predictHelloNoName")}</h2><span class="muted">${t("season")} ${e.season}</span></div>${
    e.approved === false ? `<p class="warn">${t("joinPending")}</p>` : ""
  }`;

  if (now < opens) {
    return `<section class="card">${head}<p>${t("predictOpensAt", { date: fmtDate(e.opensAt, DATE_TIME) })}</p></section>`;
  }

  if (now < closes) {
    const status = e.picks
      ? t("predictSaved", { date: fmtDate(e.updatedAt, DATE_TIME) })
      : `<b>${t("predictNotSaved")}</b>`;
    return `<section class="card">
        ${head}
        <p>${t("predictDeadline", { date: fmtDate(e.closesAt, DATE_TIME), left: countdown(closes - now) })}</p>
        <p class="muted">${status}</p>
        <details class="rules"><summary>${t("rulesTitle")}</summary><ul>${t("rules").map((r) => `<li>${r}</li>`).join("")}</ul></details>
      </section>
      <section class="card">
        <label class="name-field">${t("displayName")}
          <input type="text" maxlength="40" value="${esc(st.name ?? "")}" data-root="predict-name" data-path="name" placeholder="${esc(
            t("joinNamePlaceholder")
          )}" autocomplete="nickname">
          <span class="muted small">${t("displayNameHelp")}</span>
        </label>
        <div class="edit-classes">${CLASSES.map((cls) => classForm({ cls, c: st.draft[cls], base: cls, root: "predict" })).join("")}</div>
        <div class="edit-actions" style="margin-top:14px">
          <span class="spacer"></span>
          <button type="button" class="btn primary" data-action="predict-save" ${st.busy ? "disabled" : ""}>${t(e.picks ? "predictUpdate" : "predictSubmit")}</button>
        </div>
        ${message(st)}
      </section>
      ${riderDatalists(ctx)}`;
  }

  // Stängt: visa tipsen och möjligheten att aktivera backup.
  if (!e.picks)
    return `<section class="card">${head}<p>${t("predictClosedNoPicks")}</p></section>`;

  const blocks = CLASSES.map((cls) => {
    const c = e.picks[cls];
    const act = c.backupActivated;
    let backup;
    if (act) {
      backup = `<p><span class="tag bu">BU</span> ${esc(c.backup)} – ${t("predictActivated", {
        date: fmtDate(act.at ?? "", DATE_TIME),
        name: esc(act.replaces),
      })}</p>`;
    } else {
      backup = `<p><span class="tag bu">BU</span> ${esc(c.backup)} – ${t("buInactive")}</p>
        <div class="activate">
          <label>${t("replaces")}
            <select id="act-${cls}">${c.top5.map((n) => `<option>${esc(n)}</option>`).join("")}</select>
          </label>
          <button type="button" class="btn ghost" data-action="predict-activate" data-cls="${cls}" ${st.busy ? "disabled" : ""}>${t("predictActivate")}</button>
        </div>`;
    }
    return `<div class="edit-class">
      <h4>${cls}</h4>
      <ol class="edit-top5 readonly">${c.top5
        .map((n) => `<li class="${act && normalizeName(n) === normalizeName(act.replaces) ? "struck-text" : ""}">${esc(n)}</li>`)
        .join("")}</ol>
      ${backup}
      <p><span class="tag bk">DNF</span> ${esc(c.bowling)}</p>
    </div>`;
  }).join("");

  return `<section class="card">${head}<p>${t("predictClosed")}</p><p class="muted small">${t("predictActivateHelp")}</p></section>
    <section class="card"><div class="edit-classes">${blocks}</div>${message(st)}</section>`;
}
