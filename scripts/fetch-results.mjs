// Hämtar resultat från MotoGP:s publika resultat-API och sparar dem i data/results-<år>.json.
// Fetches results from the public MotoGP results API and writes data/results-<year>.json.
//
//   node scripts/fetch-results.mjs            -> aktuell säsong, återanvänder gamla avslutade rundor
//   node scripts/fetch-results.mjs --full     -> hämtar allt på nytt
//   node scripts/fetch-results.mjs --year 2025
//
// API:t är inofficiellt (det som motogp.com själv använder) och kan ändras utan förvarning.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const API_ROOT = "https://api.motogp.pulselive.com/motogp/v1";
const API = `${API_ROOT}/results`;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CLASSES = ["MotoGP", "Moto2", "Moto3"];
// Avslutade rundor äldre än så här hämtas inte om (om de redan finns i filen).
const REFRESH_DAYS = 10;

const args = process.argv.slice(2);
const FULL = args.includes("--full");
const yearArg = args.includes("--year") ? Number(args[args.indexOf("--year") + 1]) : null;

async function get(path, tries = 4) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(path.startsWith("http") ? path : API + path, { headers: { accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (i >= tries) throw new Error(`${path}: ${err.message}`);
      await new Promise((r) => setTimeout(r, 800 * i));
    }
  }
}

// Kör asynkrona jobb med begränsad samtidighet så att vi inte belastar API:t.
async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    })
  );
  return out;
}

const className = (raw) => {
  const clean = String(raw).replace(/[^A-Za-z0-9]/g, "");
  return CLASSES.find((c) => c.toLowerCase() === clean.toLowerCase()) ?? clean;
};
const riderKey = (r) => r.riders_api_uuid || r.riders_id || r.id;

// Officiell poängskala.
const POINTS = {
  RAC: [25, 20, 16, 13, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1],
  SPR: [12, 9, 7, 6, 5, 4, 3, 2, 1],
};

// Ibland saknar API:t poäng för ett lopp (alla har 0 trots placeringar). Då räknar vi poängen
// från placeringen. Halvpoäng (avkortade lopp) upptäcks genom att jämföra med den officiella
// mästerskapsställningen och välja den kombination (hel/halv) som stämmer bäst.
function repairMissingPoints(rounds, standings) {
  const derived = [];
  for (const round of rounds) {
    round.pointsFromTable = round.pointsFromTable ?? [];
    for (const [cls, sessions] of Object.entries(round.results)) {
      for (const [type, list] of Object.entries(sessions)) {
        const id = `${cls}/${type}`;
        const sum = list.reduce((a, e) => a + (e.pts || 0), 0);
        if ((sum === 0 && list.some((e) => e.pos)) || round.pointsFromTable.includes(id)) {
          if (!round.pointsFromTable.includes(id)) round.pointsFromTable.push(id);
          derived.push({ round, cls, type, list });
        }
      }
    }
    if (!round.pointsFromTable.length) delete round.pointsFromTable;
  }
  const apply = (d, factor) => {
    for (const e of d.list) e.pts = e.pos ? (POINTS[d.type][e.pos - 1] ?? 0) * factor : 0;
    d.round.halfPoints = (d.round.halfPoints ?? []).filter((x) => x !== `${d.cls}/${d.type}`);
    if (factor !== 1) d.round.halfPoints.push(`${d.cls}/${d.type}`);
    if (!d.round.halfPoints.length) delete d.round.halfPoints;
  };

  for (const cls of CLASSES) {
    const mine = derived.filter((d) => d.cls === cls);
    if (!mine.length) continue;
    const official = standings[cls];
    let best = { err: Infinity, mask: 0 };
    const combos = official?.length && mine.length <= 8 ? 1 << mine.length : 1;
    for (let mask = 0; mask < combos; mask++) {
      mine.forEach((d, i) => apply(d, mask & (1 << i) ? 0.5 : 1));
      if (combos === 1) break;
      const totals = {};
      for (const round of rounds)
        for (const list of Object.values(round.results[cls] ?? {}))
          for (const e of list) totals[e.rider] = (totals[e.rider] ?? 0) + (e.pts || 0);
      const err = official.reduce((a, s) => a + Math.abs((totals[s.rider] ?? 0) - s.pts), 0);
      if (err < best.err) best = { err, mask };
    }
    mine.forEach((d, i) => apply(d, best.mask & (1 << i) ? 0.5 : 1));
    for (const d of mine)
      console.log(
        `  Poäng saknades i API:t: runda ${d.round.round} ${d.cls} ${d.type} – räknat från placering` +
          (best.mask & (1 << mine.indexOf(d)) ? " (halvpoäng)" : "")
      );
    if (Number.isFinite(best.err) && best.err > 0)
      console.log(`  Obs: ${cls} skiljer sig ${best.err} p totalt mot officiell ställning.`);
  }
}

// Nummergrafik och teamfärger från förarprofilerna (samma som på motogp.com).
// Hämtas om högst var 14:e dag per förare, annars återanvänds det som redan finns i filen.
const PROFILE_MAX_AGE_DAYS = 14;
// Karriärstatistik (VM-titlar, starter, segrar …) – samma siffror som förarsidorna på motogp.com.
// Ändras efter varje race, så den hämtas om var 3:e dag.
const CAREER_MAX_AGE_DAYS = 3;
function condenseCareer(s) {
  const list = (x) => (Array.isArray(x) ? x : x?.categories ?? []);
  const total = (x) => x?.total ?? list(x).reduce((a, c) => a + (c.count || 0), 0);
  const byClass = (x) =>
    Object.fromEntries(
      list(x)
        .filter((c) => c.count)
        .map((c) => [className(c.category?.name ?? "?"), c.count])
    );
  return {
    titles: total(s.world_championship_wins),
    starts: total(s.all_races),
    wins: total(s.grand_prix_victories),
    podiums: total(s.podiums),
    poles: total(s.poles),
    fastestLaps: total(s.race_fastest_laps),
    sprintWins: total(s.sprint_victories),
    debut: Number(s.first_grand_prix?.[0]?.event?.season) || null,
    titlesByClass: byClass(s.world_championship_wins),
    winsByClass: byClass(s.grand_prix_victories),
    startsByClass: byClass(s.all_races),
    podiumsByClass: byClass(s.podiums),
    polesByClass: byClass(s.poles),
    fastestLapsByClass: byClass(s.race_fastest_laps),
  };
}

async function addCareerStats(riders) {
  const todo = [];
  for (const cls of CLASSES)
    for (const r of Object.values(riders[cls])) {
      if (!r.legacyId) continue;
      const age = r.careerFetched ? (Date.now() - Date.parse(r.careerFetched)) / 86400000 : Infinity;
      if (age > CAREER_MAX_AGE_DAYS) todo.push(r);
    }
  let ok = 0;
  await pool(todo, 4, async (r) => {
    try {
      r.career = condenseCareer(await get(`${API_ROOT}/riders/${r.legacyId}/stats`));
      r.careerFetched = new Date().toISOString().slice(0, 10);
      ok++;
    } catch (err) {
      console.warn(`  Kunde inte hämta karriär för ${r.name}: ${err.message}`);
    }
  });
  if (todo.length) console.log(`  Karriärstatistik: ${ok}/${todo.length} uppdaterade.`);
}

async function addRiderProfiles(riders, year) {
  const todo = [];
  for (const cls of CLASSES)
    for (const [key, r] of Object.entries(riders[cls])) {
      const age = r.profileFetched ? (Date.now() - Date.parse(r.profileFetched)) / 86400000 : Infinity;
      if (age > PROFILE_MAX_AGE_DAYS) todo.push({ cls, key, r });
    }
  let ok = 0;
  await pool(todo, 4, async ({ cls, key, r }) => {
    try {
      const d = await get(`${API_ROOT}/riders/${key}`);
      const career = d.career ?? [];
      const step =
        career.find((s) => s.season === year && className(s.category?.name ?? "") === cls) ??
        career.find((s) => s.current) ??
        career.at(-1);
      const number = step?.number ?? r.number;
      // Nyaste nummergrafiken för förarens nuvarande nummer (finns ofta från en tidigare säsong).
      const art = [...career]
        .filter((s) => s.pictures?.number && s.number === number)
        .sort((a, b) => b.season - a.season)[0]?.pictures?.number;
      r.numberArt = art ?? null;
      r.legacyId = d.legacy_id ?? r.legacyId ?? null;
      r.teamColor = step?.team?.color ?? r.teamColor ?? null;
      r.teamTextColor = step?.team?.text_color ?? r.teamTextColor ?? null;
      if (step?.season === year) {
        r.number = step.number ?? r.number;
        r.team = step.sponsored_team || step.team?.name || r.team;
      }
      r.profileFetched = new Date().toISOString().slice(0, 10);
      ok++;
    } catch (err) {
      console.warn(`  Kunde inte hämta profil för ${r.name}: ${err.message}`);
    }
  });
  if (todo.length) console.log(`  Förarprofiler: ${ok}/${todo.length} uppdaterade.`);
}

// ---- Startlista (officiell "entry list") ----
// Kategori-id:n för /teams skiljer sig från resultat-API:ts. Hämtas från förarlistan, med
// kända värden som reserv.
const TEAM_CATEGORY_IDS = {
  MotoGP: "737ab122-76e1-4081-bedb-334caaa18c70",
  Moto2: "ea854a67-73a4-4a28-ac77-d67b3b2a530a",
  Moto3: "1ab203aa-e292-4842-8bed-971911357af1",
};
async function teamCategoryIds() {
  const ids = { ...TEAM_CATEGORY_IDS };
  try {
    for (const r of await get(`${API_ROOT}/riders`)) {
      const c = r.current_career_step?.category;
      if (c?.id && CLASSES.includes(className(c.name))) ids[className(c.name)] = c.id;
    }
  } catch {}
  return ids;
}

/**
 * Hämtar de ordinarie förarna per klass för säsongen (inte testförare, ersättare eller wildcards).
 * Förarna läggs in i riders-kartan så att namn, nummer, team och färger finns redan före första racet.
 * Returnerar { MotoGP: [förar-id, …], …, published, changed } – "changed" = datum då listan senast ändrades.
 */
async function fetchEntryList(year, riders, previousList) {
  const ids = await teamCategoryIds();
  const list = { published: false };
  for (const cls of CLASSES) {
    let teams = [];
    try {
      teams = await get(`${API_ROOT}/teams?categoryUuid=${ids[cls]}&seasonYear=${year}`);
    } catch (err) {
      console.warn(`  Kunde inte hämta startlistan för ${cls}: ${err.message}`);
      return previousList ?? list; // behåll förra versionen hellre än att tömma listan
    }
    const keys = [];
    for (const t of teams ?? []) {
      for (const r of t.riders ?? []) {
        const step = r.current_career_step ?? {};
        if (step.type && step.type !== "Official") continue;
        const key = r.id;
        const name = `${r.name ?? ""} ${r.surname ?? ""}`.replace(/\s+/g, " ").trim();
        const old = riders[cls][key] ?? {};
        riders[cls][key] = {
          ...old,
          name: old.name ?? name,
          number: step.season === year && step.number != null ? step.number : old.number ?? step.number ?? null,
          country: r.country?.iso ?? old.country ?? "",
          team: (step.season === year && step.sponsored_team) || t.name || old.team || "",
          teamColor: t.color ?? old.teamColor ?? null,
          teamTextColor: t.text_color ?? old.teamTextColor ?? null,
          legacyId: r.legacy_id ?? old.legacyId ?? null,
        };
        if (!keys.includes(key)) keys.push(key);
      }
    }
    list[cls] = keys;
    if (keys.length) list.published = true;
  }
  const same = previousList && CLASSES.every((c) => JSON.stringify(previousList[c] ?? []) === JSON.stringify(list[c]));
  list.changed = same ? previousList.changed : new Date().toISOString().slice(0, 10);
  // Första gången listan sågs publicerad – då öppnar tipsperioden (om den inte ändrats för hand).
  list.firstPublished = previousList?.firstPublished ?? (list.published ? new Date().toISOString() : null);
  console.log(`  Startlista ${year}: ${CLASSES.map((c) => `${c} ${list[c].length}`).join(", ")}${same ? "" : " (ändrad)"}`);
  return list;
}

/**
 * Förarnas placering förra säsongen (och i vilken klass), för förarkorten i tipsväljaren.
 * Hämtas ur förra årets resultatfil, annars ur förarens statistik hos MotoGP. Har föraren
 * inte kört i MotoGP/Moto2/Moto3 förra året lämnas det tomt.
 */
async function addPreviousSeason(year, riders, entryList) {
  const prevYear = year - 1;
  const prevFile = join(ROOT, "data", `results-${prevYear}.json`);
  let fromFile = null;
  if (existsSync(prevFile)) {
    try {
      const prev = JSON.parse(await readFile(prevFile, "utf8"));
      fromFile = new Map();
      for (const cls of CLASSES)
        for (const s of prev.standings?.[cls] ?? []) if (s.pos && !fromFile.has(s.rider)) fromFile.set(s.rider, { cls, pos: s.pos });
    } catch {
      fromFile = null;
    }
  }
  const todo = [];
  for (const cls of CLASSES)
    for (const key of entryList?.[cls] ?? []) {
      const r = riders[cls][key];
      if (!r) continue;
      if (fromFile) {
        r.prev = fromFile.get(key) ?? null;
        r.prevSeason = prevYear;
      } else if (r.prevSeason !== prevYear && r.legacyId) todo.push(r);
    }
  await pool(todo, 4, async (r) => {
    try {
      const stats = await get(`${API_ROOT}/riders/${r.legacyId}/statistics`);
      const rows = (stats ?? []).filter((s) => String(s.season) === String(prevYear) && s.position > 0);
      rows.sort((a, b) => a.position - b.position);
      r.prev = rows[0] ? { cls: className(rows[0].category), pos: rows[0].position } : null;
      r.prevSeason = prevYear;
    } catch (err) {
      console.warn(`  Kunde inte hämta ${prevYear} för ${r.name}: ${err.message}`);
    }
  });
}

async function main() {
  // Vilken säsong som hämtas styrs av data/seasons.json ("current"), inte av API:t – så att
  // sidan byter säsong 1 januari även om API:t ännu inte lagt upp det nya året.
  let wanted = yearArg;
  if (!wanted) {
    try {
      wanted = JSON.parse(await readFile(join(ROOT, "data", "seasons.json"), "utf8")).current;
    } catch {}
  }
  const seasons = await get("/seasons");
  const season = wanted ? seasons.find((s) => s.year === wanted) : seasons.find((s) => s.current);
  const year = season?.year ?? wanted;
  const outFile = join(ROOT, "data", `results-${year}.json`);
  // Finns året inte i resultat-API:t ännu (vanligt i januari) hämtas bara startlistan.
  if (!season) console.log(`Säsong ${year} finns inte i resultat-API:t ännu – hämtar startlistan.`);

  let previous = null;
  if (!FULL && existsSync(outFile)) {
    try {
      previous = JSON.parse(await readFile(outFile, "utf8"));
    } catch {
      previous = null;
    }
  }

  const events = season
    ? (await get(`/events?seasonUuid=${season.id}`)).filter((e) => !e.test).sort((a, b) => a.date_start.localeCompare(b.date_start))
    : [];

  const riders = Object.fromEntries(CLASSES.map((c) => [c, {}]));
  // Behåll förare från tidigare körning (t.ex. skadade förare som inte kört på länge).
  if (previous?.riders) for (const c of CLASSES) Object.assign(riders[c], previous.riders[c] ?? {});

  const now = Date.now();
  let fetchedRounds = 0;

  const rounds = await pool(events, 3, async (ev, idx) => {
    const round = {
      round: idx + 1,
      id: ev.id,
      code: ev.short_name,
      name: ev.name,
      country: ev.country?.name ?? "",
      countryIso: ev.country?.iso ?? "",
      circuit: ev.circuit?.name ?? "",
      dateStart: ev.date_start,
      dateEnd: ev.date_end,
      status: ev.status,
      results: {},
    };
    if (ev.status === "NOT-STARTED") return round;

    const old = previous?.rounds?.find((r) => r.id === ev.id);
    const ageDays = (now - Date.parse(ev.date_end)) / 86400000;
    if (old && ev.status === "FINISHED" && ageDays > REFRESH_DAYS && Object.keys(old.results ?? {}).length) {
      round.results = old.results;
      return round;
    }

    fetchedRounds++;
    const cats = await get(`/categories?eventUuid=${ev.id}`);
    for (const cat of cats) {
      const cls = className(cat.name);
      if (!CLASSES.includes(cls)) continue;
      const sessions = await get(`/sessions?eventUuid=${ev.id}&categoryUuid=${cat.id}`);
      for (const type of ["SPR", "RAC"]) {
        // Avbrutna och omstartade lopp har flera delar (RAC, RAC 2). Slutresultatet finns i
        // den sista delen – och tills den är klar har loppet inget resultat.
        const parts = sessions
          .filter((x) => x.type === type && x.status !== "CANCELLED")
          .sort((a, b) => (a.number ?? 1) - (b.number ?? 1));
        let s = parts.at(-1);
        // Är helgen över men omstarten blev aldrig av gäller den sista avslutade delen.
        if (s && s.status !== "FINISHED" && ev.status === "FINISHED")
          s = parts.filter((x) => x.status === "FINISHED").at(-1);
        if (!s || s.status !== "FINISHED") continue;
        const data = await get(`/session/${s.id}/classification?test=false`);
        const list = data?.classification ?? [];
        if (!list.length) continue;
        round.results[cls] ??= {};
        round.results[cls][type] = list.map((row) => {
          const key = riderKey(row.rider);
          riders[cls][key] = {
            ...riders[cls][key], // behåll nummergrafik/teamfärg från förra körningen
            name: row.rider.full_name,
            number: row.rider.number ?? null,
            country: row.rider.country?.iso ?? "",
            team: row.team?.name ?? "",
          };
          return {
            pos: row.position ?? null,
            rider: key,
            pts: row.points ?? 0,
            status: row.status ?? "",
          };
        });
      }
    }
    return round;
  });

  // Officiell mästerskapsställning (används för att visa tabellen och för kontroll).
  const standings = {};
  const anyEvent = events.find((e) => e.status !== "NOT-STARTED");
  if (anyEvent) {
    const cats = await get(`/categories?eventUuid=${anyEvent.id}`);
    for (const cat of cats) {
      const cls = className(cat.name);
      if (!CLASSES.includes(cls)) continue;
      try {
        const st = await get(`/standings?seasonUuid=${season.id}&categoryUuid=${cat.id}`);
        standings[cls] = (st?.classification ?? []).map((row) => {
          const key = riderKey(row.rider);
          riders[cls][key] ??= {
            name: row.rider.full_name,
            number: row.rider.number ?? null,
            country: row.rider.country?.iso ?? "",
            team: row.team?.name ?? "",
          };
          return { pos: row.position ?? null, rider: key, pts: row.points ?? 0 };
        });
      } catch (err) {
        console.warn(`Kunde inte hämta ställning för ${cls}: ${err.message}`);
      }
    }
  }

  repairMissingPoints(rounds, standings);
  const entryList = await fetchEntryList(year, riders, previous?.entryList);
  await addRiderProfiles(riders, year);
  await addCareerStats(riders);
  await addPreviousSeason(year, riders, entryList);

  const output = {
    season: year,
    updatedAt: new Date().toISOString(),
    source: API,
    classes: CLASSES,
    rounds,
    riders,
    standings,
    entryList,
  };

  await mkdir(dirname(outFile), { recursive: true });
  // Ett år som varken finns i resultat-API:t eller har en publicerad startlista sparas inte.
  if (!season && !entryList.published && !previous) {
    console.log(`Säsong ${year}: varken kalender eller startlista publicerad än.`);
    return;
  }
  const json = JSON.stringify(output, null, 1);
  // Skriv bara om något annat än tidsstämpeln har ändrats (färre onödiga commits).
  if (previous) {
    const strip = (o) => JSON.stringify({ ...o, updatedAt: null });
    if (strip(previous) === strip(output)) {
      console.log(`Inga nya resultat (${year}).`);
      return;
    }
  }
  await writeFile(outFile, json + "\n", "utf8");
  const done = rounds.filter((r) => Object.keys(r.results).length).length;
  console.log(`Sparade ${outFile}: ${done}/${rounds.length} rundor med resultat (${fetchedRounds} hämtade nu).`);
}

main().catch((err) => {
  console.error("Fel:", err.message);
  process.exit(1);
});
