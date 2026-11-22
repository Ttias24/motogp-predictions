// Startlistan (officiell "entry list" från MotoGP) och den automatiska tipsperioden.
import { CLASSES, normalizeName } from "./scoring.js";

export const isPublished = (results) => Boolean(results?.entryList?.published);

/** Ordinarie förare i en klass enligt startlistan: [{ id, ...förarinfo }] */
export function entryRiders(results, cls) {
  const keys = results?.entryList?.[cls] ?? [];
  return keys.map((id) => ({ id, ...(results.riders?.[cls]?.[id] ?? {}) })).filter((r) => r.name);
}

/** { klass: { id: förare } } – samma form som results.riders, för förslagslistor. */
export function entryRiderMap(results) {
  return Object.fromEntries(CLASSES.map((c) => [c, Object.fromEntries(entryRiders(results, c).map((r) => [r.id, r]))]));
}

/** Tippade förare som inte finns på startlistan för sin klass: [{ cls, name }] */
export function offList(picks, results) {
  if (!picks || !isPublished(results)) return [];
  const out = [];
  for (const cls of CLASSES) {
    const names = new Set(entryRiders(results, cls).map((r) => normalizeName(r.name)));
    const c = picks[cls];
    if (!c) continue;
    for (const n of [...(c.top5 ?? []), c.backup, c.bowling]) if (n && !names.has(normalizeName(n))) out.push({ cls, name: n });
  }
  return out;
}

/**
 * Den automatiska tipsperioden (samma regel som scripts/sync-season.mjs):
 * öppnar när startlistan publicerades, stänger 23:59 (lokal tid) dagen före första tävlingshelgen.
 */
export function autoWindow(results) {
  const opens = isPublished(results) ? results.entryList.firstPublished ?? null : null;
  const first = (results?.rounds ?? []).map((r) => String(r.dateStart ?? "").slice(0, 10)).filter(Boolean).sort()[0];
  let closes = null;
  if (first) {
    const [y, m, d] = first.split("-").map(Number);
    closes = new Date(y, m - 1, d - 1, 23, 59).toISOString();
  }
  const firstRound = first ? results.rounds.find((r) => String(r.dateStart).startsWith(first)) : null;
  return { opens, closes, firstRound };
}
