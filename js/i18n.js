// Översättningar. Svenska är standard; engelska via knappen i sidhuvudet.
const STRINGS = {
  sv: {
    appTitle: "MotoGP-tipset",
    "nav.leaderboard": "Ställning",
    "nav.picks": "Tipsen",
    "nav.riders": "Förare",
    "nav.championship": "VM-tabell",
    "nav.edit": "Redigera",
    afterRound: "Efter runda",
    of: "av",
    next: "Nästa",
    updated: "Data uppdaterad",
    seasonOver: "Säsongen är slut",
    placement: "Placeringspoäng",
    placementShort: "Plac.",
    series: "Seriepoäng",
    seriesShort: "Serie",
    total: "Totalt",
    player: "Spelare",
    lastRound: "Senaste runda",
    rank: "#",
    rulesTitle: "Så räknas poängen",
    rules: [
      "Varje spelare tippar topp 5 i MotoGP, Moto2 och Moto3, plus en backup (BU) och en Did Not Finish-förare (DNF).",
      "<b>Placeringspoäng</b> delas ut efter varje race (och sprint i MotoGP): <b>2 p</b> om föraren går i mål på exakt den plats du tippat, <b>1 p</b> om föraren hamnar inom topp 5 på en annan plats.",
      "<b>Seriepoäng</b> är summan av de VM-poäng som dina förare tar (race + sprint).",
      "<b>Backup</b>: kan aktiveras om en förare skadas. Föraren som ersätts slutar räknas, de övriga flyttar upp ett steg och backupen går in på plats 5. Backupen räknas först från aktiveringsrundan och kan inte ångras.",
      "<b>Did Not Finish</b>: föraren du tror kommer bryta flest lopp. Räknas som antal race och sprintar utan målgång.",
    ],
    bowling: "Did Not Finish",
    bowlingDesc:
      "Antal race och sprintar där den valda föraren inte gick i mål. Resultatlistan skiljer inte på vurpa och tekniskt fel.",
    dnfCount: "{n} lopp utan målgång",
    backup: "Backup",
    buInactive: "Ej aktiverad",
    buActive: "Aktiverad från runda {r}, ersätter {name}",
    slot: "Plats",
    rider: "Förare",
    champPos: "VM",
    champPosTitle: "Förarens placering i VM-tabellen",
    pShort: "P",
    pTitle: "Placeringspoäng",
    sShort: "S",
    sTitle: "Seriepoäng",
    team: "Team",
    points: "Poäng",
    pickedBy: "Tippad av",
    race: "Race",
    sprint: "Sprint",
    show: "Visa",
    showPoints: "Poäng",
    showPos: "Placering",
    notEntered: "Körde inte",
    dnfTitle: "Bröt / gick inte i mål",
    dnsTitle: "Startade inte",
    dqTitle: "Diskvalificerad",
    ncTitle: "Ej klassad",
    halfPoints: "Halvpoäng (avkortat lopp)",
    noResults: "Inga resultat ännu den här säsongen.",
    wins: "Segrar",
    podiums: "Pallplatser",
    dnfs: "DNF",
    placesTitle: "Antal placeringar 1–5",
    close: "Stäng",
    exactHit: "Rätt plats",
    top5Hit: "Inom topp 5",
    replaced: "Ersatt",
    fromRoundShort: "fr.o.m. R{r}",
    unknownRiders: "Hittar inte de här förarna i resultaten – kontrollera stavningen:",
    draftBanner: "Du tittar på ett lokalt utkast av tipsen (sparat bara i den här webbläsaren).",
    draftReset: "Visa den sparade filen",
    // Redigera
    editTitle: "Redigera tips",
    editIntro:
      "Här kan du lägga till spelare, ändra tips och aktivera backups. Ändringarna sparas i den här webbläsaren när du trycker på <b>Använd</b>. För att alla ska se dem: ladda ner filen och ersätt <code>data/picks-{year}.json</code> (i en senare version med inloggning sparas allt direkt).",
    addPlayer: "Lägg till spelare",
    removePlayer: "Ta bort spelare",
    confirmRemove: "Ta bort {name}?",
    name: "Namn",
    newPlayer: "Ny spelare",
    buActivatedLabel: "Backup aktiverad",
    fromRound: "Från runda",
    replaces: "Ersätter",
    irreversible: "Obs: en aktiverad backup kan inte ångras enligt reglerna.",
    apply: "Använd",
    download: "Ladda ner picks-fil",
    resetToFile: "Återställ till sparad fil",
    applied: "Ändringarna används nu i den här webbläsaren.",
    duplicates: "Samma förare finns flera gånger i topp 5.",
    scoringTitle: "Poäng per race",
    exactPts: "Rätt plats",
    top5Pts: "Inom topp 5",
  },
  en: {
    appTitle: "MotoGP Predictions",
    "nav.leaderboard": "Leaderboard",
    "nav.picks": "Picks",
    "nav.riders": "Riders",
    "nav.championship": "Championship",
    "nav.edit": "Edit",
    afterRound: "After round",
    of: "of",
    next: "Next",
    updated: "Data updated",
    seasonOver: "Season finished",
    placement: "Position points",
    placementShort: "Pos.",
    series: "Series points",
    seriesShort: "Series",
    total: "Total",
    player: "Player",
    lastRound: "Last round",
    rank: "#",
    rulesTitle: "How scoring works",
    rules: [
      "Each player picks a top 5 in MotoGP, Moto2 and Moto3, plus a backup (BU) and a Did Not Finish rider (DNF).",
      "<b>Position points</b> are awarded after every race (and MotoGP sprint): <b>2 pts</b> if the rider finishes exactly where you picked them, <b>1 pt</b> if they finish in the top 5 in another position.",
      "<b>Series points</b> are the championship points your riders score (race + sprint).",
      "<b>Backup</b>: can be activated if a rider gets injured. The replaced rider stops counting, the others move up one place and the backup goes in at 5th. The backup only counts from the round it is activated and cannot be undone.",
      "<b>Did Not Finish</b>: the rider you think will fail to finish the most races. Counted as races and sprints not finished.",
    ],
    bowling: "Did Not Finish",
    bowlingDesc:
      "Number of races and sprints the chosen rider did not finish. The results don't distinguish crashes from technical failures.",
    dnfCount: "{n} not finished",
    backup: "Backup",
    buInactive: "Not activated",
    buActive: "Activated from round {r}, replacing {name}",
    slot: "Slot",
    rider: "Rider",
    champPos: "Ch.",
    champPosTitle: "Rider's championship position",
    pShort: "P",
    pTitle: "Position points",
    sShort: "S",
    sTitle: "Series points",
    team: "Team",
    points: "Points",
    pickedBy: "Picked by",
    race: "Race",
    sprint: "Sprint",
    show: "Show",
    showPoints: "Points",
    showPos: "Position",
    notEntered: "Did not take part",
    dnfTitle: "Did not finish",
    dnsTitle: "Did not start",
    dqTitle: "Disqualified",
    ncTitle: "Not classified",
    halfPoints: "Half points (shortened race)",
    noResults: "No results yet this season.",
    wins: "Wins",
    podiums: "Podiums",
    dnfs: "DNF",
    placesTitle: "Finishes in positions 1–5",
    close: "Close",
    exactHit: "Exact position",
    top5Hit: "Inside top 5",
    replaced: "Replaced",
    fromRoundShort: "from R{r}",
    unknownRiders: "These riders can't be found in the results – check the spelling:",
    draftBanner: "You are viewing a local draft of the picks (saved only in this browser).",
    draftReset: "Show the saved file",
    editTitle: "Edit picks",
    editIntro:
      "Add players, change picks and activate backups here. Changes are saved in this browser when you press <b>Apply</b>. For everyone to see them: download the file and replace <code>data/picks-{year}.json</code> (a later version with logins will save directly).",
    addPlayer: "Add player",
    removePlayer: "Remove player",
    confirmRemove: "Remove {name}?",
    name: "Name",
    newPlayer: "New player",
    buActivatedLabel: "Backup activated",
    fromRound: "From round",
    replaces: "Replaces",
    irreversible: "Note: an activated backup cannot be undone under the rules.",
    apply: "Apply",
    download: "Download picks file",
    resetToFile: "Reset to saved file",
    applied: "The changes are now used in this browser.",
    duplicates: "The same rider appears more than once in the top 5.",
    scoringTitle: "Points per race",
    exactPts: "Exact position",
    top5Pts: "Inside top 5",
  },
};

let lang = "sv";
try {
  const saved = localStorage.getItem("lang");
  if (saved === "sv" || saved === "en") lang = saved;
} catch {}

export const getLang = () => lang;
export function setLang(l) {
  lang = l === "en" ? "en" : "sv";
  document.documentElement.lang = lang;
  try {
    localStorage.setItem("lang", lang);
  } catch {}
}

export function t(key, vars = {}) {
  let s = STRINGS[lang][key] ?? STRINGS.sv[key] ?? key;
  if (typeof s === "string") for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
  return s;
}

const numFmt = {};
export function fmt(n) {
  if (n == null || Number.isNaN(n)) return "";
  numFmt[lang] ??= new Intl.NumberFormat(lang === "sv" ? "sv-SE" : "en-GB", { maximumFractionDigits: 1 });
  return numFmt[lang].format(n);
}

export function fmtDate(iso, opts = { day: "numeric", month: "short" }) {
  if (!iso) return "";
  return new Intl.DateTimeFormat(lang === "sv" ? "sv-SE" : "en-GB", opts).format(new Date(iso));
}
