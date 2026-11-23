// Integritetssidan (#/privacy), länkad mitt i sidfoten. Bara fakta om vad som sparas.
// Håll texten i takt med koden: databasen (supabase/migrations), webbläsarens lagring
// (localStorage i app.js, data.js, i18n.js) och externa adresser (CSP i index.html).
import { getLang } from "../i18n.js";

const TEXT = {
  sv: {
    title: "Integritet",
    sections: [
      [
        "Spelare",
        [
          "Visningsnamn och tips. När tipsperioden har stängt visas de för alla och sparas i sidans offentliga kodförråd på GitHub, även i dess historik.",
          "Inbjudningskoden, bara som hash (går inte att läsa tillbaka).",
        ],
      ],
      ["Administratörer", ["E-postadressen för inloggning, hos Supabase."]],
      [
        "I din webbläsare",
        ["Språk, ljust/mörkt läge, valda flikar och spelare samt din inbjudningskod (administratörer även inloggningen). Lämnar aldrig webbläsaren."],
      ],
      ["Sparas inte", ["IP-adresser, e-post för spelare, kakor, statistik eller spårning."]],
      [
        "Tjänster",
        [
          "GitHub Pages (sidan) och Supabase (databasen, Stockholm) ser din IP-adress vid besök och kan spara den kort i tekniska loggar. Typsnitt, flaggor och nummerbilder ligger på sidan själv.",
        ],
      ],
      ["Ändra eller ta bort", ["Kontakta administratören."]],
    ],
    updated: "Senast ändrad: 23 november 2026",
  },
  en: {
    title: "Privacy",
    sections: [
      [
        "Players",
        [
          "Display name and picks. After the deadline they're shown to everyone and saved in the site's public code repository on GitHub, including its history.",
          "The invite code, only as a hash (can't be read back).",
        ],
      ],
      ["Admins", ["The email address used to sign in, held by Supabase."]],
      [
        "In your browser",
        ["Language, bright/dark mode, chosen tabs and player, and your invite code (for admins also the sign-in). Never leaves the browser."],
      ],
      ["Not stored", ["IP addresses, player email addresses, cookies, analytics or tracking."]],
      [
        "Services",
        [
          "GitHub Pages (the site) and Supabase (the database, Stockholm) see your IP address when you visit and may keep it briefly in technical logs. Fonts, flags and number graphics are hosted on the site itself.",
        ],
      ],
      ["Change or remove", ["Contact the admin."]],
    ],
    updated: "Last changed: 23 November 2026",
  },
};

export function renderPrivacy() {
  const x = TEXT[getLang() === "en" ? "en" : "sv"];
  return `<section class="card privacy">
    <h2>${x.title}</h2>
    ${x.sections.map(([head, items]) => `<h3>${head}</h3><ul>${items.map((i) => `<li>${i}</li>`).join("")}</ul>`).join("")}
    <p class="muted small">${x.updated}</p>
  </section>`;
}
