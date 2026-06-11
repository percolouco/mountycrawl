/* Tests de fumée du cœur des règles — exécuter avec : node test/smoke.js */
"use strict";

const assert = require("assert");
require("../js/potions.js");
const g = require("../js/game.js");
const p = require("../js/potions.js");

// Dés
for (let i = 0; i < 200; i++) {
  const r = g.rollDice(3, 6);
  assert(r.total >= 3 && r.total <= 18, "3D6 hors bornes : " + r.total);
  assert.strictEqual(r.rolls.length, 3);
}

// Combat : un attaquant écrasant doit toucher la plupart du temps. Dégâts en D3,
// doublés sur coup critique (jet d'attaque ≥ 2 × jet d'esquive).
let hits = 0, crits = 0;
for (let i = 0; i < 500; i++) {
  const r = g.resolveAttack({ att: 10, deg: 3, degBonus: 2 }, { esq: 1, armor: 2 });
  if (r.hit) {
    hits++;
    if (r.critical) crits++;
    assert(r.damage >= 1, "dégâts minimum 1");
    const max = (3 * 3 + 2) * (r.critical ? 2 : 1) - 2;
    assert(r.damage <= max, "dégâts trop élevés : " + r.damage + (r.critical ? " (critique)" : ""));
  }
}
assert(hits > 450, "10D6 vs 1D6 devrait presque toujours toucher (" + hits + "/500)");
assert(crits > 0, "10D6 vs 1D6 devrait produire des coups critiques");

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

  // Sous 50 %, même un échec rapporte +1 %
  const novice = { pct: 0 }; // 0 % : échec garanti, mais on apprend quand même
  const rf = g.masteryRoll(novice, 90);
  assert(!rf.success && rf.gain === 1 && novice.pct === 1, "échec sous 50 % doit donner +1 %");
  for (let i = 0; i < 500; i++) g.masteryRoll(novice, 90);
  assert(novice.pct === 90, "la maîtrise doit finir au plafond à force d'essais : " + novice.pct);

  // À 50 % ou plus, l'échec ne rapporte plus rien (vérifiable à pct=50 : jet 51-100 → échec sec)
  const adept = { pct: 50 };
  for (let i = 0; i < 300; i++) {
    const r2 = g.masteryRoll(adept, 90);
    if (!r2.success) assert(r2.gain === 0, "échec à 50 %+ ne doit rien rapporter");
    adept.pct = 50; // on fige pour garder la condition du test
  }
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

// PX de mise à mort : 10 + 2 × (niveau cible − niveau troll) + niveau cible
assert.strictEqual(g.killPX(1, 5), 23, "troll niv 1 vs cible niv 5");
assert.strictEqual(g.killPX(5, 5), 15, "même niveau");
assert.strictEqual(g.killPX(60, 1), -107, "troll niv 60 vs cible niv 1 → négatif");
assert.strictEqual(g.killPX(3, 1), 7, "troll niv 3 vs cible niv 1");

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
assert(p.POTION_IDS.length === 25, "25 potions droppables");
assert.strictEqual(p.POTION_DEFS.guerison.duration, 0);
assert.strictEqual(p.corruptionYZ(3).y, 0);
{ const { y } = p.corruptionYZ(6); assert(y >= 11 && y <= 20, "Y pour X=6 : " + y); }
{
  const troll = { att: 3, esq: 3, deg: 3, reg: 1, vue: 3, armor: 0, armorDice: 0, degBonus: 0, pvMax: 30, pv: 20, potionEffects: [], blockCamoTurns: 0, tour: 1 };
  const item = p.makePotionItem("bonneBouffe", 5);
  p.drinkPotion(troll, item, g.rollDice, () => {});
  assert.strictEqual(troll.potionEffects.length, 1);
  assert.strictEqual(p.effTroll(troll).deg, 8);
  assert.strictEqual(p.effTroll(troll).attFlat, 0, "Bonne Bouffe ne modifie pas ATT");
  const fixedRoll = () => ({ total: 12, rolls: [4, 4, 4] });
  const t2 = { att: 3, esq: 3, deg: 3, reg: 1, vue: 3, armor: 0, armorDice: 0, degBonus: 0, pvMax: 30, pv: 20, potionEffects: [], blockCamoTurns: 0, tour: 1 };
  p.drinkPotion(t2, p.makePotionItem("fertilite", 5), fixedRoll, () => {});
  assert.strictEqual(p.effTroll(t2).attFlat, 12, "Fertilité +5D3 → +12 sur le jet");
  assert.strictEqual(p.effTroll(t2).att, 3);
  const t3 = { att: 3, esq: 3, deg: 3, reg: 1, vue: 3, armor: 0, armorDice: 0, degBonus: 0, pvMax: 30, pv: 20, potionEffects: [], blockCamoTurns: 0, tour: 1 };
  p.drinkPotion(t3, p.makePotionItem("sangToh", 2), fixedRoll, () => {});
  assert.strictEqual(p.effTroll(t3).attFlat, 12, "2D3 fixé → +12 sur le jet d'attaque");
  assert.strictEqual(p.effTroll(t3).esqFlat, 12);
  assert.strictEqual(p.effTroll(t3).att, 3);
  // Le jet de la potion est unique : même valeur sur ATT et ESQ, bornée par XD3
  for (let i = 0; i < 50; i++) {
    const t4 = { att: 3, esq: 3, deg: 3, reg: 1, vue: 3, armor: 0, armorDice: 0, degBonus: 0, pvMax: 30, pv: 20, potionEffects: [], blockCamoTurns: 0, tour: 1 };
    p.drinkPotion(t4, p.makePotionItem("sangToh", 4), g.rollDice, () => {});
    const e4 = p.effTroll(t4);
    assert.strictEqual(e4.attFlat, e4.esqFlat, "Sang de Toh Réroh : un seul jet pour ATT et ESQ");
    assert(e4.attFlat >= 4 && e4.attFlat <= 12, "4D3 borné [4,12] : " + e4.attFlat);
  }
  p.tickPotionTurns(troll, () => {});
  assert.strictEqual(troll.tour, 2);
  troll.potionEffects[0].turnsLeft = 0;
  p.tickPotionTurns(troll, () => {});
  assert.strictEqual(troll.potionEffects.length, 0);
  assert.strictEqual(p.effTroll(troll).deg, 3);
  assert.strictEqual(p.effTroll(troll).attFlat, 0);
}
// DjhinTonik : +X dés de DEG et REG (pas un jet D3)
{
  const t = { att: 3, esq: 3, deg: 4, reg: 1, vue: 3, armor: 0, armorDice: 0, degBonus: 0, pvMax: 30, pv: 20, potionEffects: [], blockCamoTurns: 0, tour: 1 };
  p.drinkPotion(t, p.makePotionItem("djhinTonik", 5), g.rollDice, () => {});
  assert.strictEqual(p.effTroll(t).deg, 9, "DEG 4 + 5 dés potion = 9D3");
  assert.strictEqual(p.effTroll(t).reg, 6, "REG 1 + 5 dés potion = 6D3");
}
// Jet d'attaque : bonus potion ajouté au total des D6
{
  const r = g.resolveAttack({ att: 3, attFlat: 12, deg: 2, degBonus: 0 }, { esq: 1 });
  assert.strictEqual(r.attFlat, 12);
  assert(r.attRoll > 12, "attRoll = somme des D6 + bonus potion");
  assert(r.attRoll <= 12 + 18, "attRoll borné (3D6 max 18 + 12)");
}
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

// Vue : mémoire du brouillard conservée, entités seulement à portée actuelle
{
  g.newGame("Test", "Skrim");
  const t = g.state.troll;
  t.x = 5; t.y = 5;
  const farKey = 5 * g.MAP_W + 10;
  t.potionEffects = [{ name: "Test", emoji: "🔭", turnsLeft: 1, vue: 5 }];
  g.refreshFov();
  assert(g.inSightAt(10, 5), "vue 8 (3+5) doit voir à 5 cases");
  assert(g.state.seen.has(farKey), "case lointaine mémorisée");
  t.potionEffects = [];
  g.refreshFov();
  assert(!g.inSightAt(10, 5), "vue 3 ne voit plus à 5 cases");
  assert(g.state.seen.has(farKey), "mémoire conservée (affichage sombre)");
  assert(g.inSightAt(8, 5), "vue 3 voit encore à 3 cases");
}

console.log("✅ Tous les tests de fumée passent.");
