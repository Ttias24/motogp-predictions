// Bilder från MotoGP sparas på sidan själv (assets/), så besökarnas webbläsare bara pratar med
// sidan och databasen. Körs av fetch-results.mjs varje gång resultaten hämtas.
//
//  * Nummergrafik per förare: assets/numbers/<förar-id>-<filnamn>.png
//    Hämtas bara när filen saknas eller MotoGP:s adress har ändrats (t.ex. nytt nummer).
//  * Flaggor per land: assets/flags/<iso>.svg (adressen kommer från MotoGP:s förarlista).
//  * Filer som ingen säsong längre använder tas bort.
//
// Bilderna är främmande data: storlek och filtyp kontrolleras innan de sparas, och de visas
// bara med <img>, som aldrig kör skript i en SVG.
import { readFile, writeFile, mkdir, readdir, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const NUMBERS = "assets/numbers";
const FLAGS = "assets/flags";
const MAX_PNG = 1.5 * 1024 * 1024;
const MAX_SVG = 400 * 1024;
const FLAG_URL = (iso) => `https://photos.motogp.com/countries/flags/iso2/${iso}.svg`;

const safe = (s) => String(s).replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 80);

async function download(url, check, max) {
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > max) throw new Error(`för stor (${buf.length} byte)`);
  if (!check(buf)) throw new Error("oväntad filtyp");
  return buf;
}
const isPng = (b) => b.length > 8 && b.readUInt32BE(0) === 0x89504e47;
const isSvg = (b) => {
  const head = b.subarray(0, 512).toString("utf8").replace(/^﻿/, "").trimStart();
  const text = b.toString("utf8");
  return (head.startsWith("<svg") || head.startsWith("<?xml")) && text.includes("<svg") && !/<script|javascript:/i.test(text);
};

async function pool(items, limit, fn) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) await fn(items[next++]);
    })
  );
}

/**
 * Laddar ner nummergrafik och flaggor för förarna och sätter r.numberArt till den lokala filen.
 * `flagSrc` = land → flaggadress från API:t (annars används MotoGP:s vanliga adress).
 * Returnerar { ES: "assets/flags/es.svg", … } för länderna som finns lokalt.
 */
export async function localizeImages(root, riders, flagSrc = {}) {
  await mkdir(join(root, NUMBERS), { recursive: true });
  await mkdir(join(root, FLAGS), { recursive: true });

  const numberJobs = [];
  const isos = new Set();
  for (const cls of Object.keys(riders))
    for (const [key, r] of Object.entries(riders[cls])) {
      // Äldre filer har MotoGP:s adress direkt i numberArt.
      if (!r.numberArtSrc && /^https?:/.test(r.numberArt ?? "")) r.numberArtSrc = r.numberArt;
      if (r.country) isos.add(String(r.country).toUpperCase());
      if (!r.numberArtSrc) {
        r.numberArt = null;
        continue;
      }
      const file = `${NUMBERS}/${safe(key)}-${safe(r.numberArtSrc.split("/").pop().replace(/\.png$/i, ""))}.png`;
      r.numberArt = file;
      if (!existsSync(join(root, file))) numberJobs.push({ r, file });
    }

  let got = 0;
  await pool(numberJobs, 4, async ({ r, file }) => {
    try {
      await writeFile(join(root, file), await download(r.numberArtSrc, isPng, MAX_PNG));
      got++;
    } catch (err) {
      console.warn(`  Kunde inte hämta nummergrafik för ${r.name}: ${err.message}`);
      r.numberArt = null; // sidan visar numret på en teamfärgad platta i stället
    }
  });
  if (numberJobs.length) console.log(`  Nummergrafik: ${got}/${numberJobs.length} nya hämtade.`);

  const flags = {};
  const flagJobs = [];
  for (const iso of isos) {
    if (!/^[A-Z]{2}$/.test(iso)) continue;
    const file = `${FLAGS}/${iso.toLowerCase()}.svg`;
    if (existsSync(join(root, file))) flags[iso] = file;
    else flagJobs.push({ iso, file });
  }
  let gotFlags = 0;
  await pool(flagJobs, 4, async ({ iso, file }) => {
    try {
      await writeFile(join(root, file), await download(flagSrc[iso] ?? FLAG_URL(iso), isSvg, MAX_SVG));
      flags[iso] = file;
      gotFlags++;
    } catch (err) {
      console.warn(`  Kunde inte hämta flagga för ${iso}: ${err.message}`);
    }
  });
  if (flagJobs.length) console.log(`  Flaggor: ${gotFlags}/${flagJobs.length} nya hämtade.`);
  return Object.fromEntries(Object.entries(flags).sort());
}

/** Tar bort bilder som ingen resultatfil (någon säsong) längre pekar på. */
export async function removeUnusedImages(root, extraUsed = []) {
  const used = new Set(extraUsed);
  const dataDir = join(root, "data");
  for (const f of await readdir(dataDir)) {
    if (!/^results-\d{4}\.json$/.test(f)) continue;
    const d = JSON.parse(await readFile(join(dataDir, f), "utf8"));
    for (const cls of Object.values(d.riders ?? {})) for (const r of Object.values(cls)) if (r.numberArt) used.add(r.numberArt);
    for (const file of Object.values(d.flags ?? {})) used.add(file);
  }
  let removed = 0;
  for (const dir of [NUMBERS, FLAGS]) {
    if (!existsSync(join(root, dir))) continue;
    for (const f of await readdir(join(root, dir))) {
      if (used.has(`${dir}/${f}`)) continue;
      await unlink(join(root, dir, f));
      removed++;
    }
  }
  if (removed) console.log(`  Tog bort ${removed} bilder som inte längre används.`);
}
