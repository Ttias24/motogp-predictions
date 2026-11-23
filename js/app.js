import { t, fmt, fmtDate, getLang, setLang } from "./i18n.js";
import { CLASSES, scoreSeason, computeStandings, buildRiderIndex, resolveRider, roundsWithResults } from "./scoring.js";
import { loadSeasonList, loadResults, loadPicks, loadSavedPicks, saveDraft, clearDraft, downloadJson } from "./data.js";
import { esc, playerMeta, roundTitle, setRiderInfo } from "./ui.js";
import { renderLeaderboard } from "./views/leaderboard.js";
import { renderPicks } from "./views/picks.js";
import { renderRiders, renderRiderDialog, rolesFor, rolesList } from "./views/riders.js";
import { renderChampionship } from "./views/championship.js";
import { renderEdit, normalizePicks, cleanPicks, emptyClassPick } from "./views/edit.js";
import { renderHistory, seasonNotStarted } from "./views/history.js";
import { renderPrivacy } from "./views/privacy.js";
import { renderPredict, renderJoin, draftFromPicks, errorText } from "./views/predict.js";
import { initPicker, newPickerState, picksFromSlots } from "./views/picker.js";
import { renderAdmin, toLocalInput, fromLocalInput, suggestWindow, inviteUrl } from "./views/admin.js";
import * as remote from "./remote.js";

const VIEWS = {
  leaderboard: renderLeaderboard,
  picks: renderPicks,
  riders: renderRiders,
  championship: renderChampionship,
  history: renderHistory,
  predict: renderPredict,
  join: renderJoin,
  edit: renderEdit,
  admin: renderAdmin,
  privacy: renderPrivacy,
};
// Flikar i menyn. "Mina tips" visas bara för den som öppnat sin personliga länk;
// Redigera och Admin nås via #/edit och #/admin men syns inte i menyn.
const NAV = ["leaderboard", "picks", "riders", "championship", "history"];
const ROUTES = { tippa: "predict", predict: "predict", join: "join" };
// Sidor som behöver minst en körd runda för att visa något vettigt.
const NEEDS_RESULTS = new Set(["leaderboard", "riders", "championship"]);
const TOKEN_KEY = "tipset-token";

const pref = (k, d) => {
  try {
    return localStorage.getItem(k) ?? d;
  } catch {
    return d;
  }
};
const setPref = (k, v) => {
  try {
    localStorage.setItem(k, v);
  } catch {}
};

/** Ljust eller mörkt läge (läses redan i theme-init.js innan sidan ritas). */
const isLight = () => document.documentElement.dataset.theme === "light";
function setTheme(theme) {
  if (theme === "light") document.documentElement.dataset.theme = "light";
  else delete document.documentElement.dataset.theme;
  setPref("theme", theme);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "light" ? "#ffffff" : "#161b24");
}

const state = {
  year: null,
  currentSeason: null,
  seasonList: [],
  history: null,
  riderSuggestions: null,
  results: null,
  picks: null,
  isDraft: false,
  upto: null,
  metric: pref("metric", "placement"),
  cls: pref("cls", "MotoGP"),
  display: pref("display", "points"),
  player: pref("player", ""),
  editDraft: null,
  dialog: null,
  databaseFrom: null,
  dbSeason: false, // tipsen för visad säsong kommer från databasen
  window: null, // tipsperiod + vilka som lämnat tips (databassäsonger)
  predict: null,
  admin: null,
  join: null,
};
let ctx = null;

const app = document.getElementById("app");
const dialog = document.getElementById("rider-dialog");

function route() {
  const [v, param] = location.hash.replace(/^#\/?/, "").split("/");
  const view = ROUTES[v] ?? v;
  return { view: VIEWS[view] ? view : "leaderboard", param: param ? decodeURIComponent(param) : "" };
}
const currentView = () => route().view;

function storedToken() {
  return pref(TOKEN_KEY, "");
}

// Admin-fliken visas så länge man är inloggad som admin. Bedöms utan att ladda Supabase:
// inloggningen ligger kvar i webbläsaren (sb-…-auth-token) och "is-admin" sparas när
// adminsidan har bekräftat behörigheten. Skyddet sitter ändå i databasen.
const ADMIN_KEY = "is-admin";
function adminTabVisible() {
  if (!remote.isConfigured() || pref(ADMIN_KEY, "") !== "1") return false;
  try {
    return Object.keys(localStorage).some((k) => k.startsWith("sb-") && k.endsWith("-auth-token"));
  } catch {
    return false;
  }
}
function setAdminFlag(on) {
  try {
    if (on) localStorage.setItem(ADMIN_KEY, "1");
    else localStorage.removeItem(ADMIN_KEY);
  } catch {}
}

// Poängen räknas bara om när resultaten, tipsen eller vald runda ändras – inte vid varje klick
// (byta klass, visning, spelare). Med hundratals spelare tar en omräkning märkbar tid på mobil.
let scoreCache = null;

function buildContext() {
  const { results, picks } = state;
  const done = roundsWithResults(results);
  const lastRound = done.at(-1)?.round ?? 0;
  if (state.upto == null || state.upto > lastRound) state.upto = lastRound;
  const upto = state.upto;
  const c = scoreCache;
  if (!c || c.results !== results || c.picks !== picks || c.upto !== upto) {
    const prevRound = done.filter((r) => r.round < upto).at(-1)?.round;
    const index = buildRiderIndex(results);
    const standings = {};
    const standingsPos = {};
    const standingsPts = {};
    for (const cls of CLASSES) {
      standings[cls] = computeStandings(results, cls, { uptoRound: upto });
      standingsPos[cls] = new Map(standings[cls].map((s) => [s.rider, s.pos]));
      standingsPts[cls] = new Map(standings[cls].map((s) => [s.rider, s.pts]));
    }
    scoreCache = {
      results,
      picks,
      upto,
      score: scoreSeason(picks, results, { uptoRound: upto }),
      prev: prevRound ? scoreSeason(picks, results, { uptoRound: prevRound }) : null,
      meta: playerMeta(picks.players ?? []),
      standings,
      standingsPos,
      standingsPts,
      riderKey: (cls, name) => resolveRider(index, cls, name),
      roles: new Map(), // rolesFor: klass|förare → vilka som valt honom
    };
  }
  const s = scoreCache;
  return {
    state,
    year: state.year,
    results,
    classes: CLASSES,
    score: s.score,
    prev: s.prev,
    upto,
    lastRound,
    meta: s.meta,
    standings: s.standings,
    standingsPos: s.standingsPos,
    standingsPts: s.standingsPts,
    riderSuggestions: state.riderSuggestions ?? results.riders,
    riderKey: s.riderKey,
    roleCache: s.roles,
  };
}

/** Laddar alla säsonger för Historik-sidan (en gång). */
async function loadHistory() {
  if (state.history || state.historyLoading) return;
  state.historyLoading = true;
  state.history = await Promise.all(
    state.seasonList.map(async (year) => {
      const [results, picks] = await Promise.all([loadResults(year), isDbYear(year) ? loadDbPicks(year).then((r) => r.picks) : loadSavedPicks(year)]);
      return { year, picks, score: scoreSeason(picks, results) };
    })
  );
  state.historyLoading = false;
  if (currentView() === "history") render();
}

function renderHeader() {
  const { results } = state;
  const done = roundsWithResults(results);
  const total = results.rounds.length;
  const next = results.rounds.find((r) => r.status !== "FINISHED" && !Object.keys(r.results ?? {}).length);
  const view = currentView();

  document.title = `${t("appTitle")} ${state.year}`;
  document.getElementById("brand-title").textContent = t("appTitle");
  document.getElementById("brand-year").textContent = state.year;
  document.querySelectorAll("[data-lang]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === getLang())));
  const themeBtn = document.querySelector(".theme-btn");
  const themeLabel = isLight() ? t("themeDark") : t("themeLight");
  themeBtn.setAttribute("aria-label", themeLabel);
  themeBtn.title = themeLabel;

  const nav = [...NAV];
  if (storedToken() && remote.isConfigured()) nav.push("predict");
  if (adminTabVisible() && !nav.includes("admin")) nav.push("admin");
  // T.ex. Admin när man är där. Integritetssidan nås från sidfoten och får ingen flik.
  if (!nav.includes(view) && view !== "privacy") nav.push(view);
  document.getElementById("nav").innerHTML = nav
    .map((v) => {
      const href = v === view && !NAV.includes(v) ? location.hash : v === "leaderboard" ? "#/" : v === "predict" ? "#/tippa" : `#/${v}`;
      const label = v === "admin" ? "Admin" : t("nav." + v);
      return `<a href="${href}" ${v === view ? 'aria-current="page"' : ""}>${label}</a>`;
    })
    .join("");

  const roundSelect = done.length
    ? `<label class="round-pick hide-sm">${t("afterRound")}
        <select data-action="upto">${done
          .map((r) => `<option value="${r.round}" ${r.round === state.upto ? "selected" : ""}>R${r.round} · ${esc(roundTitle(r))}</option>`)
          .join("")}</select>
        <span class="muted">${t("of")} ${total}</span>
      </label>`
    : "";

  const updated = results.updatedAt
    ? `<span class="muted small">${t("updated")} ${fmtDate(results.updatedAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>`
    : "";
  document.getElementById("statusbar").innerHTML = `
    ${roundSelect}
    ${
      next
        ? `<span class="pill">${t("next")}: <b>R${next.round} ${esc(roundTitle(next))}</b> · ${fmtDate(next.dateStart)}–${fmtDate(next.dateEnd)}</span>`
        : done.length
        ? `<span class="pill">🏁 ${t("seasonOver")}</span>`
        : ""
    }
  `;
  // Uppdaterad-tiden står längst ner på varje sida. Rundväljaren visas inte på mobil.
  // Sidfoten: uppdaterad-tiden till vänster och integritetslänken i mitten.
  pageFoot = `<footer class="page-foot"><span class="foot-updated">${updated}</span><a class="foot-link" href="#/privacy">${t("privacyLink")}</a></footer>`;
}
let pageFoot = "";

function renderBanners() {
  const parts = [];
  if (state.year !== state.currentSeason)
    parts.push(
      `<div class="banner">${t("archiveBanner", { year: state.year })} <a href="${location.pathname}#/">${t("backToCurrent", {
        year: state.currentSeason,
      })}</a></div>`
    );
  if (state.fromBackup) parts.push(`<div class="banner warn">${t("fromBackup")}</div>`);
  if (state.isDraft)
    parts.push(
      `<div class="banner">${t("draftBanner")} <button type="button" class="link" data-action="reset-picks">${t("draftReset")}</button></div>`
    );
  if (ctx.lastRound && ctx.score.warnings.length)
    parts.push(
      `<div class="banner warn">${t("unknownRiders")} ${ctx.score.warnings.map((w) => `<b>${esc(w.name)}</b> (${w.cls})`).join(", ")}</div>`
    );
  return parts.join("");
}

function render() {
  ctx = buildContext();
  renderHeader();
  const { view, param } = route();
  if (view === "edit" && !state.editDraft) state.editDraft = normalizePicks(state.picks);
  if (view === "history") loadHistory();
  if (view === "predict") ensurePredict(param);
  if (view === "join") ensureJoin(param);
  if (view === "admin") ensureAdmin();
  document.body.classList.toggle("preseason", !ctx.lastRound);
  document.body.dataset.view = view;

  let body;
  if (view === "edit" && state.dbSeason) body = `<section class="card"><p>${t("editUseAdmin")} <a href="#/admin">Admin</a></p></section>`;
  else if (NEEDS_RESULTS.has(view) && !ctx.lastRound) body = seasonNotStarted(ctx);
  else if (view === "picks" && !ctx.score.players.length) body = seasonNotStarted(ctx);
  else body = VIEWS[view](ctx);
  app.innerHTML = renderBanners() + body + pageFoot;
  if (state.dialog) openDialog(state.dialog.cls, state.dialog.key);
}

/** Liten ruta vid brickorna: alla som tippat föraren och var. */
const whoPop = document.getElementById("who-pop");
function showWho(btn) {
  if (!whoPop?.showPopover) return;
  const roles = rolesFor(ctx, btn.dataset.cls, btn.dataset.name);
  whoPop.innerHTML = `<div class="who-head">${esc(btn.dataset.name)}</div>${rolesList(roles)}`;
  if (!whoPop.matches(":popover-open")) whoPop.showPopover();
  const r = btn.getBoundingClientRect();
  const w = whoPop.offsetWidth;
  const h = whoPop.offsetHeight;
  const left = Math.min(Math.max(8, r.left), innerWidth - w - 8);
  const top = r.bottom + 6 + h > innerHeight - 8 ? Math.max(8, r.top - h - 6) : r.bottom + 6;
  whoPop.style.left = left + "px";
  whoPop.style.top = top + "px";
}
// Rutan följer inte med när sidan eller tabellen rullas, så den stängs i stället.
addEventListener(
  "scroll",
  (e) => {
    if (whoPop?.matches(":popover-open") && !whoPop.contains(e.target)) whoPop.hidePopover();
  },
  { capture: true, passive: true }
);

function openDialog(cls, key) {
  state.dialog = { cls, key };
  dialog.innerHTML = renderRiderDialog(ctx, cls, key);
  if (!dialog.open) dialog.showModal();
}

const key = (p) => (/^\d+$/.test(p) ? Number(p) : p);
function getPath(obj, path) {
  return path.split(".").reduce((o, p) => o?.[key(p)], obj);
}
function setPath(obj, path, value) {
  const parts = path.split(".");
  const parent = getPath(obj, parts.slice(0, -1).join("."));
  if (parent) parent[key(parts.at(-1))] = value;
}

/** Vilket utkast ett formulärfält skriver till (data-root). */
function rootFor(el) {
  switch (el.dataset.root) {
    case "predict":
      return state.predict?.draft;
    case "predict-name":
      return state.predict;
    case "join":
      return state.join;
    case "admin":
      return state.admin;
    default:
      return state.editDraft;
  }
}

function uniqueId(name, players) {
  const base = (name || "spelare").toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "spelare";
  let id = base;
  let n = 2;
  while (players.some((p) => p.id === id)) id = `${base}-${n++}`;
  return id;
}

function setStatus(text) {
  const el = document.getElementById("edit-status");
  if (el) el.textContent = text;
}

/** Tips ur databasen → samma format som picks-filerna. */
function overviewToPicks(ov, year) {
  return {
    season: year,
    scoring: ov?.scoring ?? { exactPosition: 2, insideTop5: 1 },
    players: (ov?.players ?? []).filter((p) => p.picks).map((p) => ({ id: p.id, name: p.name, picks: p.picks })),
  };
}
const isDbYear = (year) => remote.isConfigured() && state.databaseFrom != null && year >= state.databaseFrom;

/** Rensar ett utkast från formuläret innan det sparas. */
function cleanDraft(draft) {
  return Object.fromEntries(
    CLASSES.map((cls) => {
      const c = draft[cls];
      return [
        cls,
        {
          top5: c.top5.map((n) => (n ?? "").trim()),
          backup: (c.backup ?? "").trim() || null,
          bowling: (c.bowling ?? "").trim() || null,
          backupActivated: c.backupActivated ?? null,
        },
      ];
    })
  );
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// ---- Spelarsidor ----
async function ensurePredict(param) {
  if (param) {
    // Spara koden i webbläsaren och dölj den i adressfältet.
    setPref(TOKEN_KEY, param);
    history.replaceState(null, "", `${location.pathname}${location.search}#/tippa`);
  }
  const token = storedToken();
  if (!remote.isConfigured()) return;
  const p = state.predict;
  if (p && p.token === token && (p.entry || p.error || p.loading)) return;
  state.predict = { token, loading: Boolean(token) };
  if (!token) return;
  try {
    const entry = await remote.myEntry(token);
    // Startlistan och förarinfo för den säsong spelaren tippar på (kan vara nästa år).
    const results = entry.season === state.year ? state.results : await loadResults(entry.season);
    setPredictEntry(entry, { results });
  } catch (err) {
    state.predict = { token, error: err.code ?? err.message };
  }
  if (currentView() === "predict") render();
}

function setPredictEntry(entry, keep = {}) {
  const results = keep.results ?? state.predict?.results ?? null;
  state.predict = {
    token: state.predict?.token ?? storedToken(),
    entry,
    loading: false,
    offset: Date.parse(entry.now) - Date.now(),
    draft: draftFromPicks(entry.picks),
    name: entry.name ?? "",
    results,
    pk: results ? newPickerState(entry, results) : null,
    ...keep,
  };
}

/** Lämnar in tipsen från tipsväljaren (efter "Är du säker?"). */
async function submitPicker() {
  const p = state.predict;
  p.busy = true;
  p.msg = "";
  render();
  try {
    const entry = await remote.saveMyPicks(p.token, picksFromSlots(p.pk.slots, p.results), p.name);
    setPredictEntry(entry, { msg: t("predictSavedOk"), msgType: "ok" });
    if (state.dbSeason && entry.season === state.year) await refreshDbSeason();
  } catch (err) {
    p.busy = false;
    p.msg = errorText(err.code ?? err.message);
    p.msgType = "error";
  }
  render();
  document.querySelector(".pk-submit, .pk-review-wrap")?.scrollIntoView({ behavior: "smooth", block: "end" });
}

initPicker({
  get: () => (currentView() === "predict" ? state.predict : null),
  render: () => render(),
  submit: () => submitPicker(),
  setName: (v) => {
    if (state.predict) state.predict.name = v;
  },
});

function ensureJoin(code) {
  if (state.join?.code === code) return;
  state.join = { code };
}

// ---- Admin ----
async function ensureAdmin() {
  if (!remote.isConfigured() || state.admin) return;
  state.admin = { loading: true, links: {}, years: [] };
  const a = state.admin;
  try {
    a.session = await remote.getSession();
    if (a.session) a.isAdmin = await remote.isAdmin();
    setAdminFlag(Boolean(a.session && a.isAdmin));
    if (a.session) {
      if (a.isAdmin) {
        const from = state.databaseFrom ?? state.currentSeason;
        const def = Math.max(state.currentSeason, from);
        a.years = [...new Set([def + 1, def, ...state.seasonList.filter((y) => y >= from)])].sort((x, y) => y - x);
        await loadAdminYear(def);
      }
    }
  } catch (err) {
    a.msg = err.code ? errorText(err.code) : err.message;
    a.msgType = "error";
  }
  a.loading = false;
  if (currentView() === "admin") render();
}

async function loadAdminYear(year) {
  const a = state.admin;
  a.year = year;
  a.editing = null;
  a.draft = null;
  a.joinCode = null;
  const [season, yearResults] = await Promise.all([remote.getSeason(year), loadResults(year)]);
  a.season = season;
  a.yearResults = yearResults;
  await reloadAdminPlayers();
  const sug = suggestWindow(year, yearResults);
  a.seasonDraft = {
    opensAuto: season ? season.opens_auto !== false : true,
    closesAuto: season ? season.closes_auto !== false : true,
    opens: season?.opens_at ? toLocalInput(season.opens_at) : sug.opens,
    closes: season?.closes_at ? toLocalInput(season.closes_at) : sug.closes,
  };
}

async function reloadAdminPlayers() {
  const a = state.admin;
  const list = a.season ? await remote.listPlayers(a.year) : [];
  a.players = list.map((p) => ({ ...p, picks: Array.isArray(p.picks) ? p.picks[0] ?? null : p.picks }));
}

/** Kör en adminåtgärd med felhantering och omritning. */
async function adminDo(fn, okMsg) {
  const a = state.admin;
  a.busy = true;
  a.msg = "";
  render();
  try {
    await fn(a);
    if (okMsg) {
      a.msg = okMsg;
      a.msgType = "ok";
    }
  } catch (err) {
    a.msg = err.code ? errorText(err.code) : err.message;
    a.msgType = "error";
  }
  a.busy = false;
  render();
}

// ---- Händelser ----
document.addEventListener("click", async (e) => {
  const el = e.target.closest("[data-action]");
  if (!el) {
    if (e.target === dialog) closeDialog();
    return;
  }
  const act = el.dataset.action;
  const a = state.admin;
  const id = el.dataset.id;
  switch (act) {
    case "set":
      state[el.dataset.key] = el.dataset.value;
      setPref(el.dataset.key, el.dataset.value);
      render();
      break;
    case "lang":
      setLang(el.dataset.lang);
      render();
      break;
    case "theme":
      setTheme(isLight() ? "dark" : "light");
      render();
      break;
    case "select-player":
      state.player = el.dataset.id;
      setPref("player", state.player);
      {
        // Behåll listans rullläge när sidan ritas om.
        const top = document.querySelector(".player-list ol")?.scrollTop ?? 0;
        render();
        const ol = document.querySelector(".player-list ol");
        if (ol) ol.scrollTop = top;
      }
      if (window.matchMedia("(max-width: 860px)").matches)
        document.querySelector(".player-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
      break;
    case "rider":
      openDialog(el.dataset.cls, el.dataset.key);
      break;
    case "who":
      showWho(el);
      break;
    case "close-dialog":
      closeDialog();
      break;
    case "copy-text":
      if (await copyText(el.dataset.text)) el.textContent = "✓";
      break;

    // Fil-baserad redigering (äldre säsonger)
    case "add-player": {
      const d = state.editDraft;
      const name = `${t("newPlayer")} ${d.players.length + 1}`;
      d.players.push({ id: uniqueId(name, d.players), name, picks: Object.fromEntries(CLASSES.map((c) => [c, emptyClassPick()])) });
      render();
      break;
    }
    case "remove-player": {
      const d = state.editDraft;
      const p = d.players[Number(el.dataset.index)];
      if (p && confirm(t("confirmRemove", { name: p.name }))) {
        d.players.splice(Number(el.dataset.index), 1);
        render();
      }
      break;
    }
    case "apply-picks": {
      const cleaned = cleanPicks(state.editDraft);
      state.picks = cleaned;
      state.isDraft = true;
      saveDraft(state.year, cleaned);
      render();
      setStatus(t("applied"));
      break;
    }
    case "download-picks":
      downloadJson(`picks-${state.year}.json`, cleanPicks(state.editDraft ?? normalizePicks(state.picks)));
      break;
    case "reset-picks":
      clearDraft(state.year);
      state.picks = await loadSavedPicks(state.year);
      state.isDraft = false;
      state.editDraft = null;
      render();
      break;

    // Spelare
    case "join": {
      const j = state.join;
      const name = j.name ?? document.getElementById("join-name")?.value ?? "";
      j.busy = true;
      j.error = null;
      render();
      try {
        j.result = await remote.joinSeason(j.code, name);
        setPref(TOKEN_KEY, j.result.token);
        state.predict = null;
      } catch (err) {
        j.error = err.code ?? err.message;
      }
      j.busy = false;
      render();
      break;
    }
    case "predict-save": {
      const p = state.predict;
      p.busy = true;
      p.msg = "";
      render();
      try {
        const entry = await remote.saveMyPicks(p.token, cleanDraft(p.draft), p.name);
        setPredictEntry(entry, { msg: t("predictSavedOk"), msgType: "ok" });
        if (state.dbSeason && entry.season === state.year) await refreshDbSeason();
      } catch (err) {
        p.busy = false;
        p.msg = errorText(err.code ?? err.message);
        p.msgType = "error";
      }
      render();
      break;
    }
    case "predict-activate": {
      const p = state.predict;
      const cls = el.dataset.cls;
      const replaces = document.getElementById(`act-${cls}`)?.value;
      const backup = p.entry.picks?.[cls]?.backup;
      if (!replaces || !confirm(t("predictConfirmActivate", { backup, cls, name: replaces }))) break;
      p.busy = true;
      render();
      try {
        setPredictEntry(await remote.activateMyBackup(p.token, cls, replaces), { msg: t("predictActivatedOk"), msgType: "ok" });
        if (state.dbSeason) await refreshDbSeason();
      } catch (err) {
        p.busy = false;
        p.msg = errorText(err.code ?? err.message);
        p.msgType = "error";
      }
      render();
      break;
    }

    // Admin
    case "admin-login": {
      const email = document.getElementById("admin-email")?.value.trim();
      if (!email) break;
      await adminDo(() => remote.sendLoginLink(email, `${location.origin}${location.pathname}`), t("adminLinkSent"));
      break;
    }
    case "admin-logout":
      await remote.signOut();
      setAdminFlag(false);
      state.admin = null;
      render();
      break;
    case "admin-use-suggestion": {
      const sug = suggestWindow(a.year, a.yearResults);
      a.seasonDraft.closes = sug.closes;
      a.seasonDraft.opens ||= sug.opens;
      render();
      break;
    }
    case "admin-save-season":
      await adminDo(async (a) => {
        // Automatiska datum följer reglerna (startlistan/kalendern); manuella tas från formuläret.
        const sd = a.seasonDraft;
        const auto = suggestWindow(a.year, a.yearResults).auto;
        const fields = {
          opens_auto: sd.opensAuto,
          closes_auto: sd.closesAuto,
          opens_at: sd.opensAuto ? auto.opens : fromLocalInput(sd.opens),
          closes_at: sd.closesAuto ? auto.closes : fromLocalInput(sd.closes),
        };
        if (!sd.opensAuto && !fields.opens_at) throw new Error(t("adminNeedOpens"));
        if (!sd.closesAuto && !fields.closes_at) throw new Error(t("adminNeedCloses"));
        if (fields.opens_at && fields.closes_at && fields.closes_at <= fields.opens_at) throw new Error(t("adminDatesOrder"));
        a.season = a.season ? await remote.updateSeason(a.year, fields) : await remote.createSeason({ year: a.year, ...fields });
        await reloadAdminPlayers();
        if (state.dbSeason && a.year === state.year) await refreshDbSeason();
      }, t("adminSaved"));
      break;
    case "admin-new-join":
      if (a.season.join_code_hash && !confirm(t("adminJoinConfirmReplace"))) break;
      await adminDo(async (a) => {
        a.joinCode = await remote.newJoinCode(a.year);
        a.season.join_code_hash = "set";
      });
      break;
    case "admin-add-player": {
      const label = document.getElementById("admin-new-name")?.value ?? "";
      await adminDo(async (a) => {
        const res = await remote.createPlayer(a.year, label);
        a.links[res.id] = res.token;
        await reloadAdminPlayers();
      }, t("adminCreated"));
      break;
    }
    case "admin-new-link": {
      const p = a.players.find((x) => x.id === id);
      if (!confirm(t("adminConfirmNewLink", { name: p?.name ?? p?.label ?? "?" }))) break;
      await adminDo(async (a) => {
        a.links[id] = await remote.newToken(id);
      });
      break;
    }
    case "admin-copy":
      if (await copyText(inviteUrl(a.links[id]))) {
        a.msg = t("adminCopied");
        a.msgType = "ok";
        render();
      }
      break;
    case "admin-edit": {
      const p = a.players.find((x) => x.id === id);
      a.editing = p ? id : null;
      a.draft = p ? draftFromPicks(p.picks?.data) : null;
      render();
      if (p) document.querySelector(".edit-classes")?.scrollIntoView({ behavior: "smooth", block: "start" });
      break;
    }
    case "admin-save-picks":
      await adminDo(async (a) => {
        await remote.adminSavePicks(a.editing, cleanDraft(a.draft));
        await reloadAdminPlayers();
        if (state.dbSeason && a.year === state.year) await refreshDbSeason();
      }, t("adminSaved"));
      break;
    case "admin-delete": {
      const p = a.players.find((x) => x.id === id);
      if (!confirm(t("adminConfirmDelete", { name: p?.name ?? p?.label ?? "?" }))) break;
      await adminDo(async (a) => {
        await remote.deletePlayer(id);
        if (a.editing === id) a.editing = null;
        await reloadAdminPlayers();
      });
      break;
    }
    case "admin-approve":
      await adminDo(async () => {
        await remote.approvePlayer(id);
        await reloadAdminPlayers();
      });
      break;
  }
});

document.addEventListener("change", async (e) => {
  const el = e.target;
  const act = el.dataset.action;
  if (act === "upto") {
    state.upto = Number(el.value);
    render();
    return;
  }
  if (act === "admin-year") {
    await adminDo((a) => loadAdminYear(Number(el.value)));
    return;
  }
  if (act === "admin-auto") {
    const sd = state.admin.seasonDraft;
    const field = el.dataset.field;
    sd[field + "Auto"] = el.checked;
    if (!el.checked && !sd[field]) sd[field] = suggestWindow(state.admin.year, state.admin.yearResults)[field];
    render();
    return;
  }
  if (act === "admin-join-approval") {
    await adminDo(async (a) => {
      a.season = await remote.updateSeason(a.year, { join_approval: el.checked });
    }, t("adminSaved"));
    return;
  }
  if (act === "admin-rename") {
    await adminDo(async () => {
      await remote.renamePlayer(el.dataset.id, el.value.trim() || null);
      await reloadAdminPlayers();
    });
    return;
  }
  if (act === "toggle-backup") {
    const c = getPath(rootFor(el), el.dataset.base);
    if (!c) return;
    const rounds = el.dataset.root === "admin" ? state.admin.yearResults?.rounds ?? [] : state.results.rounds;
    const last = el.dataset.root === "admin" ? roundsWithResults({ rounds }).at(-1)?.round ?? 0 : ctx.lastRound || 0;
    c.backupActivated = el.checked ? { round: Math.min(last + 1, rounds.length || 22), replaces: c.top5.find(Boolean) ?? "" } : null;
    render();
    return;
  }
  const root = el.dataset.path ? rootFor(el) : null;
  if (root) {
    setPath(root, el.dataset.path, el.dataset.type === "number" ? Number(el.value) : el.value);
    render(); // uppdatera varningar, ersätter-listor m.m.
  }
});

document.addEventListener("input", (e) => {
  const el = e.target;
  if (!el.dataset.path || el.tagName !== "INPUT" || el.type === "checkbox") return;
  const root = rootFor(el);
  if (root) setPath(root, el.dataset.path, el.dataset.type === "number" ? Number(el.value) : el.value);
});

// Saknas en nummergrafik visas numret som text i stället (ersätter inline-onerror,
// som sidans säkerhetsregler – Content Security Policy – inte tillåter).
document.addEventListener(
  "error",
  (e) => {
    const img = e.target;
    if (img?.tagName !== "IMG" || !("fallback" in img.dataset)) return; // tom fallback = ta bort bilden
    img.parentNode?.classList.remove("art");
    img.replaceWith(img.dataset.fallback);
  },
  true
);

// Mushjulet över ett resultatrutnät som inte får plats bläddrar i sidled. När rutnätet
// är vid kanten (eller får plats) bläddrar hjulet sidan som vanligt.
document.addEventListener(
  "wheel",
  (e) => {
    const wrap = e.target.closest?.(".grid-wrap");
    if (!wrap || e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    const max = wrap.scrollWidth - wrap.clientWidth;
    if (max <= 1) return;
    const dy = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY;
    const atStart = wrap.scrollLeft <= 0 && dy < 0;
    const atEnd = wrap.scrollLeft >= max - 1 && dy > 0;
    if (atStart || atEnd) return;
    wrap.scrollLeft += dy;
    e.preventDefault();
  },
  { passive: false }
);

function closeDialog() {
  state.dialog = null;
  if (dialog.open) dialog.close();
}
dialog.addEventListener("close", () => (state.dialog = null));
window.addEventListener("hashchange", () => {
  closeDialog();
  render();
  window.scrollTo(0, 0);
});

// ---- Start ----
async function loadDbPicks(year) {
  // När tipsperioden har stängt finns tipsen som säkerhetskopia på GitHub (data/picks-<år>.json). Då frågas
  // databasen bara om en kort kontrollsumma; stämmer den används filen. Det håller datatrafiken
  // från databasen (gratisnivån: 5 GB/månad) nära noll även med hundratals besökare.
  const backup = await loadSavedPicks(year);
  const closedCopy = backup.version && backup.closesAt && Date.parse(backup.closesAt) <= Date.now();
  if (closedCopy) {
    try {
      if ((await remote.picksVersion(year)) === backup.version) return { picks: backup, window: backupWindow(backup, year) };
    } catch (err) {
      console.error(err);
      return { picks: backup, window: null, fromBackup: true };
    }
  }
  try {
    const ov = await remote.seasonOverview(year);
    if (ov) return { picks: overviewToPicks(ov, year), window: ov };
  } catch (err) {
    console.error(err);
  }
  // Databasen svarar inte (eller saknar säsongen): använd säkerhetskopian.
  if (backup.players?.length) return { picks: backup, window: null, fromBackup: true };
  return { picks: overviewToPicks(null, year), window: null };
}

/** Tipsperioden ur säkerhetskopian, i samma form som season_overview. */
function backupWindow(backup, year) {
  return {
    year,
    opensAt: backup.opensAt ?? null,
    closesAt: backup.closesAt,
    scoring: backup.scoring,
    now: new Date().toISOString(),
    players: (backup.players ?? []).map((p) => ({ id: p.id, name: p.name, submitted: true, picks: p.picks })),
  };
}

async function refreshDbSeason() {
  const { picks, window } = await loadDbPicks(state.year);
  state.picks = picks;
  state.window = window;
}

async function init() {
  setLang(getLang());
  try {
    // Tillbaka från inloggningslänken (?code=...): låt Supabase logga in och gå till Admin.
    if (remote.isConfigured() && new URLSearchParams(location.search).has("code")) {
      await remote.getSession();
      history.replaceState(null, "", `${location.pathname}#/admin`);
    }
    const seasons = await loadSeasonList();
    state.currentSeason = seasons.current;
    state.databaseFrom = seasons.databaseFrom ?? null;
    state.seasonList = [...new Set([seasons.current, ...(seasons.seasons ?? [])])].sort((a, b) => b - a);
    const asked = Number(new URLSearchParams(location.search).get("season"));
    state.year = state.seasonList.includes(asked) ? asked : seasons.current;
    state.dbSeason = isDbYear(state.year);
    const [results, picksRes] = await Promise.all([
      loadResults(state.year),
      state.dbSeason ? loadDbPicks(state.year) : loadPicks(state.year),
    ]);
    state.results = results;
    // En ny säsong har inga förare i resultaten förrän första racet: föreslå förra årets förare.
    const prevYear = state.seasonList.find((y) => y < state.year);
    if (prevYear && !Object.values(results.riders ?? {}).some((c) => Object.keys(c).length)) {
      const prev = await loadResults(prevYear);
      state.riderSuggestions = prev.riders;
      setRiderInfo(prev.riders, { ...prev.flags, ...results.flags });
    } else {
      setRiderInfo(results.riders, results.flags);
    }
    state.picks = picksRes.picks;
    state.isDraft = Boolean(picksRes.isDraft);
    state.window = picksRes.window ?? null;
    state.fromBackup = Boolean(picksRes.fromBackup);
    if (!CLASSES.includes(state.cls)) state.cls = "MotoGP";
    render();
  } catch (err) {
    app.innerHTML = `<div class="banner warn">${esc(err.message)}</div>`;
    console.error(err);
  }
}
init();

// Exponera för felsökning i konsolen.
window.__tips = { state, fmt };
