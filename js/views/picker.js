// Tipsväljaren på "Mina tips": steg för steg (Moto3 → Moto2 → MotoGP → Översikt).
// Platser till vänster, förare från den officiella startlistan till höger. Dra och släpp,
// eller klicka på ett förarkort. Bara förare på startlistan för klassen kan väljas.
import { t, fmtDate } from "../i18n.js";
import { normalizeName } from "../scoring.js";
import { esc, flag, numberBadge } from "../ui.js";
import { entryRiders } from "../entrylist.js";

export const ORDER = ["Moto3", "Moto2", "MotoGP"];
const SLOTS = ["t0", "t1", "t2", "t3", "t4", "bu", "dnf"];
const EXCL = ["t0", "t1", "t2", "t3", "t4", "bu"]; // en förare får bara finnas på en av dessa
const DATE_TIME = { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" };

const emptySlots = () => Object.fromEntries(SLOTS.map((s) => [s, null]));
const slotLabel = (s) => (s === "bu" ? "BU" : s === "dnf" ? "DNF" : String(Number(s.slice(1)) + 1));

/** Sparade tips (namn) → platser (förar-id). Förare som inte finns på startlistan tas bort. */
export function slotsFromPicks(picks, results) {
  const slots = {};
  const dropped = [];
  for (const cls of ORDER) {
    const byName = new Map(entryRiders(results, cls).map((r) => [normalizeName(r.name), r.id]));
    const c = picks?.[cls];
    const s = emptySlots();
    const put = (slot, name) => {
      if (!name) return;
      const id = byName.get(normalizeName(name));
      if (id) s[slot] = id;
      else dropped.push({ cls, name });
    };
    (c?.top5 ?? []).forEach((n, i) => put(`t${i}`, n));
    put("bu", c?.backup);
    put("dnf", c?.bowling);
    slots[cls] = s;
  }
  return { slots, dropped };
}

/** Platser → tips i databasens format (namn). */
export function picksFromSlots(slots, results) {
  const name = (cls, id) => results.riders?.[cls]?.[id]?.name ?? "";
  return Object.fromEntries(
    ORDER.map((cls) => {
      const s = slots[cls];
      return [cls, { top5: ["t0", "t1", "t2", "t3", "t4"].map((k) => name(cls, s[k])), backup: name(cls, s.bu), bowling: name(cls, s.dnf), backupActivated: null }];
    })
  );
}

export function newPickerState(entry, results) {
  const { slots, dropped } = slotsFromPicks(entry.picks, results);
  return { step: entry.picks ? 3 : 0, slots, dropped, selected: null, sort: "prev", q: "", confirm: false, done: false };
}

const complete = (pk, cls) => SLOTS.every((s) => pk.slots[cls][s]);
const missing = (pk, cls) => SLOTS.filter((s) => !pk.slots[cls][s]).length;

// ---- Placering (samma logik som i demon) ----
function place(pk, cls, id, to, from = null) {
  const p = pk.slots[cls];
  const target = p[to];
  if (from) {
    p[from] = target;
    p[to] = id;
  } else {
    const at = EXCL.find((s) => p[s] === id);
    if (to !== "dnf" && at && at !== to) p[at] = target;
    p[to] = id;
  }
  // En förare kan inte vara både i topp 5 och backup: behåll platsen man just ändrade.
  const keep = new Set([to, from].filter(Boolean));
  const seen = new Map();
  for (const s of EXCL) {
    const v = p[s];
    if (!v) continue;
    if (!seen.has(v)) {
      seen.set(v, s);
      continue;
    }
    const other = seen.get(v);
    if (keep.has(s) && !keep.has(other)) {
      p[other] = null;
      seen.set(v, s);
    } else p[s] = null;
  }
  pk.selected = null;
}
function autoSlot(pk, cls, id) {
  const p = pk.slots[cls];
  if (pk.selected) return pk.selected;
  if (EXCL.some((s) => p[s] === id)) return p.dnf ? null : "dnf";
  return SLOTS.find((s) => !p[s]) ?? null;
}

// ---- Rendering ----
function riderCardBits(r) {
  return {
    plate: numberBadge(r, "md"),
    flag: flag(r.country),
  };
}

function prevText(r, cls, prevYear) {
  if (!r.prev) return `<span class="pk-pv">${prevYear}: –</span>`;
  const other = r.prev.cls !== cls ? ` · ${esc(r.prev.cls)}` : "";
  return `<span class="pk-pv">${prevYear}: <b>P${r.prev.pos}</b>${other}</span>`;
}

function stepsBar(pk) {
  const labels = [...ORDER, t("pkReview")];
  return `<nav class="pk-steps" aria-label="${esc(t("pkSteps"))}">${labels
    .map((l, i) => {
      const reachable = i === 0 || ORDER.slice(0, i).every((c) => complete(pk, c));
      const done = i < 3 ? complete(pk, ORDER[i]) : false;
      return `<button type="button" class="pk-step ${done ? "done" : ""}" data-pk-go="${i}" ${i === pk.step ? 'aria-current="step"' : ""} ${reachable ? "" : "disabled"}>
        <small>${t("pkStep", { n: i + 1 })}</small><span>${esc(l)}</span></button>`;
    })
    .join("")}</nav>`;
}

function whoHtml(r) {
  const b = riderCardBits(r);
  return `<span class="pk-who">${numberBadge(r, "sm")}${b.flag}<span class="pk-who-text"><span class="pk-nm">${esc(r.name)}</span><span class="pk-tm">${esc(r.team ?? "")}</span></span></span>`;
}

function classStep(pk, cls, results, year) {
  const p = pk.slots[cls];
  const riders = entryRiders(results, cls);
  const byId = new Map(riders.map((r) => [r.id, r]));
  const slotHtml = (s) => {
    const r = p[s] ? byId.get(p[s]) : null;
    const classes = ["pk-slot", s === "bu" ? "bu" : s === "dnf" ? "dnf" : "", r ? "filled" : "", pk.selected === s ? "selected" : ""].join(" ");
    const body = r
      ? `${whoHtml(r)}<button type="button" class="pk-clear" data-pk-clear="${s}" aria-label="${esc(t("pkRemove", { name: r.name }))}">✕</button>`
      : `<span class="pk-empty">${s === "dnf" ? t("pkDnfEmpty") : s === "bu" ? t("pkBuEmpty") : t("pkDragHere")}</span><span></span>`;
    return `<div class="${classes}" data-pk-slot="${s}" tabindex="0" role="button" aria-label="${esc(t("slot"))} ${slotLabel(s)}" ${
      r ? `draggable="true" data-pk-id="${esc(r.id)}"` : ""
    }><span class="pk-lbl">${slotLabel(s)}</span>${body}</div>`;
  };

  const used = new Map();
  for (const s of SLOTS) if (p[s]) used.set(p[s], [...(used.get(p[s]) ?? []), s]);
  const q = pk.q.trim().toLowerCase();
  const order = { MotoGP: 0, Moto2: 1, Moto3: 2 };
  const rank = (r) => {
    if (!r.prev) return 9000;
    const theirs = order[r.prev.cls] ?? 3;
    return (theirs === order[cls] ? 0 : theirs > order[cls] ? 1000 : 2000) + r.prev.pos;
  };
  const list = riders
    .filter((r) => !q || r.name.toLowerCase().includes(q) || (r.team ?? "").toLowerCase().includes(q))
    .sort((a, b) => (pk.sort === "number" ? (a.number ?? 999) - (b.number ?? 999) : rank(a) - rank(b) || a.name.localeCompare(b.name)));

  const cards = list
    .map((r) => {
      const at = used.get(r.id) ?? [];
      const excl = at.find((s) => s !== "dnf");
      const tags = [
        excl ? `<span class="pk-tag ${excl === "bu" ? "bu" : ""}">${excl === "bu" ? "BU" : t("pkSlotTag", { n: slotLabel(excl) })}</span>` : "",
        at.includes("dnf") ? `<span class="pk-tag dnf" style="${excl ? "top:26px" : ""}">DNF</span>` : "",
      ].join("");
      const b = riderCardBits(r);
      return `<button type="button" class="pk-card ${excl ? "used" : ""}" draggable="true" data-pk-id="${esc(r.id)}" style="--team:${esc(r.teamColor ?? "")}" aria-label="${esc(r.name)}, ${esc(r.team ?? "")}">
        ${b.plate}<span class="pk-info"><span class="pk-nm">${b.flag}<span>${esc(r.name)}</span></span><span class="pk-tm">${esc(r.team ?? "")}</span>${prevText(r, cls, year - 1)}</span>${tags}</button>`;
    })
    .join("");

  const left = missing(pk, cls);
  const next = pk.step < 2 ? `${t("pkNext")}: ${ORDER[pk.step + 1]} →` : `${t("pkNext")}: ${t("pkReview")} →`;
  return `<div class="pk-board">
    <div class="card pk-slots">
      <h2>${cls} <small>${t("pkStepOf", { n: pk.step + 1 })}</small></h2>
      <div class="pk-group">${t("pkTop5")}</div>
      ${["t0", "t1", "t2", "t3", "t4"].map(slotHtml).join("")}
      <div class="pk-group">${t("pkBuDnf")}</div>
      ${slotHtml("bu")}${slotHtml("dnf")}
      <div class="pk-status ${left ? "need" : "ok"}">${left ? t(left === 1 ? "pkLeftOne" : "pkLeft", { n: left }) : t("pkClassDone")}</div>
      <div class="pk-nav">
        ${pk.step > 0 ? `<button type="button" class="btn" data-pk-go="${pk.step - 1}">← ${ORDER[pk.step - 1]}</button>` : ""}
        <span class="spacer"></span>
        <button type="button" class="btn primary" data-pk-go="${pk.step + 1}" ${left ? "disabled" : ""}>${next}</button>
      </div>
    </div>
    <div class="card">
      <div class="pk-pool-head">
        <h3>${t("pkRidersIn", { cls, year })}</h3>
        <input type="search" id="pk-q" placeholder="${esc(t("pkSearch"))}" value="${esc(pk.q)}" aria-label="${esc(t("pkSearch"))}">
        <select id="pk-sort" aria-label="${esc(t("pkSortLabel"))}">
          <option value="prev" ${pk.sort === "prev" ? "selected" : ""}>${t("pkSortPrev", { year: year - 1 })}</option>
          <option value="number" ${pk.sort === "number" ? "selected" : ""}>${t("pkSortNumber")}</option>
        </select>
      </div>
      <div class="pk-cards">${cards || `<p class="muted">${t("pkNoMatch")}</p>`}</div>
      <p class="pk-hint">${t("pkHint")}</p>
    </div>
  </div>`;
}

function reviewStep(pk, results, name, opts) {
  const block = (cls) => {
    const byId = new Map(entryRiders(results, cls).map((r) => [r.id, r]));
    const rows = SLOTS.map((s) => {
      const r = byId.get(pk.slots[cls][s]);
      return `<div class="pk-row"><span class="pk-lbl ${s === "bu" ? "bu" : s === "dnf" ? "dnf" : ""}">${slotLabel(s)}</span>${
        r ? whoHtml(r) : `<span class="warn small">${t("pkMissing")}</span>`
      }</div>`;
    }).join("");
    return `<div class="card"><h3 class="pk-review-head">${cls}<button type="button" class="link" data-pk-go="${ORDER.indexOf(cls)}">${t("pkChange")}</button></h3><div class="pk-rows">${rows}</div></div>`;
  };
  const ready = ORDER.every((c) => complete(pk, c)) && name.trim();
  return `<div class="pk-review-wrap">
    <div class="card"><label class="name-field" for="pk-name">${t("pkName")}
      <input id="pk-name" maxlength="40" value="${esc(name)}" autocomplete="nickname"></label></div>
    <div class="pk-review">${[...ORDER].reverse().map(block).join("")}</div>
    <div class="card pk-submit">
      <button type="button" class="btn" data-pk-go="2">← MotoGP</button>
      <span class="spacer"></span>
      <span class="muted small">${t("pkCheck")}</span>
      <button type="button" class="btn primary" data-pk-submit ${ready && !opts.busy ? "" : "disabled"}>${t(opts.hasSaved ? "pkResubmit" : "pkSubmit")}</button>
    </div>
    ${opts.msg ?? ""}
  </div>`;
}

/** Hela tipsväljaren för en öppen tipsperiod. */
export function renderPicker({ pk, results, year, name, entry, busy, msg, closesAt }) {
  const intro = entry.picks
    ? t("predictSaved", { date: fmtDate(entry.updatedAt, DATE_TIME) })
    : t("pkIntro");
  const dropped = pk.dropped?.length
    ? `<div class="banner warn">${t("pkDropped")} ${pk.dropped.map((d) => `<b>${esc(d.name)}</b> (${d.cls})`).join(", ")}</div>`
    : "";
  const deadline = closesAt ? t("pkDeadline", { date: fmtDate(closesAt, DATE_TIME) }) : t("pkNoDeadline");
  const body = pk.step < 3 ? classStep(pk, ORDER[pk.step], results, year) : reviewStep(pk, results, name, { busy, msg, hasSaved: Boolean(entry.picks) });
  const modal = pk.confirm
    ? `<div class="pk-modal-back" data-pk-cancel><div class="pk-modal" role="dialog" aria-modal="true" aria-labelledby="pk-mt">
        <h2 id="pk-mt">${t("pkSureTitle")}</h2>
        <p>${t("pkSureText", { name: esc(name.trim()) })}</p>
        <p class="muted">${closesAt ? t("pkSureDeadline", { date: fmtDate(closesAt, DATE_TIME) }) : ""}</p>
        <div class="pk-nav"><span class="spacer"></span><button type="button" class="btn" data-pk-cancel>${t("cancel")}</button><button type="button" class="btn primary" data-pk-confirm>${t("pkSureYes")}</button></div>
      </div></div>`
    : "";
  return `<section class="card pk-intro"><h2>${entry.name ? t("predictHello", { name: esc(entry.name) }) : t("predictHelloNoName")}</h2>
      <span class="muted">${deadline} ${intro}</span></section>
    ${dropped}
    ${stepsBar(pk)}
    ${body}
    ${modal}`;
}

/**
 * Kopplar tipsväljarens händelser (en gång). get() ger { pk, results } för aktuell spelare,
 * render() ritar om sidan och submit() sparar tipsen.
 */
export function initPicker({ get, render, submit, setName }) {
  const ctxNow = () => {
    const c = get();
    return c?.pk && c.results ? c : null;
  };
  document.addEventListener("click", (e) => {
    const c = ctxNow();
    if (!c) return;
    const { pk } = c;
    const tEl = e.target;
    const go = tEl.closest("[data-pk-go]");
    if (go && !go.disabled) {
      pk.step = Number(go.dataset.pkGo);
      pk.selected = null;
      pk.q = "";
      render();
      document.querySelector(".pk-steps")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (tEl.closest("[data-pk-submit]")) {
      pk.confirm = true;
      render();
      document.querySelector("[data-pk-confirm]")?.focus();
      return;
    }
    if (tEl.closest("[data-pk-confirm]")) {
      pk.confirm = false;
      submit();
      return;
    }
    if (tEl.closest("[data-pk-cancel]") && (tEl.matches("[data-pk-cancel]") || tEl.closest("button"))) {
      pk.confirm = false;
      render();
      return;
    }
    if (pk.step > 2) return;
    const cls = ORDER[pk.step];
    const clear = tEl.closest("[data-pk-clear]");
    if (clear) {
      pk.slots[cls][clear.dataset.pkClear] = null;
      pk.selected = null;
      render();
      return;
    }
    const slot = tEl.closest("[data-pk-slot]");
    if (slot) {
      pk.selected = pk.selected === slot.dataset.pkSlot ? null : slot.dataset.pkSlot;
      render();
      return;
    }
    const card = tEl.closest(".pk-card");
    if (card) {
      const to = autoSlot(pk, cls, card.dataset.pkId);
      if (to) place(pk, cls, card.dataset.pkId, to);
      render();
    }
  });
  document.addEventListener("keydown", (e) => {
    const c = ctxNow();
    if (!c) return;
    if (e.key === "Escape" && c.pk.confirm) {
      c.pk.confirm = false;
      render();
    }
    if ((e.key === "Enter" || e.key === " ") && e.target.matches?.("[data-pk-slot]")) {
      e.preventDefault();
      e.target.click();
    }
  });
  document.addEventListener("input", (e) => {
    const c = ctxNow();
    if (!c) return;
    if (e.target.id === "pk-q") {
      c.pk.q = e.target.value;
      const caret = e.target.selectionStart;
      render();
      const q = document.getElementById("pk-q");
      q?.focus();
      q?.setSelectionRange(caret, caret);
    }
    if (e.target.id === "pk-name") {
      setName(e.target.value);
      const btn = document.querySelector("[data-pk-submit]");
      if (btn) btn.disabled = !(ORDER.every((cl) => complete(c.pk, cl)) && e.target.value.trim());
    }
  });
  document.addEventListener("change", (e) => {
    const c = ctxNow();
    if (c && e.target.id === "pk-sort") {
      c.pk.sort = e.target.value;
      render();
    }
  });

  // Dra och släpp
  let drag = null;
  document.addEventListener("dragstart", (e) => {
    if (!ctxNow()) return;
    const el = e.target.closest?.("[data-pk-id][draggable=true]");
    if (!el) return;
    drag = { id: el.dataset.pkId, from: el.dataset.pkSlot ?? null };
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", drag.id);
    el.classList.add("dragging");
  });
  document.addEventListener("dragend", (e) => {
    e.target.closest?.("[draggable=true]")?.classList.remove("dragging");
    document.querySelectorAll(".pk-slot.over").forEach((s) => s.classList.remove("over"));
    drag = null;
  });
  document.addEventListener("dragover", (e) => {
    const slot = e.target.closest?.("[data-pk-slot]");
    if (!slot || !drag) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    document.querySelectorAll(".pk-slot.over").forEach((s) => s !== slot && s.classList.remove("over"));
    slot.classList.add("over");
  });
  document.addEventListener("dragleave", (e) => {
    const slot = e.target.closest?.("[data-pk-slot]");
    if (slot && !slot.contains(e.relatedTarget)) slot.classList.remove("over");
  });
  document.addEventListener("drop", (e) => {
    const c = ctxNow();
    const slot = e.target.closest?.("[data-pk-slot]");
    if (!c || !slot || !drag) return;
    e.preventDefault();
    const to = slot.dataset.pkSlot;
    if (drag.from !== to) place(c.pk, ORDER[c.pk.step], drag.id, to, drag.from);
    drag = null;
    render();
  });
}
