// Poängmotor – ren logik utan DOM, används både av webbsidan och av scripts/check-scores.mjs.
// Scoring engine – pure logic, shared by the website and the Node check script.
//
// Regler:
//  * Placeringspoäng: för varje race (och sprint i MotoGP) jämförs varje tippad förares
//    målplacering med platsen i tipset: rätt plats = 2 p, annars inom topp 5 = 1 p.
//  * Seriepoäng: summan av VM-poängen (race + sprint) som de tippade förarna tar.
//  * Backup (BU): räknas först från och med aktiveringsrundan. Föraren som ersätts slutar då
//    räknas, de kvarvarande flyttar upp ett steg och backupen går in på plats 5. Kan inte ångras.
//  * Did Not Finish (DNF-förare, fältet "bowling" i picks-filen): antal race/sprintar utan målgång.

export const CLASSES = ["MotoGP", "Moto2", "Moto3"];
export const SESSION_TYPES = { MotoGP: ["RAC", "SPR"], Moto2: ["RAC"], Moto3: ["RAC"] };
export const DNF_STATUSES = new Set(["OUTSTND", "NOTFINISHFIRST"]);

export function normalizeName(name) {
  return String(name ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ı/g, "i")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Smeknamn → namn som API:t använder.
const ALIASES = {
  "pecco bagnaia": "francesco bagnaia",
  "manu gonzalez": "manuel gonzalez",
  "max quiles": "maximo quiles",
  "val perrone": "valentin perrone",
  "guidi pini": "guido pini",
};

/** Bygger uppslag namn → förar-id per klass. */
export function buildRiderIndex(results) {
  const index = {};
  for (const cls of CLASSES) {
    index[cls] = new Map();
    for (const [key, r] of Object.entries(results.riders?.[cls] ?? {})) {
      index[cls].set(normalizeName(r.name), key);
    }
  }
  return index;
}

export function resolveRider(index, cls, name) {
  if (!name) return null;
  const n = normalizeName(name);
  return index[cls]?.get(n) ?? index[cls]?.get(ALIASES[n]) ?? null;
}

/** Laguppställningen (5 namn) som gäller för en viss runda. */
export function lineupForRound(classPick, round) {
  const top5 = [...(classPick?.top5 ?? [])];
  const act = classPick?.backupActivated;
  if (!act || !classPick.backup || round < act.round) return top5;
  const without = top5.filter((n) => normalizeName(n) !== normalizeName(act.replaces));
  if (without.length === top5.length) return top5; // ersatt förare saknas – ändra inget
  return [...without, classPick.backup];
}

/**
 * Rundan en backup börjar räknas från. Antingen angiven direkt ({ round }) eller räknad från
 * när spelaren aktiverade den ({ at }): första runda som startar efter aktiveringsdagen.
 * Aktiveras den mitt under en tävlingshelg gäller den alltså från nästa runda.
 */
export function activationRound(act, results) {
  if (!act) return null;
  if (Number.isFinite(act.round)) return act.round;
  if (!act.at) return null;
  const day = String(act.at).slice(0, 10);
  const next = (results?.rounds ?? []).find((r) => String(r.dateStart).slice(0, 10) > day);
  return next ? next.round : (results?.rounds?.length ?? 0) + 1;
}

/** Kopia av tipsen där alla backup-aktiveringar har ett rundnummer. */
export function resolveActivations(picks, results) {
  const needs = (picks.players ?? []).some((p) =>
    CLASSES.some((c) => p.picks?.[c]?.backupActivated && !Number.isFinite(p.picks[c].backupActivated.round))
  );
  if (!needs) return picks;
  const copy = structuredClone(picks);
  for (const p of copy.players)
    for (const c of CLASSES) {
      const act = p.picks?.[c]?.backupActivated;
      if (act && !Number.isFinite(act.round)) act.round = activationRound(act, results);
    }
  return copy;
}

export function roundsWithResults(results) {
  return results.rounds.filter((r) => Object.keys(r.results ?? {}).length > 0);
}

/**
 * Räknar ut hela säsongen.
 * @param picks    innehållet i data/picks-<år>.json
 * @param results  innehållet i data/results-<år>.json
 * @param opts.uptoRound  räkna bara t.o.m. denna runda (för "tidsresor" och jämförelser)
 */
export function scoreSeason(picks, results, { uptoRound = Infinity } = {}) {
  picks = resolveActivations(picks, results);
  const index = buildRiderIndex(results);
  const exactPts = picks.scoring?.exactPosition ?? 2;
  const top5Pts = picks.scoring?.insideTop5 ?? 1;
  const rounds = roundsWithResults(results).filter((r) => r.round <= uptoRound);
  const warnings = [];
  const warned = new Set();
  const key = (cls, name) => {
    const k = resolveRider(index, cls, name);
    if (!k && name && !warned.has(cls + name)) {
      warned.add(cls + name);
      warnings.push({ cls, name });
    }
    return k;
  };

  const players = (picks.players ?? []).map((player) => {
    const out = {
      id: player.id,
      name: player.name,
      totals: { placement: 0, series: 0 },
      byClass: {},
      perRound: [],
    };

    for (const cls of CLASSES) {
      const pick = player.picks?.[cls];
      const c = {
        placement: 0,
        series: 0,
        riders: {}, // per förare: poäng som räknats för spelaren
        lineupNow: [],
        original: pick?.top5 ?? [],
        backup: pick?.backup ?? null,
        backupActivated: pick?.backupActivated ?? null,
        bowling: pick?.bowling ?? null,
        bowlingKey: key(cls, pick?.bowling),
        bowlingDnf: 0,
      };
      for (const n of [...(pick?.top5 ?? []), pick?.backup]) if (n) key(cls, n);
      out.byClass[cls] = c;
    }

    for (const round of rounds) {
      const pr = { round: round.round, placement: 0, series: 0, byClass: {} };
      for (const cls of CLASSES) {
        const pick = player.picks?.[cls];
        const c = out.byClass[cls];
        const lineup = lineupForRound(pick, round.round);
        let rp = 0;
        let rs = 0;
        for (const type of SESSION_TYPES[cls]) {
          const session = round.results?.[cls]?.[type];
          if (!session) continue;
          const byKey = new Map(session.map((e) => [e.rider, e]));
          lineup.forEach((name, i) => {
            if (!name) return;
            const k = key(cls, name);
            const entry = k ? byKey.get(k) : null;
            const slot = (c.riders[name] ??= { name, key: k, placement: 0, series: 0, exact: 0, top5: 0 });
            if (!entry) return;
            let p = 0;
            if (entry.pos === i + 1) {
              p = exactPts;
              slot.exact++;
            } else if (entry.pos != null && entry.pos <= 5) {
              p = top5Pts;
              slot.top5++;
            }
            slot.placement += p;
            slot.series += entry.pts ?? 0;
            rp += p;
            rs += entry.pts ?? 0;
          });
          if (c.bowlingKey) {
            const bk = byKey.get(c.bowlingKey);
            if (bk && DNF_STATUSES.has(bk.status)) c.bowlingDnf++;
          }
        }
        c.placement += rp;
        c.series += rs;
        pr.byClass[cls] = { placement: rp, series: rs };
        pr.placement += rp;
        pr.series += rs;
      }
      out.totals.placement += pr.placement;
      out.totals.series += pr.series;
      out.perRound.push(pr);
    }

    const last = rounds.at(-1)?.round ?? 0;
    for (const cls of CLASSES) {
      out.byClass[cls].lineupNow = lineupForRound(player.picks?.[cls], last + 1);
    }
    return out;
  });

  return { players, rounds, warnings };
}

/** Sorterar spelare och sätter placering (delad placering vid lika poäng). */
export function rankPlayers(players, metric = "placement", cls = null) {
  const val = (p) => (cls ? p.byClass[cls][metric] : p.totals[metric]);
  const sorted = [...players].sort((a, b) => val(b) - val(a) || a.name.localeCompare(b.name));
  let rank = 0;
  let prev = null;
  sorted.forEach((p, i) => {
    if (val(p) !== prev) rank = i + 1;
    prev = val(p);
    p._rank = rank;
  });
  return sorted.map((p) => ({ player: p, rank: p._rank, value: val(p) }));
}

/**
 * Mästerskapsställning räknad från resultaten (så att den går att visa "efter runda N").
 * Lika poäng avgörs på flest segrar, sedan andraplatser osv. i race.
 */
export function computeStandings(results, cls, { uptoRound = Infinity } = {}) {
  const map = new Map();
  for (const round of roundsWithResults(results)) {
    if (round.round > uptoRound) continue;
    for (const type of SESSION_TYPES[cls]) {
      for (const e of round.results?.[cls]?.[type] ?? []) {
        const s = map.get(e.rider) ?? { rider: e.rider, pts: 0, places: new Array(30).fill(0) };
        s.pts += e.pts ?? 0;
        if (type === "RAC" && e.pos >= 1 && e.pos <= 30) s.places[e.pos - 1]++;
        map.set(e.rider, s);
      }
    }
  }
  const list = [...map.values()].sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    for (let i = 0; i < 30; i++) if (b.places[i] !== a.places[i]) return b.places[i] - a.places[i];
    return 0;
  });
  list.forEach((s, i) => (s.pos = i + 1));
  return list;
}

/** Statistik per förare: placeringsfördelning, poäng och resultat per runda. */
export function riderStats(results, cls, riderKey, { uptoRound = Infinity } = {}) {
  const stats = {
    points: 0,
    counts: { RAC: [0, 0, 0, 0, 0], SPR: [0, 0, 0, 0, 0] },
    dnf: 0,
    perRound: {},
  };
  for (const round of roundsWithResults(results)) {
    if (round.round > uptoRound) continue;
    for (const type of SESSION_TYPES[cls]) {
      const session = round.results?.[cls]?.[type];
      if (!session) continue;
      const e = session.find((x) => x.rider === riderKey);
      (stats.perRound[round.round] ??= {})[type] = e ?? null;
      if (!e) continue;
      stats.points += e.pts ?? 0;
      if (e.pos >= 1 && e.pos <= 5) stats.counts[type][e.pos - 1]++;
      if (DNF_STATUSES.has(e.status)) stats.dnf++;
    }
  }
  return stats;
}
