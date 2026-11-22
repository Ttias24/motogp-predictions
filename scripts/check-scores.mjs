// Skriver ut poängen och kontrollerar poängmotorn mot siffrorna från Excel-arket (t.o.m. runda 16).
//   node scripts/check-scores.mjs            -> ställning nu
//   node scripts/check-scores.mjs --excel    -> jämför med Excel (backups räknade hela säsongen, som i arket)
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { scoreSeason, CLASSES } from "../js/scoring.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const seasonsCfg = JSON.parse(await readFile(join(ROOT, "data", "seasons.json"), "utf8"));
const year = process.argv.includes("--excel") ? 2026 : seasonsCfg.current;
const picks = JSON.parse(await readFile(join(ROOT, "data", `picks-${year}.json`), "utf8"));
const results = JSON.parse(await readFile(join(ROOT, "data", `results-${year}.json`), "utf8"));

const EXCEL = {
  uptoRound: 16,
  carry: { placement: [116, 20, 56], series: [1273, 434.5, 906] },
  simon: { placement: [93, 33, 50], series: [1085, 633.5, 906] },
  mattias: { placement: [98, 44, 57], series: [1183, 851, 932] },
};

const excelMode = process.argv.includes("--excel");
let p = picks;
if (excelMode) {
  // I Excel räknades aktiverade backups för hela säsongen.
  p = structuredClone(picks);
  for (const pl of p.players)
    for (const cls of CLASSES) if (pl.picks[cls]?.backupActivated) pl.picks[cls].backupActivated.round = 1;
}

const { players, rounds, warnings } = scoreSeason(p, results, excelMode ? { uptoRound: EXCEL.uptoRound } : {});
if (warnings.length) console.log("Okända förarnamn:", warnings);
console.log(`Rundor räknade: ${rounds.length}${excelMode ? " (Excel-jämförelse)" : ""}\n`);

let fails = 0;
for (const pl of players) {
  const pc = CLASSES.map((c) => pl.byClass[c].placement);
  const sc = CLASSES.map((c) => pl.byClass[c].series);
  const bk = CLASSES.map((c) => `${pl.byClass[c].bowling}: ${pl.byClass[c].bowlingDnf}`).join(", ");
  console.log(`${pl.name.padEnd(8)} placering ${String(pl.totals.placement).padStart(4)} [${pc.join(", ")}]  serie ${String(pl.totals.series).padStart(6)} [${sc.join(", ")}]`);
  console.log(`         DNF-förare: ${bk}`);
  if (excelMode && EXCEL[pl.id]) {
    const want = EXCEL[pl.id];
    for (const [label, got, exp] of [["placering", pc, want.placement], ["serie", sc, want.series]]) {
      got.forEach((v, i) => {
        if (v !== exp[i]) {
          fails++;
          console.log(`   ✗ ${label} ${CLASSES[i]}: motor ${v} ≠ Excel ${exp[i]}`);
        }
      });
    }
  }
}
if (excelMode) {
  console.log(fails ? `\n${fails} avvikelse(r) mot Excel.` : "\nAllt stämmer med Excel ✓");
  process.exitCode = fails ? 1 : 0;
}
