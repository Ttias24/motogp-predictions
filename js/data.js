// Datakälla. Just nu: statiska JSON-filer + ett lokalt utkast i webbläsaren.
// Senare (inloggning/backend): byt ut funktionerna här mot anrop till t.ex. Supabase –
// resten av appen pratar bara med de här funktionerna.

const draftKey = (year) => `picks-draft-${year}`;

async function getJson(url) {
  const res = await fetch(`${url}?v=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

export async function loadSeasonList() {
  try {
    return await getJson("data/seasons.json");
  } catch {
    return { current: new Date().getFullYear(), seasons: [new Date().getFullYear()] };
  }
}

export async function loadResults(year) {
  try {
    return await getJson(`data/results-${year}.json`);
  } catch {
    return { season: year, rounds: [], riders: {}, standings: {}, classes: ["MotoGP", "Moto2", "Moto3"] };
  }
}

export async function loadSavedPicks(year) {
  try {
    return await getJson(`data/picks-${year}.json`);
  } catch {
    return { season: year, scoring: { exactPosition: 2, insideTop5: 1 }, players: [] };
  }
}

/** Returnerar { picks, isDraft } – ett lokalt utkast vinner över filen. */
export async function loadPicks(year) {
  const draft = readDraft(year);
  if (draft) return { picks: draft, isDraft: true };
  return { picks: await loadSavedPicks(year), isDraft: false };
}

export function readDraft(year) {
  try {
    const raw = localStorage.getItem(draftKey(year));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveDraft(year, picks) {
  try {
    localStorage.setItem(draftKey(year), JSON.stringify(picks));
    return true;
  } catch {
    return false;
  }
}

export function clearDraft(year) {
  try {
    localStorage.removeItem(draftKey(year));
  } catch {}
}

export function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 1) + "\n"], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 0);
}
