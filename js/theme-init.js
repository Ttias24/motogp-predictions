// Ljust eller mörkt läge sätts innan sidan ritas, så den inte blinkar mörk först.
// Vanligt skript (inte modul) så det körs direkt i <head>.
try {
  if (localStorage.getItem("theme") === "light") {
    document.documentElement.dataset.theme = "light";
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", "#ffffff");
  }
} catch {}
