import { t, fmt, fmtDate, getLang, setLang } from "./i18n.js";
import { CLASSES, scoreSeason, computeStandings, buildRiderIndex, resolveRider, roundsWithResults } from "./scoring.js";
import { loadSeasonList, loadResults, loadPicks, loadSavedPicks, saveDraft, clearDraft, downloadJson } from "./data.js";
import { esc, playerMeta, roundTitle, setRiderInfo } from "./ui.js";
import { renderLeaderboard } from "./views/leaderboard.js";
import { renderPicks } from "./views/picks.js";
import { renderRiders, renderRiderDialog } from "./views/riders.js";
import { renderChampionship } from "./views/championship.js";
import { renderEdit, normalizePicks, cleanPicks, emptyClassPick } from "./views/edit.js";
import { renderHistory, seasonNotStarted } from "./views/history.js";

const VIEWS = {
  leaderboard: renderLeaderboard,
  picks: renderPicks,
  riders: renderRiders,
  championship: renderChampionship,
  edit: renderEdit,
  history: renderHistory,
};
// Sidor som behöver minst en körd runda för att visa något vettigt.
const NEEDS_RESULTS = new Set(["leaderboard", "picks", "riders", "championship"]);

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
};
let ctx = null;

const app = document.getElementById("app");
const dialog = document.getElementById("rider-dialog");

function currentView() {
  const v = location.hash.replace(/^#\/?/, "");
  return VIEWS[v] ? v : "leaderboard";
}

function buildContext() {
  const { results, picks } = state;
  const done = roundsWithResults(results);
  const lastRound = done.at(-1)?.round ?? 0;
  if (state.upto == null || state.upto > lastRound) state.upto = lastRound;
  const upto = state.upto;
  const score = scoreSeason(picks, results, { uptoRound: upto });
  const prevRound = done.filter((r) => r.round < upto).at(-1)?.round;
  const prev = prevRound ? scoreSeason(picks, results, { uptoRound: prevRound }) : null;
  const index = buildRiderIndex(results);
  const standings = {};
  const standingsPos = {};
  const standingsPts = {};
  for (const cls of CLASSES) {
    standings[cls] = computeStandings(results, cls, { uptoRound: upto });
    standingsPos[cls] = new Map(standings[cls].map((s) => [s.rider, s.pos]));
    standingsPts[cls] = new Map(standings[cls].map((s) => [s.rider, s.pts]));
  }
  return {
    state,
    year: state.year,
    results,
    classes: CLASSES,
    score,
    prev,
    upto,
    lastRound,
    meta: playerMeta(picks.players ?? []),
    standings,
    standingsPos,
    standingsPts,
    riderSuggestions: state.riderSuggestions ?? results.riders,
    riderKey: (cls, name) => resolveRider(index, cls, name),
  };
}

/** Laddar alla säsonger för Historik-sidan (en gång). */
async function loadHistory() {
  if (state.history || state.historyLoading) return;
  state.historyLoading = true;
  state.history = await Promise.all(
    state.seasonList.map(async (year) => {
      const [results, picks] = await Promise.all([loadResults(year), loadSavedPicks(year)]);
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

  document.getElementById("nav").innerHTML = Object.keys(VIEWS)
    .map((v) => `<a href="#/${v === "leaderboard" ? "" : v}" ${v === view ? 'aria-current="page"' : ""}>${t("nav." + v)}</a>`)
    .join("");

  const roundSelect = done.length
    ? `<label class="round-pick">${t("afterRound")}
        <select data-action="upto">${done
          .map((r) => `<option value="${r.round}" ${r.round === state.upto ? "selected" : ""}>R${r.round} · ${esc(roundTitle(r))}</option>`)
          .join("")}</select>
        <span class="muted">${t("of")} ${total}</span>
      </label>`
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
    ${results.updatedAt ? `<span class="muted small">${t("updated")} ${fmtDate(results.updatedAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>` : ""}
  `;
}

function renderBanners() {
  const parts = [];
  if (state.year !== state.currentSeason)
    parts.push(
      `<div class="banner">${t("archiveBanner", { year: state.year })} <a href="${location.pathname}#/">${t("backToCurrent", {
        year: state.currentSeason,
      })}</a></div>`
    );
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
  const view = currentView();
  if (view === "edit" && !state.editDraft) state.editDraft = normalizePicks(state.picks);
  if (view === "history") loadHistory();
  const body = NEEDS_RESULTS.has(view) && !ctx.lastRound ? seasonNotStarted(ctx) : VIEWS[view](ctx);
  app.innerHTML = renderBanners() + body;
  if (state.dialog) openDialog(state.dialog.cls, state.dialog.key);
}

function openDialog(cls, key) {
  state.dialog = { cls, key };
  dialog.innerHTML = renderRiderDialog(ctx, cls, key);
  if (!dialog.open) dialog.showModal();
}

function setPath(obj, path, value) {
  const parts = path.split(".");
  let o = obj;
  for (let i = 0; i < parts.length - 1; i++) o = o[/^\d+$/.test(parts[i]) ? Number(parts[i]) : parts[i]];
  const last = parts.at(-1);
  o[/^\d+$/.test(last) ? Number(last) : last] = value;
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

// ---- Händelser ----
document.addEventListener("click", async (e) => {
  const el = e.target.closest("[data-action]");
  if (!el) {
    if (e.target === dialog) closeDialog();
    return;
  }
  const a = el.dataset.action;
  if (a === "set") {
    state[el.dataset.key] = el.dataset.value;
    setPref(el.dataset.key, el.dataset.value);
    render();
  } else if (a === "lang") {
    setLang(el.dataset.lang);
    render();
  } else if (a === "select-player") {
    state.player = el.dataset.id;
    setPref("player", state.player);
    render();
    if (window.matchMedia("(max-width: 860px)").matches) document.querySelector(".player-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
  } else if (a === "rider") {
    openDialog(el.dataset.cls, el.dataset.key);
  } else if (a === "close-dialog") {
    closeDialog();
  } else if (a === "add-player") {
    const d = state.editDraft;
    const name = `${t("newPlayer")} ${d.players.length + 1}`;
    d.players.push({ id: uniqueId(name, d.players), name, picks: Object.fromEntries(CLASSES.map((c) => [c, emptyClassPick()])) });
    render();
  } else if (a === "remove-player") {
    const d = state.editDraft;
    const p = d.players[Number(el.dataset.index)];
    if (p && confirm(t("confirmRemove", { name: p.name }))) {
      d.players.splice(Number(el.dataset.index), 1);
      render();
    }
  } else if (a === "apply-picks") {
    const cleaned = cleanPicks(state.editDraft);
    state.picks = cleaned;
    state.isDraft = true;
    saveDraft(state.year, cleaned);
    render();
    setStatus(t("applied"));
  } else if (a === "download-picks") {
    downloadJson(`picks-${state.year}.json`, cleanPicks(state.editDraft ?? normalizePicks(state.picks)));
  } else if (a === "reset-picks") {
    clearDraft(state.year);
    state.picks = await loadSavedPicks(state.year);
    state.isDraft = false;
    state.editDraft = null;
    render();
  }
});

document.addEventListener("change", (e) => {
  const el = e.target;
  if (el.dataset.action === "upto") {
    state.upto = Number(el.value);
    render();
    return;
  }
  if (el.dataset.action === "toggle-backup") {
    const c = state.editDraft.players[Number(el.dataset.index)].picks[el.dataset.cls];
    c.backupActivated = el.checked
      ? { round: Math.min((ctx.lastRound || 0) + 1, state.results.rounds.length || 1), replaces: c.top5.find(Boolean) ?? "" }
      : null;
    render();
    return;
  }
  if (el.dataset.path && state.editDraft) {
    setPath(state.editDraft, el.dataset.path, el.dataset.type === "number" ? Number(el.value) : el.value);
    render(); // uppdatera varningar, ersätter-listor m.m.
  }
});

document.addEventListener("input", (e) => {
  const el = e.target;
  if (el.dataset.path && state.editDraft && el.tagName === "INPUT" && el.type !== "checkbox") {
    setPath(state.editDraft, el.dataset.path, el.dataset.type === "number" ? Number(el.value) : el.value);
  }
});

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
async function init() {
  setLang(getLang());
  try {
    const seasons = await loadSeasonList();
    state.currentSeason = seasons.current;
    state.seasonList = [...new Set([seasons.current, ...(seasons.seasons ?? [])])].sort((a, b) => b - a);
    const asked = Number(new URLSearchParams(location.search).get("season"));
    state.year = state.seasonList.includes(asked) ? asked : seasons.current;
    const [results, picksRes] = await Promise.all([loadResults(state.year), loadPicks(state.year)]);
    state.results = results;
    // En ny säsong har inga förare i resultaten förrän första racet: föreslå förra årets förare.
    const prevYear = state.seasonList.find((y) => y < state.year);
    if (prevYear && !Object.values(results.riders ?? {}).some((c) => Object.keys(c).length)) {
      const prev = await loadResults(prevYear);
      state.riderSuggestions = prev.riders;
      setRiderInfo(prev.riders);
    } else {
      setRiderInfo(results.riders);
    }
    state.picks = picksRes.picks;
    state.isDraft = picksRes.isDraft;
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
