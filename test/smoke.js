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

// Combat : un attaquant écrasant doit toucher la plupart du temps, et jamais l'inverse d'un mur
let hits = 0;
for (let i = 0; i < 500; i++) {
  const r = g.resolveAttack({ att: 10, deg: 3, degBonus: 2 }, { esq: 1, armor: 2 });
  if (r.hit) {
    hits++;
    assert(r.damage >= 1, "dégâts minimum 1");
    assert(r.damage <= 3 * 6 + 2 - 2, "dégâts trop élevés : " + r.damage);
  }
}
assert(hits > 450, "10D6 vs 1D6 devrait presque toujours toucher (" + hits + "/500)");

// Sortilège : SR borné [10, 90]
assert.strictEqual(g.resolveSpell(100, 0).sr, 90);
assert.strictEqual(g.resolveSpell(0, 100).sr, 10);

// Coûts d'amélioration : la race favorisée paie moins cher
const skrimAtt = g.improveCost("att", 3, "Skrim");
const kastarAtt = g.improveCost("att", 3, "Kastar");
assert(skrimAtt < kastarAtt, `Skrim devrait payer son ATT moins cher (${skrimAtt} vs ${kastarAtt})`);

// Niveaux : 0 PI → niv 1 ; 20 PI → niv 2 ; 50 PI → niv 3 (20 + 30)
assert.strictEqual(g.levelFromTotalPI(0), 1);
assert.strictEqual(g.levelFromTotalPI(20), 2);
assert.strictEqual(g.levelFromTotalPI(49), 2);
assert.strictEqual(g.levelFromTotalPI(50), 3);

// Les 5 races existent avec toutes leurs stats
assert.strictEqual(Object.keys(g.RACES).length, 5);
for (const r of Object.values(g.RACES)) {
  for (const k of ["att", "esq", "deg", "reg", "pvMax", "vue"]) {
    assert(typeof r.stats[k] === "number", "stat manquante : " + k);
  }
}

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

console.log("✅ Tous les tests de fumée passent.");
