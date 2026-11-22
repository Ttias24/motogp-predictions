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
| **Mina tips** | Syns för den som öppnat sin personliga länk: lämna/ändra tips och aktivera backup |
| **Historik** | Tidigare säsonger med slutställning; klicka för att öppna en hel säsong |

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
js/data.js                     Läser filerna (resultat, säsonger, tips för äldre säsonger)
data/picks-2026.json           Tipsen för 2026 (säsonger från 2027 ligger i databasen)
data/results-2026.json         Resultat (skapas av skriptet, redigera inte för hand)
data/seasons.json              Aktuell säsong + lista över alla säsonger (Historik)
scripts/rollover.mjs           Säsongsbyte 1 januari
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

## Ändra tips eller aktivera backup (säsonger i filer)

1. Öppna `#/edit`, gör ändringarna och tryck **Använd** (syns bara i din webbläsare).
2. Tryck **Ladda ner picks-fil** och ersätt `data/picks-2026.json` med den (eller redigera filen
   direkt på GitHub). När filen är uppladdad ser alla ändringen.

Backup-aktivering i filen ser ut så här (`round` = första rundan backupen räknas):

```json
"backupActivated": { "round": 12, "replaces": "Angel Piqueras" }
```

## Tips via webbsidan (från 2027)

Från och med säsongen i `"databaseFrom"` (`data/seasons.json`, nu 2027) lämnar spelarna sina
tips själva på sidan. Tipsen sparas i en Supabase-databas (gratisplan, EU/Stockholm) och alla
regler kontrolleras i databasen – inte på webbsidan – så de går inte att kringgå:

* tips kan bara lämnas/ändras medan tipsperioden är öppen,
* andras tips syns först när perioden har stängt (innan dess syns bara vilka som lämnat tips),
* varje spelare kan bara ändra sina egna tips, och samma namn kan inte användas två gånger,
* backup kan aktiveras av spelaren själv efter stängning; tiden sätts av servern och kan inte ändras.
  Backupen räknas från första runda som startar efter aktiveringen. Kan inte ångras.

Inga IP-adresser och inga e-postadresser för spelare sparas – bara det namn spelaren själv väljer.

### Sidor

| Adress | För vem |
|---|---|
| `#/join/<kod>` | Den **delade inbjudningslänken** (t.ex. i familjechatten). Man väljer sitt namn och får en egen kod som sparas i webbläsaren. |
| `#/tippa/<kod>` | En **personlig länk**. Öppnas den en gång sparas koden, därefter räcker den vanliga adressen – fliken **Mina tips** dyker upp. |
| `#/admin` | **Admin** (du). Logga in med e-postlänk. Sidan är inte hemlig – utan admin-inloggning kan den ingenting. |

### Varje år (din del)

1. **December/januari:** öppna `#/admin` och logga in. Välj året, fyll i när tipsen öppnar
   (förslag: 1 januari) och stänger (förslag: 23:59 dagen före första racehelgen – sidan föreslår
   datumet ur MotoGP-kalendern när den finns) och tryck **Skapa säsong**.
2. Tryck **Skapa delad länk**, kopiera den och skicka den till alla som ska vara med.
   Vill du hellre bjuda in en och en: skriv en anteckning (t.ex. "Mormor") och tryck **Bjud in** –
   mottagaren väljer själv sitt namn.
3. Följ på adminsidan vilka som lämnat tips. Du kan rätta tips, ta bort dubbletter, godkänna
   nya spelare (om du kryssat i att det krävs) och ge någon en ny länk om de tappat bort sin.

Resten sker automatiskt: säsongsbytet 1 januari, resultaten och att databasen hålls vaken
(GitHub-jobbet gör ett litet anrop varje körning, eftersom gratisprojekt annars pausas efter en vecka).

### Teknik

```
supabase/migrations/001_predictions.sql   Tabeller, säkerhetsregler och funktioner (redan installerat)
js/config.js                              Databasens adress + publika nyckel (får ligga i koden)
js/remote.js                              Alla anrop till databasen
js/views/predict.js, admin.js             Sidorna Mina tips / Gå med och Admin
```

Supabase-projekt: `motogp-tipset` (region eu-north-1). Inställningar för inloggning finns i
Supabase under **Authentication → URL Configuration** och **Sign In / Providers**.

## Säsonger i filer (2026 och tidigare)

Säsonger före `"databaseFrom"` har sina tips i `data/picks-<år>.json`. De redigeras via
`#/edit` (länk längst ner på adminsidan) eller direkt i filen på GitHub, se avsnittet ovan om
att ändra tips.

**1 januari** byter GitHub själv till det nya året (`scripts/rollover.mjs`): förra säsongen
flyttas till **Historik** och sidan visar "Säsong <år> har inte startat än" tills första racet är kört.

**Om något har stannat:** gå till fliken **Actions** på GitHub. Står det att arbetsflödet är
avstängt ("disabled"), tryck **Enable workflow**. Kör sedan **Run workflow** en gång.
Arbetsflödet håller sig normalt aktivt självt, även över vintern.

## Publicera (GitHub Pages)

1. Skapa ett repo på GitHub och ladda upp den här mappen.
2. **Settings → Pages → Source: GitHub Actions.**
3. Arbetsflödet `Uppdatera resultat och publicera` hämtar resultat var 3:e timme söndag, måndag och torsdag och
   publicerar sidan. Det kan också köras manuellt under **Actions → Run workflow**.

## Om datakällan

`api.motogp.pulselive.com` är det API som motogp.com själv använder. Det är inte officiellt
dokumenterat och kan ändras. Skriptet hanterar avbrutna och omstartade lopp (RAC 2), inställda
lopp och halvpoäng. Om poäng saknas i API:t räknas de från placeringen och stäms av mot den
officiella VM-tabellen.
