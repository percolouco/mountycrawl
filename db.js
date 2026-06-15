/* Base de référence MountyCrawl — SQLite natif de Node (node:sqlite), toujours
 * zéro dépendance npm. Elle contient les VALEURS DE RÉFÉRENCE du monde partagé :
 * bestiaire, équipement, fourchettes de puissance des potions et parchemins.
 * Chaque spawn/drop du serveur relit la base : une modification (page admin ou
 * n'importe quel éditeur SQLite sur le fichier) est prise en compte à chaud.
 * L'état vivant du monde (trolls, monstres actifs, objets au sol) reste dans
 * world.json — seule la référence vit ici.
 *
 * Au premier démarrage la base est créée et remplie avec les valeurs vanilla
 * (Mountypedia) ; ensuite les lignes existantes ne sont JAMAIS écrasées au
 * démarrage (les retouches survivent aux mises à jour du jeu, et les nouveaux
 * objets/monstres d'une future version sont ajoutés avec INSERT OR IGNORE). */

"use strict";

const { DatabaseSync } = require("node:sqlite");

const g = require("./js/game.js");
const p = require("./js/potions.js");
const sc = require("./js/scrolls.js");
const gearLib = require("./js/gear.js");
const bestiaryLib = require("./js/bestiary.js");

// Bestiaire complet (demande Perco) : 1 ligne par monstre (stats de base = âge
// le plus jeune, en plages min/max) + une table d'âges (multiplicateurs).
const BESTIARY_STATS = ["level", "pv", "att", "esq", "deg", "reg", "armPhys", "armMag", "vue", "mm", "rm"];
const BESTIARY_RANGE_KEYS = BESTIARY_STATS.flatMap(k => [k + "Min", k + "Max"]);
const BESTIARY_INT_KEYS = [...BESTIARY_RANGE_KEYS, "minAge", "maxAge", "fly", "ranged", "magic", "seesHidden", "nbAtt"];
const BESTIARY_TXT_KEYS = ["family", "speed", "capacities", "blason", "gender"];
const BESTIARY_KEYS = [...BESTIARY_INT_KEYS, ...BESTIARY_TXT_KEYS]; // hors `name` (clé)

const MONSTER_KEYS = ["level", "att", "attMag", "esq", "deg", "degMag", "pv", "armor", "armorMag", "vue"];
const GEAR_KEYS = ["att", "attMag", "esq", "deg", "degMag", "reg", "arm", "armMag", "vue", "pv", "rmPct", "mmPct"];

/* Templates de drop façon MountyHall : des suffixes (« de l'Aigle », « des
 * Mages »…) ajoutés aléatoirement à l'équipement qui tombe, selon une proba
 * réglable côté admin. Leurs bonus s'ajoutent aux mods de l'objet ; `tour` est
 * un modificateur de TOUR (DLA) propre aux templates. */
const TEMPLATE_KEYS = ["att", "attMag", "esq", "vue", "deg", "degMag", "arm", "armMag", "rmPct", "mmPct", "reg", "pv", "tour"];
const VANILLA_TEMPLATES = [
  [1, "de l'Aigle", [0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
  [2, "des Béhémoths", [0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 30]],
  [3, "des Cyclopes", [0, 1, 0, -1, 0, 1, 0, 0, 0, 0, 0, 0, 0]],
  [4, "des Enragés", [0, 1, -1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0]],
  [5, "de Feu", [0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0]],
  [6, "des Mages", [0, 0, 0, 0, 0, 0, 0, 0, 5, 5, 0, 0, 0]],
  [7, "de l'Orage", [0, 0, 2, 0, 0, -1, 0, 0, 0, 0, 0, 0, 0]],
  [8, "de l'Ours", [0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 5, 30]],
  [9, "du Pic", [0, 0, -1, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0]],
  [10, "du Rat", [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
  [11, "de Résistance", [0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0]],
  [12, "de la Salamandre", [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0]],
  [13, "du Temps", [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -30]],
  [14, "de la Terre", [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 5, 30]],
  [15, "du Sable", [0, 0, 3, -1, 0, 0, 0, -1, 0, 0, 0, 0, 0]],
  [16, "des Vampires", [0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0]],
  [17, "des Duellistes", [0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
  [18, "des Champions", [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
  [19, "des Anciens", [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
];

/* Fourchettes de puissance « niveau X » vanilla (Mountypedia). La Longue-Vue
 * vanilla tire dans {1,2,3,5,8} : tant que sa fourchette en base reste celle
 * d'origine, on garde le tirage officiel. */
const POTION_POWER_DEFAULTS = {
  biskot: [0, 0], doverPowa: [11, 100], bonneBouffe: [3, 7], corruption: [3, 7],
  fertilite: [3, 7], feu: [3, 7], longueVue: [1, 8], kouleMann: [1, 5],
  djhinTonik: [1, 5], glacier: [3, 7], calvok: [2, 6], rhume: [1, 2],
  grippe: [3, 4], pneumonie: [5, 5], cervelle: [2, 6], chronometre: [1, 5],
  metomol: [1, 5], guerison: [1, 5], painture: [1, 5], pufPuff: [1, 3],
  sangToh: [1, 5], sinneKhole: [11, 100], toxine: [1, 5], voiputrin: [1, 5],
  zetCrak: [1, 5],
};
const SCROLL_POWER_DEFAULTS = Object.fromEntries(sc.SCROLL_IDS.map(id => [id, [1, 5]]));

let DB = null;

/* ---------- Valeurs vanilla (sources JS du jeu) ---------- */

function vanillaMonsters() {
  return [...g.MONSTER_TYPES, g.BOSS].map(t => ({
    name: t.name, emoji: t.emoji, boss: !!t.boss, static: !!t.static,
    ...Object.fromEntries(MONSTER_KEYS.map(k => [k, t[k] || 0])),
  }));
}

function vanillaGear() {
  return Object.entries(gearLib.GEAR).flatMap(([slot, list]) => list.map(def => ({
    slot, name: def.name, emoji: def.emoji, tier: def.tier, twoHanded: !!def.twoHanded,
    ...Object.fromEntries(GEAR_KEYS.map(k => [k, def.mods[k] || 0])),
  })));
}

function vanillaTemplates() {
  return VANILLA_TEMPLATES.map(([id, name, vals]) => ({
    id, name, ...Object.fromEntries(TEMPLATE_KEYS.map((k, i) => [k, vals[i]])),
  }));
}

function vanillaTreasures(cat) {
  const [ids, defs, ranges] = cat === "potions"
    ? [p.POTION_IDS, p.POTION_DEFS, POTION_POWER_DEFAULTS]
    : [sc.SCROLL_IDS, sc.SCROLL_DEFS, SCROLL_POWER_DEFAULTS];
  return ids.map(id => ({
    id, name: defs[id].name, emoji: defs[id].emoji,
    powerMin: ranges[id][0], powerMax: ranges[id][1],
  }));
}

/* ---------- Ouverture et seed ---------- */

function init(file = ":memory:") {
  if (DB) DB.close();
  DB = new DatabaseSync(file);
  DB.exec("PRAGMA journal_mode = WAL;");
  DB.exec(`
    CREATE TABLE IF NOT EXISTS monsters (
      name TEXT PRIMARY KEY, emoji TEXT, boss INTEGER, isStatic INTEGER,
      level INTEGER, att INTEGER, attMag INTEGER, esq INTEGER,
      deg INTEGER, degMag INTEGER, pv INTEGER,
      armor INTEGER, armorMag INTEGER, vue INTEGER
    );
    CREATE TABLE IF NOT EXISTS gear (
      slot TEXT, name TEXT, emoji TEXT, tier INTEGER, twoHanded INTEGER,
      att INTEGER, attMag INTEGER, esq INTEGER, deg INTEGER, degMag INTEGER,
      reg INTEGER, arm INTEGER, armMag INTEGER, vue INTEGER, pv INTEGER,
      rmPct INTEGER, mmPct INTEGER,
      PRIMARY KEY (slot, name)
    );
    CREATE TABLE IF NOT EXISTS potions (
      id TEXT PRIMARY KEY, name TEXT, emoji TEXT,
      powerMin INTEGER, powerMax INTEGER
    );
    CREATE TABLE IF NOT EXISTS scrolls (
      id TEXT PRIMARY KEY, name TEXT, emoji TEXT,
      powerMin INTEGER, powerMax INTEGER
    );
    CREATE TABLE IF NOT EXISTS templates (
      id INTEGER PRIMARY KEY, name TEXT, ${TEMPLATE_KEYS.map(k => `${k} INTEGER`).join(", ")}
    );
    CREATE TABLE IF NOT EXISTS bestiary (
      name TEXT PRIMARY KEY,
      ${BESTIARY_INT_KEYS.map(k => `${k} INTEGER`).join(", ")},
      ${BESTIARY_TXT_KEYS.map(k => `${k} TEXT`).join(", ")}
    );
    CREATE TABLE IF NOT EXISTS monster_ages (
      age INTEGER PRIMARY KEY, mult REAL
    );
  `);
  // Migration : la colonne `gender` du bestiaire a été ajoutée après coup → on
  // l'ajoute aux bases déjà créées AVANT tout INSERT/UPDATE qui la référence.
  try { DB.exec("ALTER TABLE bestiary ADD COLUMN gender TEXT"); } catch { /* déjà là */ }
  const insM = DB.prepare(`INSERT OR IGNORE INTO monsters
    (name, emoji, boss, isStatic, ${MONSTER_KEYS.join(", ")})
    VALUES (?, ?, ?, ?, ${MONSTER_KEYS.map(() => "?").join(", ")})`);
  for (const m of vanillaMonsters()) {
    insM.run(m.name, m.emoji, m.boss ? 1 : 0, m.static ? 1 : 0, ...MONSTER_KEYS.map(k => m[k]));
  }
  const insG = DB.prepare(`INSERT OR IGNORE INTO gear
    (slot, name, emoji, tier, twoHanded, ${GEAR_KEYS.join(", ")})
    VALUES (?, ?, ?, ?, ?, ${GEAR_KEYS.map(() => "?").join(", ")})`);
  for (const it of vanillaGear()) {
    insG.run(it.slot, it.name, it.emoji, it.tier, it.twoHanded ? 1 : 0, ...GEAR_KEYS.map(k => it[k]));
  }
  for (const cat of ["potions", "scrolls"]) {
    const ins = DB.prepare(`INSERT OR IGNORE INTO ${cat} (id, name, emoji, powerMin, powerMax) VALUES (?, ?, ?, ?, ?)`);
    for (const t of vanillaTreasures(cat)) ins.run(t.id, t.name, t.emoji, t.powerMin, t.powerMax);
  }
  const insT = DB.prepare(`INSERT OR IGNORE INTO templates (id, name, ${TEMPLATE_KEYS.join(", ")})
    VALUES (?, ?, ${TEMPLATE_KEYS.map(() => "?").join(", ")})`);
  for (const t of vanillaTemplates()) insT.run(t.id, t.name, ...TEMPLATE_KEYS.map(k => t[k]));
  const insB = DB.prepare(`INSERT OR IGNORE INTO bestiary (name, ${BESTIARY_KEYS.join(", ")})
    VALUES (?, ${BESTIARY_KEYS.map(() => "?").join(", ")})`);
  for (const b of bestiaryLib.BESTIARY) insB.run(b.name, ...BESTIARY_KEYS.map(k => b[k]));
  const insA = DB.prepare("INSERT OR IGNORE INTO monster_ages (age, mult) VALUES (?, ?)");
  bestiaryLib.AGE_MULT.forEach((mult, age) => insA.run(age, mult));
  // Peuple le genre des lignes déjà présentes (sans genre) depuis la référence.
  const updGender = DB.prepare("UPDATE bestiary SET gender = ? WHERE name = ? AND (gender IS NULL OR gender = '')");
  for (const b of bestiaryLib.BESTIARY) updGender.run(b.gender, b.name);
  // Correctif des bases déjà créées : PufPuff avait été seedé à tort en [0,2]
  // (le niveau 0 d'une potion n'existe pas, minimum 1) → on le ramène à [1,3].
  // Le garde `powerMin = 0` évite d'écraser une plage éditée volontairement.
  DB.prepare("UPDATE potions SET powerMin = 1, powerMax = 3 WHERE id = 'pufPuff' AND powerMin = 0").run();
  return DB;
}

function db() {
  if (!DB) init(process.env.DB_FILE || ":memory:");
  return DB;
}

/* ---------- Lecture (chaque spawn/drop relit la base : modifs à chaud) ---------- */

function monsters() {
  return db().prepare("SELECT * FROM monsters").all().map(r => ({
    ...r, boss: !!r.boss, static: !!r.isStatic, isStatic: undefined,
  }));
}

function gearAll() {
  return db().prepare("SELECT * FROM gear").all().map(r => ({ ...r, twoHanded: !!r.twoHanded }));
}

function gearRow(slot, name) {
  const r = db().prepare("SELECT * FROM gear WHERE slot = ? AND name = ?").get(slot, name);
  return r ? { ...r, twoHanded: !!r.twoHanded } : null;
}

function treasureRange(cat, id) {
  const r = db().prepare(`SELECT powerMin, powerMax FROM ${cat === "scrolls" ? "scrolls" : "potions"} WHERE id = ?`).get(id);
  return r ? [r.powerMin, r.powerMax] : null;
}

function treasuresAll(cat) {
  return db().prepare(`SELECT * FROM ${cat === "scrolls" ? "scrolls" : "potions"}`).all();
}

function templatesAll() {
  return db().prepare("SELECT * FROM templates ORDER BY id").all();
}

function bestiaryAll() {
  return db().prepare("SELECT * FROM bestiary ORDER BY family, name").all();
}

function monsterAges() {
  return db().prepare("SELECT * FROM monster_ages ORDER BY age").all();
}

/* ---------- Écriture (page admin) ---------- */

function setMonster(name, vals) {
  const keys = MONSTER_KEYS.filter(k => vals[k] != null);
  if (!keys.length) return;
  db().prepare(`UPDATE monsters SET ${keys.map(k => `${k} = ?`).join(", ")} WHERE name = ?`)
    .run(...keys.map(k => vals[k]), name);
}

function setGear(slot, name, vals) {
  const keys = GEAR_KEYS.filter(k => vals[k] != null);
  if (!keys.length) return;
  db().prepare(`UPDATE gear SET ${keys.map(k => `${k} = ?`).join(", ")} WHERE slot = ? AND name = ?`)
    .run(...keys.map(k => vals[k]), slot, name);
}

function setTreasureRange(cat, id, [min, max]) {
  db().prepare(`UPDATE ${cat === "scrolls" ? "scrolls" : "potions"} SET powerMin = ?, powerMax = ? WHERE id = ?`)
    .run(min, max, id);
}

function setTemplate(id, vals) {
  const keys = TEMPLATE_KEYS.filter(k => vals[k] != null);
  if (!keys.length) return;
  db().prepare(`UPDATE templates SET ${keys.map(k => `${k} = ?`).join(", ")} WHERE id = ?`)
    .run(...keys.map(k => vals[k]), id);
}

function setBestiary(name, vals) {
  const keys = BESTIARY_KEYS.filter(k => vals[k] != null);
  if (!keys.length) return;
  db().prepare(`UPDATE bestiary SET ${keys.map(k => `${k} = ?`).join(", ")} WHERE name = ?`)
    .run(...keys.map(k => vals[k]), name);
}

function setMonsterAge(age, mult) {
  db().prepare("UPDATE monster_ages SET mult = ? WHERE age = ?").run(mult, age);
}

/* Remet une catégorie entière aux valeurs vanilla. */
function resetCategory(cat) {
  if (cat === "monsters") for (const m of vanillaMonsters()) setMonster(m.name, m);
  if (cat === "gear") for (const it of vanillaGear()) setGear(it.slot, it.name, it);
  if (cat === "templates") for (const t of vanillaTemplates()) setTemplate(t.id, t);
  if (cat === "bestiary") for (const b of bestiaryLib.BESTIARY) setBestiary(b.name, b);
  if (cat === "ages") bestiaryLib.AGE_MULT.forEach((mult, age) => setMonsterAge(age, mult));
  if (cat === "potions" || cat === "scrolls") {
    for (const t of vanillaTreasures(cat)) setTreasureRange(cat, t.id, [t.powerMin, t.powerMax]);
  }
}

module.exports = {
  init, db,
  MONSTER_KEYS, GEAR_KEYS, TEMPLATE_KEYS, BESTIARY_KEYS, POTION_POWER_DEFAULTS, SCROLL_POWER_DEFAULTS,
  vanillaMonsters, vanillaGear, vanillaTreasures, vanillaTemplates,
  monsters, gearAll, gearRow, treasureRange, treasuresAll, templatesAll, bestiaryAll, monsterAges,
  setMonster, setGear, setTreasureRange, setTemplate, setBestiary, setMonsterAge, resetCategory,
};
