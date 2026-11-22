// Säkerhetskopia av tipsen i databasen → data/picks-<år>.json.
//
// Sparar bara säsonger vars tipsperiod har stängt (då är tipsen ändå publika). Körs av
// GitHub-jobbet, så att alla säsongers tips finns kvar i Git-historiken även om databasen
// skulle försvinna. Sidan läser filen automatiskt om databasen inte svarar.
//
//   node scripts/backup-picks.mjs
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "data");

const config = await readFile(join(ROOT, "js", "config.js"), "utf8");
const URL = config.match(/SUPABASE_URL\s*=\s*"([^"]*)"/)?.[1];
const KEY = config.match(/SUPABASE_ANON_KEY\s*=\s*"([^"]*)"/)?.[1];
if (!URL || !KEY) {
  console.log("Ingen databas konfigurerad – ingen säkerhetskopia.");
  process.exit(0);
}

const seasons = JSON.parse(await readFile(join(DATA, "seasons.json"), "utf8"));
const from = seasons.databaseFrom;
if (from == null) process.exit(0);
const years = [...new Set([seasons.current, ...(seasons.seasons ?? [])])].filter((y) => y >= from).sort();

let failed = false;
for (const year of years) {
  let ov;
  try {
    const res = await fetch(`${URL}/rest/v1/rpc/season_overview`, {
      method: "POST",
      headers: { apikey: KEY, "content-type": "application/json" },
      body: JSON.stringify({ p_year: year }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    ov = await res.json();
  } catch (err) {
    console.warn(`Kunde inte läsa ${year}: ${err.message}`);
    failed = true;
    continue;
  }
  if (!ov) {
    console.log(`${year}: finns inte i databasen.`);
    continue;
  }
  if (Date.parse(ov.now) < Date.parse(ov.closesAt)) {
    console.log(`${year}: tipsperioden är öppen – sparas när den har stängt.`);
    continue;
  }
  const players = (ov.players ?? []).filter((p) => p.picks).map((p) => ({ id: p.id, name: p.name, picks: p.picks }));
  const backup = {
    season: year,
    scoring: ov.scoring,
    source: "supabase",
    closesAt: ov.closesAt,
    players,
  };
  const file = join(DATA, `picks-${year}.json`);
  const json = JSON.stringify(backup, null, 1) + "\n";
  if (existsSync(file) && (await readFile(file, "utf8")) === json) {
    console.log(`${year}: oförändrad (${players.length} spelare).`);
    continue;
  }
  await writeFile(file, json, "utf8");
  console.log(`${year}: sparade säkerhetskopia med ${players.length} spelare.`);
}
// Ett misslyckat anrop ska inte stoppa resten av jobbet (resultat och publicering).
if (failed) console.log("Obs: minst en säsong kunde inte säkerhetskopieras den här gången.");
