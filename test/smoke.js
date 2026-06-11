/* Tests de fumée du cœur des règles — exécuter avec : node test/smoke.js */
"use strict";

const assert = require("assert");
const g = require("../js/game.js");

// Dés
for (let i = 0; i < 200; i++) {
  const r = g.rollDice(3, 6);
  assert(r.total >= 3 && r.total <= 18, "3D6 hors bornes : " + r.total);
  assert.strictEqual(r.rolls.length, 3);
}

// Combat : un attaquant écrasant doit toucher la plupart du temps. Dégâts en D3.
let hits = 0;
for (let i = 0; i < 500; i++) {
  const r = g.resolveAttack({ att: 10, deg: 3, degBonus: 2 }, { esq: 1, armor: 2 });
  if (r.hit) {
    hits++;
    assert(r.damage >= 1, "dégâts minimum 1");
    assert(r.damage <= 3 * 3 + 2 - 2, "dégâts trop élevés (D3 attendu) : " + r.damage);
  }
}
assert(hits > 450, "10D6 vs 1D6 devrait presque toujours toucher (" + hits + "/500)");

// autoHit : ne rate jamais (Rafale Psychique)
for (let i = 0; i < 50; i++) {
  assert(g.resolveAttack({ att: 1, deg: 1 }, { esq: 10 }, { autoHit: true }).hit, "autoHit doit toucher");
}

// Maîtrise : progresse en cas de succès, plafonnée, jamais au-delà du cap
{
  const talent = { pct: 89 };
  for (let i = 0; i < 200; i++) g.masteryRoll(talent, 90);
  assert(talent.pct <= 90 && talent.pct >= 89, "plafond de maîtrise dépassé : " + talent.pct);
  const sure = { pct: 100 };
  const r = g.masteryRoll(sure, 200);
  assert(r.success && sure.pct > 100, "succès garanti doit faire progresser");
}

// Sortilège : SR borné [10, 90]
assert.strictEqual(g.resolveSpell(100, 0).sr, 90);
assert.strictEqual(g.resolveSpell(0, 100).sr, 10);

// Coûts d'amélioration officiels (Rules_3.php) : N-ième achat = N × coût de base
assert.strictEqual(g.improveCost("att", 0, "Skrim"), 12, "1er dé d'ATT Skrim = 12 PI");
assert.strictEqual(g.improveCost("att", 2, "Skrim"), 36, "3e dé d'ATT Skrim = 36 PI (exemple officiel)");
assert.strictEqual(g.improveCost("att", 0, "Kastar"), 16, "ATT non favorisée = 16 PI");
assert.strictEqual(g.improveCost("deg", 0, "Kastar"), 12, "DEG favorisé Kastar = 12 PI");
assert.strictEqual(g.improveCost("pv", 0, "Durakuir"), 12, "PV favorisés Durakuir = 12 PI");
assert.strictEqual(g.improveCost("vue", 0, "Tomawak"), 12, "Vue favorisée Tomawak = 12 PI");
assert.strictEqual(g.improveCost("reg", 0, "Darkling"), 22, "REG favorisée Darkling = 22 PI");
assert.strictEqual(g.improveCost("reg", 0, "Skrim"), 30, "REG non favorisée = 30 PI");
assert.strictEqual(g.improveCost("armor", 0, "Durakuir"), 30, "Armure = 30 PI pour tous");
assert.strictEqual(g.improveCost("esq", 1, "Tomawak"), 32, "2e dé d'ESQ = 32 PI");

// L'armure naturelle en D3 réduit bien les dégâts
{
  let withArmor = 0, without = 0;
  for (let i = 0; i < 400; i++) {
    withArmor += g.resolveAttack({ att: 10, deg: 5 }, { esq: 1, armor: 0, armorDice: 4 }).damage;
    without += g.resolveAttack({ att: 10, deg: 5 }, { esq: 1, armor: 0 }).damage;
  }
  assert(withArmor < without, "4D3 d'armure naturelle doit réduire les dégâts");
}

// Niveaux : 0 PI → niv 1 ; 20 PI → niv 2 ; 50 PI → niv 3 (20 + 30)
assert.strictEqual(g.levelFromTotalPI(0), 1);
assert.strictEqual(g.levelFromTotalPI(20), 2);
assert.strictEqual(g.levelFromTotalPI(49), 2);
assert.strictEqual(g.levelFromTotalPI(50), 3);

// Les 5 races existent avec stats officielles, compétence et sortilège réservés
assert.strictEqual(Object.keys(g.RACES).length, 5);
for (const r of Object.values(g.RACES)) {
  for (const k of ["att", "esq", "deg", "reg", "pvMax", "vue"]) {
    assert(typeof r.stats[k] === "number", "stat manquante : " + k);
  }
  assert(r.comp && r.comp.name && r.comp.cost > 0, "compétence raciale manquante");
  assert(r.sort && r.sort.name && r.sort.cost > 0, "sortilège racial manquant");
}
// Profils de base officiels (Races_*.php)
assert.deepStrictEqual(g.RACES.Skrim.stats,    { att: 4, esq: 3, deg: 3, reg: 1, pvMax: 30, vue: 3 });
assert.deepStrictEqual(g.RACES.Durakuir.stats, { att: 3, esq: 3, deg: 3, reg: 1, pvMax: 40, vue: 3 });
assert.deepStrictEqual(g.RACES.Kastar.stats,   { att: 3, esq: 3, deg: 4, reg: 1, pvMax: 30, vue: 3 });
assert.deepStrictEqual(g.RACES.Tomawak.stats,  { att: 3, esq: 3, deg: 3, reg: 1, pvMax: 30, vue: 4 });
assert.deepStrictEqual(g.RACES.Darkling.stats, { att: 3, esq: 3, deg: 3, reg: 2, pvMax: 30, vue: 3 });
assert.strictEqual(g.RACES.Skrim.comp.name, "Botte Secrète");
assert.strictEqual(g.RACES.Skrim.sort.name, "Hypnotisme");
assert.strictEqual(g.RACES.Durakuir.comp.name, "Régénération Accrue");
assert.strictEqual(g.RACES.Durakuir.sort.name, "Rafale Psychique");
assert.strictEqual(g.RACES.Kastar.comp.name, "Accélération du Métabolisme");
assert.strictEqual(g.RACES.Kastar.sort.name, "Vampirisme");
assert.strictEqual(g.RACES.Tomawak.comp.name, "Camouflage");
assert.strictEqual(g.RACES.Tomawak.sort.name, "Projectile Magique");
assert.strictEqual(g.RACES.Darkling.comp.name, "Balayage");
assert.strictEqual(g.RACES.Darkling.sort.name, "Siphon des Âmes");

// Génération de caverne : connexe, bordures murées, assez de sol
for (let i = 0; i < 20; i++) {
  const grid = g.generateCavern(g.MAP_W, g.MAP_H);
  let floor = 0;
  for (let y = 0; y < g.MAP_H; y++) {
    for (let x = 0; x < g.MAP_W; x++) {
      if (grid[y][x] === g.T_FLOOR) floor++;
      const border = x === 0 || y === 0 || x === g.MAP_W - 1 || y === g.MAP_H - 1;
      if (border) assert.strictEqual(grid[y][x], g.T_WALL, "bordure non murée");
    }
  }
  assert(floor > 50, "caverne trop petite : " + floor + " cases de sol");
  const region = g.largestRegion(grid, g.MAP_W, g.MAP_H);
  assert.strictEqual(region.size, floor, "caverne non connexe");
}

// Monstres : niveaux et stats positifs à toutes les profondeurs
for (let depth = 1; depth <= 5; depth++) {
  for (let i = 0; i < 50; i++) {
    const m = g.makeMonster(depth, 1, 1);
    assert(m.level >= 1 && m.pv >= 1 && m.att >= 1 && m.deg >= 1, "monstre invalide : " + JSON.stringify(m));
  }
}

// Specs d'éditeur → entités de jeu
const gob = g.monsterFromSpec({ x: 2, y: 3, type: 0, tpl: 2 });
assert.strictEqual(gob.name, "Vieux Gobelin");
assert.strictEqual(gob.x, 2);
const boss = g.monsterFromSpec({ x: 1, y: 1, boss: true });
assert.strictEqual(boss.name, "Béhémoth");
assert(boss.pv === boss.pvMax && boss.pv > 0);
const pot = g.itemFromSpec({ x: 1, y: 1, kind: "potion" });
assert.strictEqual(pot.kind, "potion");
const sword = g.itemFromSpec({ x: 1, y: 1, kind: "weapon", idx: 2 });
assert.strictEqual(sword.kind, "gear");
assert(sword.bonus > 0);

// Validation serveur des niveaux
const srv = require("../server.js");
const goodGrid = [];
for (let y = 0; y < srv.MAP_H; y++) {
  const border = y === 0 || y === srv.MAP_H - 1;
  goodGrid.push(border ? "#".repeat(srv.MAP_W) : "#" + ".".repeat(srv.MAP_W - 2) + "#");
}
const goodLevel = {
  name: "Test", author: "perco", grid: goodGrid,
  start: { x: 1, y: 1 },
  monsters: [{ x: 2, y: 2, type: 0, tpl: 1 }],
  items: [{ x: 3, y: 3, kind: "potion" }],
};
assert.strictEqual(srv.validateLevel(goodLevel), null);
assert(srv.validateLevel({ ...goodLevel, name: "" }), "nom vide refusé");
assert(srv.validateLevel({ ...goodLevel, monsters: [] }), "niveau sans monstre ni porte ni sortie refusé");

// Portes : valides, et suffisantes comme objectif sans monstre
const door = { x: 4, y: 4, target: "abcdef012345" };
assert.strictEqual(srv.validateLevel({ ...goodLevel, doors: [door] }), null);
assert.strictEqual(srv.validateLevel({ ...goodLevel, monsters: [], doors: [door] }), null, "porte = objectif valable");
assert(srv.validateLevel({ ...goodLevel, doors: [{ x: 4, y: 4, target: "pas-un-id" }] }), "cible de porte invalide refusée");
assert(srv.validateLevel({ ...goodLevel, doors: [{ x: 0, y: 0, target: "abcdef012345" }] }), "porte dans un mur refusée");
const gridWithExit = goodGrid.map((r, y) => y === 5 ? r.slice(0, 5) + ">" + r.slice(6) : r);
assert.strictEqual(srv.validateLevel({ ...goodLevel, monsters: [], grid: gridWithExit }), null, "sortie = objectif valable");
assert(srv.validateLevel({ ...goodLevel, start: { x: 0, y: 0 } }), "départ dans un mur refusé");
assert(srv.validateLevel({ ...goodLevel, grid: goodGrid.slice(1) }), "grille tronquée refusée");
assert(srv.validateLevel({ ...goodLevel, monsters: [{ x: 0, y: 0, type: 0, tpl: 0 }] }), "monstre dans un mur refusé");
assert(srv.validateLevel({ ...goodLevel, items: [{ x: 3, y: 3, kind: "nawak" }] }), "objet inconnu refusé");

console.log("✅ Tous les tests de fumée passent.");
