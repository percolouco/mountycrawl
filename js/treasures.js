/* Page « Trésors du Hall » : encyclopédie des potions et des parchemins,
 * formules officielles de Mountypedia (X = niveau du trésor).
 * Rappel : un trésor ne fait qu'un seul jet de dés — « X D3 » donne le même
 * total partout où il s'applique. Partage les globales de potions.js/scrolls.js. */

"use strict";

/* [id, niveau X, durée affichée, effets] — ordre d'affichage de la page. */
const TREASURE_POTIONS = [
  ["biskot",      "—",                "2 tours",  ["REG +2", "PV +2D3 (immédiat)"]],
  ["bonneBouffe", "3 à 7",            "5 tours",  ["DEG +X", "REG +X"]],
  ["calvok",      "2 à 6",            "1 tour",   ["Concentration −5·X %"]],
  ["cervelle",    "2 à 6",            "1 tour",   ["Concentration +5·X %"]],
  ["chronometre", "1 à 5",            "3 tours",  ["TOUR accéléré : +X PA par tour"]],
  ["corruption",  "3 à 7",            "5 tours",  ["ATT +X D3", "ESQ −X D3", "DEG +X", "REG −X", "VUE −X", "Armure +X", "RM −Y %, MM −Z % (selon X)"]],
  ["djhinTonik",  "1 à 5",            "4 tours",  ["DEG +X", "REG +X", "PV +2D3 (immédiat)"]],
  ["doverPowa",   "11 à 100",         "2 tours",  ["MM +Y %", "RM −X %"]],
  ["fertilite",   "3 à 7",            "5 tours",  ["ATT +X D3", "DEG +X"]],
  ["feu",         "3 à 7",            "5 tours",  ["ESQ +X D3", "VUE +X"]],
  ["glacier",     "3 à 7",            "5 tours",  ["REG +X", "Armure +X"]],
  ["grippe",      "3 à 4",            "3 tours",  ["ATT −X D3", "ESQ −X D3", "DEG −X", "REG −X"]],
  ["guerison",    "1 à 5",            "immédiat", ["PV +2·X D3"]],
  ["kouleMann",   "1 à 5",            "4 tours",  ["REG +X", "VUE +X", "PV +(X/2) D3 (immédiat)"]],
  ["longueVue",   "1, 2, 3, 5 ou 8",  "3 tours",  ["VUE +X"]],
  ["metomol",     "1 à 5",            "2 tours",  ["TOUR accéléré : +X PA par tour", "Armure −2·X"]],
  ["painture",    "1 à 5",            "X tours",  ["Visible — camouflage impossible"]],
  ["pneumonie",   "5 (fixe)",         "3 tours",  ["ATT −5 D3", "ESQ −5 D3", "DEG −5", "REG −5"]],
  ["pufPuff",     "0 à 2",            "3 tours",  ["ATT −X D3", "ESQ −X D3", "VUE −(X+1)", "PV −2D3 si X ≥ 2", "Effet de Zone"]],
  ["rhume",       "1 à 2",            "3 tours",  ["ATT −X D3", "ESQ −X D3", "DEG −X", "REG −X"]],
  ["sangToh",     "1 à 5",            "4 tours",  ["ATT +X D3", "ESQ +X D3", "VUE +X"]],
  ["sinneKhole",  "11 à 100",         "2 tours",  ["RM +X %", "MM −Y %"]],
  ["toxine",      "1 à 5",            "immédiat", ["PV −2·X D3"]],
  ["voiputrin",   "1 à 5",            "2 tours",  ["VUE −10·X"]],
  ["zetCrak",     "1 à 5",            "3 tours",  ["ATT −X D3", "ESQ −X D3", "VUE −X", "PV +X D3 (immédiat)"]],
];

const TREASURE_SCROLLS = [
  ["runeCyclopes", "1 à 5", "4 tours",  ["ATT +X D3", "DEG +X", "VUE −X"]],
  ["clairvoyance", "1 à 5", "4 tours",  ["VUE +X", "TOUR accéléré : +X PA par tour"]],
  ["ideesConfuses","1 à 5", "3 tours",  ["ATT −X D3", "TOUR ralenti : −X PA par tour"]],
  ["runeExplosive","1 à 5", "immédiat", ["PV −2·X D3", "Effet de Zone (rayon 3 cases)"]],
  ["planGenial",   "1 à 5", "3 tours",  ["ATT +X D3", "DEG +X", "TOUR accéléré : +X/2 PA par tour"]],
  ["yeuKiPic",     "1 à 5", "2 tours",  ["VUE −3·X", "Effet de Zone (rayon 3 cases)"]],
  ["runeFoins",    "1 à 5", "3 tours",  ["DEG −X", "VUE −1", "PV −2D3 ou −4D3 (immédiat)"]],
];

function treasureCard(def, x, duration, fx) {
  const fxHtml = fx.map(f => {
    const neg = f.includes("−");
    const pos = f.includes("+");
    const cls = neg && !pos ? "tz-fx tz-bad" : pos && !neg ? "tz-fx tz-good" : "tz-fx";
    return `<span class="${cls}">${f}</span>`;
  }).join("");
  return `
    <div class="tz-card" style="--tz-color:${def.color}">
      <div class="tz-head"><span class="tz-name">${def.emoji} ${def.name}</span></div>
      <div class="tz-meta">Niveau X : <b>${x}</b> · Durée : <b>${duration}</b></div>
      <div class="tz-fx-list">${fxHtml}</div>
    </div>`;
}

function treasuresRender() {
  const body = document.getElementById("treasures-body");
  let html = `
    <p class="tz-intro">Les trésors du Monde Souterrain, fidèles aux formules de la
    <a href="https://mountypedia.mountyhall.com/Mountyhall/Potion" target="_blank" rel="noopener">Mountypedia</a>.
    Un trésor ne fait qu'<b>un seul jet de dés</b> : une formule « X D3 » donne le même total
    partout où elle s'applique. Les bonus « +X » sont des valeurs fixes ajoutées aux jets.
    1 tour = 1 DLA. Boire une potion ou lire un parchemin coûte <b>1 PA</b>.</p>`;

  html += `<h2 class="tz-section">🧪 Potions (${TREASURE_POTIONS.length})</h2><div class="tz-grid">`;
  for (const [id, x, duration, fx] of TREASURE_POTIONS) {
    html += treasureCard(POTION_DEFS[id], x, duration, fx);
  }
  html += "</div>";

  html += `<h2 class="tz-section">📜 Parchemins standards (${TREASURE_SCROLLS.length})</h2><div class="tz-grid">`;
  for (const [id, x, duration, fx] of TREASURE_SCROLLS) {
    html += treasureCard(SCROLL_DEFS[id], x, duration, fx);
  }
  html += "</div>";

  html += `<p class="tz-note">Effet de Zone : touche le lecteur et tous les monstres à 3 cases
    ou moins. « PV −2D3 ou −4D3 » (Rune des Foins) : la Mountypedia note « -2/4 D3 », interprété
    ici comme un tirage au sort entre 2D3 et 4D3.</p>`;

  body.innerHTML = html;
}

let treasuresReturnTo = "create";

function treasuresShow(from) {
  treasuresReturnTo = from;
  document.getElementById("screen-" + from).classList.add("hidden");
  document.getElementById("screen-treasures").classList.remove("hidden");
  treasuresRender();
  document.getElementById("screen-treasures").scrollTop = 0;
}

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("btn-treasures").onclick = () => treasuresShow("create");
    document.getElementById("btn-treasures-game").onclick = () => treasuresShow("game");
    document.getElementById("treasures-back").onclick = () => {
      document.getElementById("screen-treasures").classList.add("hidden");
      document.getElementById("screen-" + treasuresReturnTo).classList.remove("hidden");
    };
    if (new URLSearchParams(location.search).get("screen") === "treasures") {
      treasuresShow("create");
    }
  });
}
