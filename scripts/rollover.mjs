// Säsongsbyte: när ett nytt år har börjat flyttas förra säsongen till historiken och en ny
// säsong skapas med samma spelare men tomma tips. Körs automatiskt av GitHub-arbetsflödet
// (även 1 januari), men gör ingenting om säsongen redan är bytt.
//
//   node scripts/rollover.mjs                 -> byt säsong om kalenderåret är nyare än "current"
//   node scripts/rollover.mjs --date 2027-01-01  -> testa som om det vore ett visst datum
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "data");
const CLASSES = ["MotoGP", "Moto2", "Moto3"];

const args = process.argv.slice(2);
const dateArg = args.includes("--date") ? args[args.indexOf("--date") + 1] : null;
const today = dateArg ? new Date(dateArg + "T12:00:00Z") : new Date();
const year = today.getUTCFullYear();

const seasonsFile = join(DATA, "seasons.json");
const seasons = JSON.parse(await readFile(seasonsFile, "utf8"));

if (year <= seasons.current) {
  console.log(`Ingen säsongsväxling (aktuell säsong ${seasons.current}, år ${year}).`);
  process.exit(0);
}

const previous = seasons.current;
const picksFile = join(DATA, `picks-${year}.json`);
// Säsonger från och med "databaseFrom" har sina tips i databasen – då behövs ingen fil.
const inDatabase = seasons.databaseFrom != null && year >= seasons.databaseFrom;
if (inDatabase) {
  console.log(`Säsong ${year} lämnar tips via databasen (skapa tipsperioden på adminsidan).`);
} else if (!existsSync(picksFile)) {
  const prevFile = join(DATA, `picks-${previous}.json`);
  const prev = existsSync(prevFile) ? JSON.parse(await readFile(prevFile, "utf8")) : { players: [] };
  const empty = () => ({ top5: ["", "", "", "", ""], backup: null, bowling: null, backupActivated: null });
  const fresh = {
    season: year,
    scoring: prev.scoring ?? { exactPosition: 2, insideTop5: 1 },
    players: (prev.players ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      ...(p.short ? { short: p.short } : {}),
      ...(p.color ? { color: p.color } : {}),
      picks: Object.fromEntries(CLASSES.map((c) => [c, empty()])),
    })),
  };
  await writeFile(picksFile, JSON.stringify(fresh, null, 1) + "\n", "utf8");
  console.log(`Skapade ${picksFile} med ${fresh.players.length} spelare och tomma tips.`);
}

seasons.seasons = [...new Set([...(seasons.seasons ?? []), previous, year])].sort((a, b) => b - a);
seasons.current = year;
await writeFile(seasonsFile, JSON.stringify(seasons, null, 1) + "\n", "utf8");
console.log(`Ny säsong: ${year}. ${previous} finns nu under Historik.`);
