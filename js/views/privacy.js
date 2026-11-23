// Integritetssidan (#/privacy), länkad mitt i sidfoten.
// Håll texten i takt med koden: vad som sparas (supabase/migrations), vad webbläsaren
// sparar (localStorage i app.js, data.js, i18n.js) och vilka externa adresser sidan
// laddar (Content-Security-Policy i index.html).
import { getLang } from "../i18n.js";

const UPDATED = { sv: "23 november 2026", en: "23 November 2026" };

const TEXT = {
  sv: {
    title: "Integritet",
    intro:
      "MotoGP Predictions är ett privat tipsspel mellan vänner och familj. Sidan samlar in så lite som möjligt om dig, och ingenting säljs, delas för reklam eller används för spårning.",
    sections: [
      [
        "Vad som sparas om dig som spelare",
        [
          "Visningsnamnet du väljer och dina tips: fem förare per klass, backup och DNF-val, och en eventuellt aktiverad backup.",
          "Din personliga inbjudningskod sparas bara som en hash – en kontrollsumma som inte går att läsa tillbaka.",
          "Inga e-postadresser, telefonnummer, lösenord eller IP-adresser sparas för spelare.",
        ],
      ],
      [
        "Vem som ser vad",
        [
          "Före tipsfristen ser bara du och administratören dina tips.",
          "Efter fristen visas allas namn och tips för alla som besöker sidan. En kopia sparas då i sidans offentliga kodförråd på GitHub, så att säsongen kan visas under Historik även senare. Använd gärna ett smeknamn.",
        ],
      ],
      [
        "Administratörer",
        ["Den som administrerar spelet loggar in med en länk via e-post. E-postadressen hanteras av Supabase och används bara för inloggningen."],
      ],
      [
        "I din webbläsare",
        [
          "Sidan använder inga kakor (cookies) och ingen statistik eller reklam.",
          "Webbläsaren minns några inställningar lokalt: språk, ljust eller mörkt läge, valda flikar och spelare, och din inbjudningskod så att du slipper öppna länken varje gång. Administratörer har även sin inloggning sparad där.",
          "Inget av detta skickas någonstans. Du tar bort det genom att rensa webbplatsdata för sidan i webbläsaren.",
        ],
      ],
      [
        "Tjänster som sidan använder",
        [
          "GitHub Pages lagrar och levererar själva sidan och resultaten.",
          "Supabase är databasen för spelare och tips, med servrar i Stockholm.",
          "Förarnas nummerbilder hämtas från MotoGP (photos.motogp.com) och flaggorna från jsDelivr.",
          "Typsnitten ligger på sidan själv. Varje tjänst ovan ser din IP-adress när webbläsaren hämtar något därifrån och kan spara den kortare tid i tekniska loggar – så fungerar webben.",
        ],
      ],
      [
        "Ändra eller ta bort",
        [
          "Kontakta administratören (den som bjöd in dig) om du vill byta namn eller tas bort. Ditt namn och dina tips tas då bort ur databasen och ur kommande kopior. Kopior från tidigare säsonger finns kvar i GitHub-historiken.",
        ],
      ],
    ],
    updated: "Senast ändrad",
  },
  en: {
    title: "Privacy",
    intro:
      "MotoGP Predictions is a private prediction game among friends and family. The site collects as little about you as possible, and nothing is sold, shared for advertising or used for tracking.",
    sections: [
      [
        "What is stored about you as a player",
        [
          "The display name you choose and your picks: five riders per class, backup and DNF picks, and a backup if you activate it.",
          "Your personal invite code is only stored as a hash – a checksum that can't be turned back into the code.",
          "No email addresses, phone numbers, passwords or IP addresses are stored for players.",
        ],
      ],
      [
        "Who sees what",
        [
          "Before the deadline, only you and the admin can see your picks.",
          "After the deadline, everyone's names and picks are shown to anyone visiting the site. A copy is then saved in the site's public code repository on GitHub, so the season can still be shown under History later. Feel free to use a nickname.",
        ],
      ],
      [
        "Admins",
        ["Whoever runs the game signs in with a link sent by email. The email address is handled by Supabase and only used for signing in."],
      ],
      [
        "In your browser",
        [
          "The site uses no cookies and no analytics or advertising.",
          "Your browser remembers a few settings locally: language, bright or dark mode, chosen tabs and player, and your invite code so you don't need the link every time. Admins also have their sign-in stored there.",
          "None of this is sent anywhere. You remove it by clearing the site data for this site in your browser.",
        ],
      ],
      [
        "Services the site uses",
        [
          "GitHub Pages stores and serves the site itself and the results.",
          "Supabase is the database for players and picks, with servers in Stockholm.",
          "Rider number graphics are loaded from MotoGP (photos.motogp.com) and flags from jsDelivr.",
          "The fonts are hosted on the site itself. Each service above sees your IP address when your browser loads something from it, and may keep it briefly in technical logs – that's how the web works.",
        ],
      ],
      [
        "Change or remove",
        [
          "Contact the admin (whoever invited you) if you want to change your name or be removed. Your name and picks are then removed from the database and from future copies. Copies from earlier seasons remain in the GitHub history.",
        ],
      ],
    ],
    updated: "Last changed",
  },
};

export function renderPrivacy() {
  const lang = getLang() === "en" ? "en" : "sv";
  const x = TEXT[lang];
  return `<section class="card privacy">
    <h2>${x.title}</h2>
    <p>${x.intro}</p>
    ${x.sections.map(([head, items]) => `<h3>${head}</h3><ul>${items.map((i) => `<li>${i}</li>`).join("")}</ul>`).join("")}
    <p class="muted small">${x.updated}: ${UPDATED[lang]}</p>
  </section>`;
}
