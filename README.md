# MotoGP-tipset

Familjens tips för MotoGP, Moto2 och Moto3, med resultat som hämtas automatiskt från
MotoGP:s resultat-API. Sidan finns på svenska och engelska, fungerar i mobilen och kan
läggas till på hemskärmen som en app.

## Sidor

| Sida | Innehåll |
|---|---|
| **Ställning** | Placeringspoäng och seriepoäng per spelare och klass, förändring sedan förra rundan, Did Not Finish-tabellen |
| **Tipsen** | Varje spelares topp 5 per klass med förarnas VM-placering, poäng per förare, backup och DNF-förare |
| **Förare** | Resultat per runda för alla tippade förare (race/sprint), poäng eller placering; klicka på en förare för statistik |
| **VM-tabell** | Mästerskapsställningen med vem som tippat vilken förare |
| **Redigera** | Lägg till spelare, ändra tips, aktivera backup, ladda ner ny picks-fil |

Med "Efter runda" kan du se ställningen som den var efter en tidigare runda.

## Regler (implementerade i `js/scoring.js`)

* **Placeringspoäng**, efter varje race (och sprint i MotoGP): rätt plats = 2 p, inom topp 5 = 1 p.
* **Seriepoäng**: summan av VM-poängen (race + sprint) som de tippade förarna tar.
* **Backup (BU)**: räknas först från och med aktiveringsrundan. Den ersatta föraren slutar räknas,
  de övriga flyttar upp ett steg och backupen går in på plats 5. Kan inte ångras.
* **Did Not Finish (DNF)**: antal race och sprintar utan målgång för den valda föraren (fältet `bowling` i
  picks-filen). API:t skiljer inte på vurpa och
  tekniskt fel.

## Filer

```
index.html, css/, js/          Webbsidan (ingen byggprocess, vanlig HTML/JS)
js/scoring.js                  Poängmotorn (används både av sidan och av skripten)
js/data.js                     Datakällan – det enda stället som behöver bytas vid inloggning/databas
data/picks-2026.json           Spelarna och deras tips  ← redigeras för hand eller via sidan "Redigera"
data/results-2026.json         Resultat (skapas av skriptet, redigera inte för hand)
data/seasons.json              Vilken säsong som visas
scripts/fetch-results.mjs      Hämtar resultat från API:t
scripts/check-scores.mjs       Skriver ut ställningen / jämför med Excel (--excel)
.github/workflows/…            Automatisk uppdatering och publicering på GitHub Pages
```

## Köra lokalt

Kräver [Node.js](https://nodejs.org) 18 eller senare.

```powershell
node scripts/fetch-results.mjs      # hämta senaste resultaten
node scripts/serve.mjs              # öppna http://localhost:5173
```

## Ändra tips eller aktivera backup

1. Öppna **Redigera**, gör ändringarna och tryck **Använd** (syns bara i din webbläsare).
2. Tryck **Ladda ner picks-fil** och ersätt `data/picks-2026.json` med den (eller redigera filen
   direkt på GitHub). När filen är uppladdad ser alla ändringen.

Backup-aktivering i filen ser ut så här (`round` = första rundan backupen räknas):

```json
"backupActivated": { "round": 12, "replaces": "Angel Piqueras" }
```

## Ny säsong

1. Kopiera `data/picks-2026.json` till `data/picks-2027.json` och fyll i de nya tipsen.
2. Ändra `"current"` i `data/seasons.json` till 2027 och lägg till året i listan.
3. Skriptet hämtar automatiskt den säsong som är aktuell i API:t.
   Gamla säsonger går att visa med `?season=2026` i adressen.

## Publicera (GitHub Pages)

1. Skapa ett repo på GitHub och ladda upp den här mappen.
2. **Settings → Pages → Source: GitHub Actions.**
3. Arbetsflödet `Uppdatera resultat och publicera` hämtar resultat var 3:e timme söndag, måndag och torsdag och
   publicerar sidan. Det kan också köras manuellt under **Actions → Run workflow**.

## Nästa steg: inloggning

All läsning och skrivning av tips går via `js/data.js`. För att lägga till inloggning (så att
var och en kan fylla i sina egna tips och aktivera sin backup) byts de funktionerna mot en
databas med inloggning, t.ex. Supabase eller Firebase. Poängmotorn och sidorna kan vara kvar som de är.

## Om datakällan

`api.motogp.pulselive.com` är det API som motogp.com själv använder. Det är inte officiellt
dokumenterat och kan ändras. Skriptet hanterar avbrutna och omstartade lopp (RAC 2), inställda
lopp och halvpoäng. Om poäng saknas i API:t räknas de från placeringen och stäms av mot den
officiella VM-tabellen.
