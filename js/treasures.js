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
  ["corruption",  "3 à 7",            "5 tours",  ["ATT +X D3", "ESQ −X D3", "DEG +X", "REG −X", "VUE −X", "Armure mag. +X", "RM −Y %, MM −Z % (selon X)"]],
  ["djhinTonik",  "1 à 5",            "4 tours",  ["DEG +X", "REG +X", "PV +2D3 (immédiat)"]],
  ["doverPowa",   "11 à 100",         "2 tours",  ["MM +Y %", "RM −X %"]],
  ["fertilite",   "3 à 7",            "5 tours",  ["ATT +X D3", "DEG +X"]],
  ["feu",         "3 à 7",            "5 tours",  ["ESQ +X D3", "VUE +X"]],
  ["glacier",     "3 à 7",            "5 tours",  ["REG +X", "Armure mag. +X"]],
  ["grippe",      "3 à 4",            "3 tours",  ["ATT −X D3", "ESQ −X D3", "DEG −X", "REG −X"]],
  ["guerison",    "1 à 5",            "immédiat", ["PV +2·X D3"]],
  ["kouleMann",   "1 à 5",            "4 tours",  ["REG +X", "VUE +X", "PV +(X/2) D3 (immédiat)"]],
  ["longueVue",   "1, 2, 3, 5 ou 8",  "3 tours",  ["VUE +X"]],
  ["metomol",     "1 à 5",            "2 tours",  ["TOUR accéléré : +X PA par tour", "Armure mag. −2·X"]],
  ["painture",    "1 à 5",            "X tours",  ["Visible — camouflage impossible"]],
  ["pneumonie",   "5 (fixe)",         "3 tours",  ["ATT −5 D3", "ESQ −5 D3", "DEG −5", "REG −5"]],
  ["pufPuff",     "1 à 3",            "3 tours",  ["ATT −X D3", "ESQ −X D3", "VUE −(X+1)", "PV −2D3 si X ≥ 2", "Effet de Zone"]],
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

/* Carte d'un template de drop : ses bonus, lus directement sur la ligne BDD
 * (mêmes clés que les mods d'équipement, donc on réutilise GEAR_MOD_LABELS). */
function templateCard(t) {
  const fx = [];
  for (const [key, label, unit] of GEAR_MOD_LABELS) {
    const v = t[key];
    if (!v) continue;
    fx.push(`<span class="tz-fx ${v > 0 ? "tz-good" : "tz-bad"}">${label} ${v > 0 ? "+" : "−"}${Math.abs(v)}${unit}</span>`);
  }
  if (!fx.length) fx.push('<span class="tz-fx">aucun bonus (titre honorifique)</span>');
  return `
    <div class="tz-card" style="--tz-color:#7a5c9e">
      <div class="tz-head"><span class="tz-name">✨ ${t.name}</span></div>
      <div class="tz-fx-list">${fx.join("")}</div>
    </div>`;
}

/* Carte d'un monstre du bestiaire : blason + stats (plages) + âges + capacités. */
function monsterCard(m) {
  const rg = (a, b, s = "") => (a === b ? `${a}${s}` : `${a}-${b}${s}`);
  const ages = BESTIARY_AGE_NAMES[m.family] || [];
  const ageTxt = m.minAge === m.maxAge ? (ages[m.minAge] || "—")
    : `${ages[m.minAge] || m.minAge} → ${ages[m.maxAge] || m.maxAge}`;
  const fx = [
    `<span class="tz-fx">PV ${rg(m.pvMin, m.pvMax)}</span>`,
    `<span class="tz-fx">ATT ${rg(m.attMin, m.attMax, "D6")}</span>`,
    `<span class="tz-fx">ESQ ${rg(m.esqMin, m.esqMax, "D6")}</span>`,
    `<span class="tz-fx">DEG ${rg(m.degMin, m.degMax, "D3")}</span>`,
    `<span class="tz-fx">REG ${rg(m.regMin, m.regMax, "D3")}</span>`,
    `<span class="tz-fx">Arm.phy ${rg(m.armPhysMin, m.armPhysMax)}</span>`,
  ];
  if (m.armMagMax) fx.push(`<span class="tz-fx">Arm.mag ${rg(m.armMagMin, m.armMagMax)}</span>`);
  fx.push(`<span class="tz-fx">Vue ${rg(m.vueMin, m.vueMax)}</span>`,
    `<span class="tz-fx">MM ${rg(m.mmMin, m.mmMax)}</span>`,
    `<span class="tz-fx">RM ${rg(m.rmMin, m.rmMax)}</span>`);
  const tags = [];
  if (m.fly) tags.push("Vole");
  if (m.ranged) tags.push("À distance");
  if (m.magic) tags.push("Att. magique");
  if (m.seesHidden) tags.push("Voit le caché");
  if (m.nbAtt > 1) tags.push(m.nbAtt + " att./tour");
  if (m.speed && m.speed !== "Normale") tags.push("Vitesse " + m.speed);
  for (const t of tags) fx.push(`<span class="tz-fx tz-good">${t}</span>`);
  if (m.capacities) fx.push(`<span class="tz-fx tz-bad">${m.capacities}</span>`);
  const img = m.blason ? `<img class="tz-blason" src="${m.blason}" alt="" loading="lazy" onerror="this.style.display='none'">` : "";
  return `
    <div class="tz-card" style="--tz-color:#8a3030">
      <div class="tz-head">${img}<span class="tz-name">${m.name}</span></div>
      <div class="tz-meta">Niveau <b>${rg(m.levelMin, m.levelMax)}</b> · Âge : <b>${ageTxt}</b></div>
      <div class="tz-fx-list">${fx.join("")}</div>
    </div>`;
}

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
    Tous les bonus/malus des potions et parchemins sont <b>magiques</b> — leur armure est de
    l'<b>armure magique</b>, seule à réduire les dégâts magiques.
    1 tour = 1 DLA. Boire une potion ou lire un parchemin coûte <b>1 PA</b>.</p>`;

  const templates = TEMPLATES_DB || [];
  html += `<nav class="tz-nav">
    <a href="#tz-sec-potions">🧪 Potions</a>
    <a href="#tz-sec-scrolls">📜 Parchemins</a>
    <a href="#tz-sec-gear">⚔️ Équipement</a>
    <a href="#tz-sec-templates">✨ Templates</a>
    <a href="#tz-sec-bestiary">🐲 Bestiaire</a>
  </nav>`;

  html += `<h2 class="tz-section" id="tz-sec-potions">🧪 Potions (${TREASURE_POTIONS.length})</h2><div class="tz-grid">`;
  for (const [id, x, duration, fx] of TREASURE_POTIONS) {
    html += treasureCard(POTION_DEFS[id], powerLabel(x, POTIONS_DB && POTIONS_DB[id]), duration, fx);
  }
  html += "</div>";

  html += `<h2 class="tz-section" id="tz-sec-scrolls">📜 Parchemins standards (${TREASURE_SCROLLS.length})</h2><div class="tz-grid">`;
  for (const [id, x, duration, fx] of TREASURE_SCROLLS) {
    html += treasureCard(SCROLL_DEFS[id], powerLabel(x, SCROLLS_DB && SCROLLS_DB[id]), duration, fx);
  }
  html += "</div>";

  // Source des équipements : la base de référence (BDD SQLite, éditable) si elle
  // a pu être chargée, sinon les valeurs statiques de gear.js (ex. hors-ligne).
  const gearSource = GEAR_DB || GEAR;
  const gearCount = Object.values(gearSource).reduce((n, list) => n + list.length, 0);
  html += `<h2 class="tz-section" id="tz-sec-gear">⚔️ Équipement (${gearCount})</h2>
    <p class="tz-intro">Six emplacements : ${Object.values(GEAR_SLOTS).map(s => s.label).join(", ")}.
    Les bonus d'équipement sont <b>fixes</b> (jamais en dés) et s'ajoutent toujours aux jets.
    La plupart sont <b>physiques</b> ; certains objets portent aussi des bonus <b>magiques</b>
    (ATT mag., DEG mag., Armure mag.), et les deux saveurs se cumulent. Les dégâts physiques
    sont encaissés par l'armure totale, les dégâts magiques par la seule armure magique.
    Une arme <b>à 2 mains</b> est incompatible avec un bouclier. S'équiper coûte <b>2 PA</b>.
    Valeurs lues dans la <b>base de référence</b> (modifiables côté admin) ; les objets
    puissants ne se trouvent qu'en profondeur.</p>`;
  for (const [slot, info] of Object.entries(GEAR_SLOTS)) {
    html += `<h3 class="tz-subsection">${info.emoji} ${info.label}s</h3><div class="tz-grid">`;
    for (const def of (gearSource[slot] || [])) {
      const fx = [];
      for (const [key, label, unit] of GEAR_MOD_LABELS) {
        const v = def.mods[key];
        if (!v) continue;
        const cls = v > 0 ? "tz-fx tz-good" : "tz-fx tz-bad";
        fx.push(`<span class="${cls}">${label} ${v > 0 ? "+" : "−"}${Math.abs(v)}${unit}</span>`);
      }
      if (def.twoHanded) fx.push('<span class="tz-fx">2 mains</span>');
      if (def.note) fx.push(`<span class="tz-fx">${def.note}</span>`);
      html += `
        <div class="tz-card" style="--tz-color:#9a8a65">
          <div class="tz-head"><span class="tz-name">${def.emoji} ${def.name}</span></div>
          <div class="tz-meta">Profondeur : <b>−${Math.max(1, def.tier - 1)} et au-delà</b></div>
          <div class="tz-fx-list">${fx.join("")}</div>
        </div>`;
    }
    html += "</div>";
  }

  html += `<h2 class="tz-section" id="tz-sec-templates">✨ Templates de drop (${templates.length})</h2>
    <p class="tz-intro">Suffixes à la MountyHall ajoutés aux objets qui tombent dans le
    monde partagé : un objet reçoit jusqu'à <b>3 templates</b> (<b>6</b> pour une arme à
    2 mains), chacun tiré au hasard selon une probabilité réglable sur la page admin. Leurs
    bonus s'ajoutent à ceux de l'objet (le mod <b>TOUR</b> est en minutes de DLA), et leur
    nom s'accole à celui de l'objet (« Épée Courte <i>de l'Aigle des Mages</i> »).
    Valeurs lues dans la <b>base de référence</b> (modifiables côté admin).</p>`;
  if (templates.length) {
    html += `<div class="tz-grid">${templates.map(templateCard).join("")}</div>`;
  } else {
    html += `<p class="tz-note">Liste indisponible (base non joignable).</p>`;
  }

  const bestiary = BESTIARY_DB || [];
  html += `<h2 class="tz-section" id="tz-sec-bestiary">🐲 Bestiaire (${bestiary.length})</h2>
    <p class="tz-intro">Les créatures du Hall. Chaque monstre est défini par ses
    <b>stats de base</b> (l'âge le plus jeune, en plages) ; en vieillissant il gagne
    en puissance (multiplicateurs d'âge réglables côté admin). Les stats affichées
    sont des <b>plages</b> tirées au hasard à chaque apparition.</p>`;
  if (bestiary.length) {
    const fams = [...new Set(bestiary.map(m => m.family))].sort();
    for (const fam of fams) {
      const list = bestiary.filter(m => m.family === fam);
      html += `<h3 class="tz-subsection">${FAMILY_EMOJI[fam] || "🐾"} ${fam} (${list.length})</h3><div class="tz-grid">${list.map(monsterCard).join("")}</div>`;
    }
  } else {
    html += `<p class="tz-note">Bestiaire indisponible (base non joignable).</p>`;
  }

  html += `<p class="tz-note">Effet de Zone : touche le lecteur et tous les monstres à 3 cases
    ou moins. « PV −2D3 ou −4D3 » (Rune des Foins) : la Mountypedia note « -2/4 D3 », interprété
    ici comme un tirage au sort entre 2D3 et 4D3.</p>`;

  body.innerHTML = html;
}

let treasuresReturnTo = "create";

// Données de la base de référence (BDD), rechargées à chaque ouverture pour
// refléter les éditions (admin OU sqlite-web) ; null tant qu'on n'a pas (ou pas
// pu) charger → repli sur les valeurs statiques du code.
let GEAR_DB = null, POTIONS_DB = null, SCROLLS_DB = null, TEMPLATES_DB = null, BESTIARY_DB = null;

// Noms d'âge par famille (table de Perco) — pour afficher la fourchette d'âges.
const BESTIARY_AGE_NAMES = {
  Insecte: ["Larve", "Immature", "Juvénile", "Imago", "Développé", "Mûr", "Accompli", "Achevé"],
  Animal: ["Bébé", "Enfançon", "Jeune", "Adulte", "Mature", "Chef de harde", "Ancien", "Ancêtre"],
  "Démon": ["Initial", "Novice", "Mineur", "Favori", "Majeur", "Supérieur", "Suprême", "Ultime"],
  Humanoide: ["Nouveau", "Jeune", "Adulte", "Vétéran", "Briscard", "Doyen", "Légendaire", "Mythique"],
  Monstre: ["Nouveau", "Jeune", "Adulte", "Vétéran", "Briscard", "Doyen", "Légendaire", "Mythique"],
  "Mort-Vivant": ["Naissant", "Récent", "Ancien", "Vénérable", "Séculaire", "Antique", "Ancestral", "Antédiluvien"],
};
const FAMILY_EMOJI = { Insecte: "🐛", Animal: "🐾", "Démon": "👿", Humanoide: "🧝", Monstre: "👹", "Mort-Vivant": "💀" };

async function fetchRef(cat) {
  try {
    const res = await fetch("api/reference/" + cat);
    if (!res.ok) return null;
    const rows = await res.json();
    return Array.isArray(rows) && rows.length ? rows : null;
  } catch {
    return null; // base injoignable (ex. ouverture en file://)
  }
}

async function loadReference() {
  const [gear, potions, scrolls, templates, bestiary] = await Promise.all([
    fetchRef("gear"), fetchRef("potions"), fetchRef("scrolls"), fetchRef("templates"), fetchRef("bestiary"),
  ]);
  BESTIARY_DB = bestiary;
  GEAR_DB = gear ? gearBySlotFromRows(gear) : null;
  POTIONS_DB = potions ? indexPowerById(potions) : null;
  SCROLLS_DB = scrolls ? indexPowerById(scrolls) : null;
  TEMPLATES_DB = templates;
}

function gearBySlotFromRows(rows) {
  const bySlot = {};
  for (const r of rows) {
    const mods = {};
    for (const [key] of GEAR_MOD_LABELS) mods[key] = r[key] || 0;
    const staticDef = (GEAR[r.slot] || []).find(d => d.name === r.name);
    (bySlot[r.slot] = bySlot[r.slot] || []).push({
      emoji: r.emoji, name: r.name, tier: r.tier, twoHanded: !!r.twoHanded,
      note: staticDef && staticDef.note, mods,
    });
  }
  return bySlot;
}

function indexPowerById(rows) {
  const map = {};
  for (const r of rows) map[r.id] = { min: r.powerMin, max: r.powerMax };
  return map;
}

// Libellé « Niveau X » : on remplace par la plage BDD (min/max) UNIQUEMENT pour
// les plages numériques simples « A à B » ; les libellés spéciaux (« — »,
// « 5 (fixe) », « 1, 2, 3, 5 ou 8 »…) sont conservés tels quels car la base ne
// stocke qu'un min/max qui ne saurait les représenter.
function powerLabel(staticLabel, range) {
  if (!range || !/^\d+ à \d+$/.test(staticLabel)) return staticLabel;
  return range.min === range.max ? `${range.min} (fixe)` : `${range.min} à ${range.max}`;
}

async function treasuresShow(from) {
  treasuresReturnTo = from;
  document.getElementById("screen-" + from).classList.add("hidden");
  document.getElementById("screen-treasures").classList.remove("hidden");
  window.scrollTo(0, 0);
  await loadReference();
  treasuresRender();
}

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("btn-treasures").onclick = () => treasuresShow("create");
    document.getElementById("btn-treasures-game").onclick = () => treasuresShow("game");
    document.getElementById("treasures-back").onclick = () => {
      document.getElementById("screen-treasures").classList.add("hidden");
      document.getElementById("screen-" + treasuresReturnTo).classList.remove("hidden");
    };
    // Bouton « remonter en haut » : visible dès qu'on a un peu défilé.
    const topBtn = document.getElementById("tz-top");
    if (topBtn) {
      topBtn.onclick = () => window.scrollTo({ top: 0, behavior: "smooth" });
      window.addEventListener("scroll", () => {
        const onTz = !document.getElementById("screen-treasures").classList.contains("hidden");
        topBtn.classList.toggle("hidden", !onTz || window.scrollY < 400);
      });
    }
    if (new URLSearchParams(location.search).get("screen") === "treasures") {
      treasuresShow("create");
    }
  });
}
