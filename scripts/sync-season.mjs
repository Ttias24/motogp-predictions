// Skickar den automatiska tipsperioden till databasen.
//
//   Öppnar: när MotoGP publicerade startlistan (entryList.firstPublished i results-<år>.json).
//   Stänger: 23:59 svensk tid dagen före årets första tävlingshelg (första rundans startdatum).
//
// Databasen ändrar bara datum som står på "automatiskt" – ett datum som admin ändrat för hand
// lämnas orört. Säsongen skapas i databasen första gången något datum är känt.
// Körs av GitHub-jobbet med hemligheten SUPABASE_SYNC_KEY.
//
//   node scripts/sync-season.mjs            (kräver miljövariabeln SUPABASE_SYNC_KEY)
//   node scripts/sync-season.mjs --dry-run  (visar bara vad som skulle skickas)
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DRY = process.argv.includes("--dry-run");
const SYNC_KEY = process.env.SUPABASE_SYNC_KEY;

/** "YYYY-MM-DD" + "HH:MM" i svensk tid → ISO-tid (UTC), med rätt sommar-/vintertid. */
export function stockholmToIso(date, time) {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const offsetAt = (ms) => {
    const part = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Stockholm", timeZoneName: "shortOffset" })
      .formatToParts(new Date(ms))
      .find((p) => p.type === "timeZoneName").value; // t.ex. "GMT+1"
    const [, sign, h, min] = part.match(/GMT([+-])?(\d+)?(?::(\d+))?/) ?? [];
    return (sign === "-" ? -1 : 1) * ((Number(h) || 0) * 60 + (Number(min) || 0)) * 60000;
  };
  let utc = guess - offsetAt(guess);
  utc = guess - offsetAt(utc); // justera om gissningen hamnade på andra sidan ett tidsbyte
  return new Date(utc).toISOString();
}

/** Automatiska datum för en säsong utifrån resultatfilen. */
export function autoWindow(results) {
  const opens = results?.entryList?.published ? results.entryList.firstPublished ?? null : null;
  const first = (results?.rounds ?? []).map((r) => String(r.dateStart ?? "").slice(0, 10)).filter(Boolean).sort()[0];
  let closes = null;
  if (first) {
    const d = new Date(first + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() - 1);
    closes = stockholmToIso(d.toISOString().slice(0, 10), "23:59");
  }
  return { opens, closes };
}

async function main() {
  const config = await readFile(join(ROOT, "js", "config.js"), "utf8");
  const URL = config.match(/SUPABASE_URL\s*=\s*"([^"]*)"/)?.[1];
  const KEY = config.match(/SUPABASE_ANON_KEY\s*=\s*"([^"]*)"/)?.[1];
  if (!URL || !KEY) return console.log("Ingen databas konfigurerad.");
  if (!SYNC_KEY && !DRY) return console.log("SUPABASE_SYNC_KEY saknas – hoppar över synkningen.");

  const seasons = JSON.parse(await readFile(join(ROOT, "data", "seasons.json"), "utf8"));
  if (seasons.databaseFrom == null) return;
  const years = [seasons.current, seasons.current + 1].filter((y) => y >= seasons.databaseFrom);

  for (const year of years) {
    const file = join(ROOT, "data", `results-${year}.json`);
    if (!existsSync(file)) {
      console.log(`${year}: ingen resultatfil ännu.`);
      continue;
    }
    const { opens, closes } = autoWindow(JSON.parse(await readFile(file, "utf8")));
    if (!opens && !closes) {
      console.log(`${year}: varken startlista eller kalender publicerad – inget att synka.`);
      continue;
    }
    console.log(`${year}: öppnar ${opens ?? "(okänt)"}, stänger ${closes ?? "(okänt)"}`);
    if (DRY) continue;
    const res = await fetch(`${URL}/rest/v1/rpc/sync_season`, {
      method: "POST",
      headers: { apikey: KEY, "content-type": "application/json" },
      body: JSON.stringify({ p_key: SYNC_KEY, p_year: year, p_opens: opens, p_closes: closes }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) console.warn(`${year}: misslyckades (${res.status}) ${body?.message ?? ""}`);
    else console.log(`${year}: i databasen nu – öppnar ${body.opensAt ?? "–"} (${body.opensAuto ? "auto" : "manuellt"}), stänger ${body.closesAt ?? "–"} (${body.closesAuto ? "auto" : "manuellt"})`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
