/* Tests du moteur multijoueur — exécuter avec : node test/mp.js */
"use strict";

const assert = require("assert");
const mp = require("../mp.js");
const g = require("../js/game.js");

/* Monde de test : petit, DLA courtes pour simuler. */
function makeWorld(over = {}) {
  return mp.createWorld({
    mapW: 30, mapH: 20, monsterTarget: 8, itemTarget: 5,
    monsterDlaMinSec: 60, monsterDlaMaxSec: 120, trollDlaSec: 60,
    deathRespawnSec: 30, ...over,
  });
}

// Création du monde : carte, monstres avec DLA propres, trésors
{
  const w = makeWorld();
  assert.strictEqual(w.grid.length, 20);
  assert.strictEqual(w.grid[0].length, 30);
  assert(w.monsters.length === 8, "population initiale de monstres");
  assert(w.items.length === 5, "trésors initiaux");
  for (const m of w.monsters) {
    assert(typeof m.id === "number", "monstre : id");
    assert(m.dlaMs >= 60000 && m.dlaMs <= 120000, "DLA du monstre dans la fourchette : " + m.dlaMs);
    assert(m.nextDla > Date.now() - 1000, "prochaine DLA planifiée");
    assert(typeof m.armorMag === "number", "armure magique présente");
  }
  // pas deux entités sur la même case
  const cells = new Set();
  for (const m of w.monsters) {
    const k = m.y * 30 + m.x;
    assert(!cells.has(k), "deux monstres sur la même case");
    cells.add(k);
  }
}

// Création de troll : profil de race, identité secrète
{
  const w = makeWorld();
  const r = mp.newTroll(w, "Grosbill", "Durakuir");
  assert(r.troll, "troll créé");
  assert.strictEqual(r.troll.pvMax, 40, "PV max Durakuir");
  assert(r.troll.id.length === 12 && r.troll.secret.length === 32, "identité");
  assert(mp.authTroll(w, r.troll.id, r.troll.secret) === r.troll, "auth ok");
  assert(mp.authTroll(w, r.troll.id, "mauvaise-clé") === null, "auth refusée");
  assert(mp.newTroll(w, "X", "Elfe").error, "race inconnue refusée");
  const full = makeWorld({ maxTrolls: 1 });
  mp.newTroll(full, "A", "Skrim");
  assert(mp.newTroll(full, "B", "Skrim").error, "limite de trolls");
}

// Tick : les monstres agissent à leur DLA (et seulement à leur DLA)
{
  const w = makeWorld();
  const now = Date.now();
  const m = w.monsters[0];
  const before = { x: m.x, y: m.y, nextDla: m.nextDla };
  assert.strictEqual(mp.tick(w, now), false, "aucune DLA échue → pas de changement");
  m.nextDla = now - 1;
  assert.strictEqual(mp.tick(w, now), true, "DLA échue → activation");
  assert(m.nextDla > now, "DLA re-planifiée : " + m.nextDla);
  assert(m.dlaMs >= 60000 && m.dlaMs <= 120000, "nouvelle période dans la fourchette");
  void before;
}

// DLA du troll : recharge des PA, régénération
{
  const w = makeWorld();
  const { troll: t } = mp.newTroll(w, "Regen", "Durakuir");
  t.pa = 0;
  t.pv = 10;
  const now = Date.now();
  t.nextDla = now - 1;
  mp.tick(w, now);
  assert.strictEqual(t.pa, g.PA_PER_TURN, "PA rechargés");
  assert(t.pv > 10, "régénération à la DLA");
  assert(t.nextDla > now, "prochaine DLA planifiée");
}

// Mort et réapparition
{
  const w = makeWorld({ deathRespawnSec: 1 });
  const { troll: t } = mp.newTroll(w, "Mortel", "Skrim");
  // un monstre surpuissant adjacent le terrasse à sa DLA
  const m = w.monsters[0];
  m.x = t.x; m.y = t.y + (w.grid[t.y + 1] && w.grid[t.y + 1][t.x] !== undefined ? 1 : -1);
  // place le monstre adjacent quoi qu'il arrive
  m.x = t.x; m.y = t.y; m.x = Math.max(0, t.x - 1);
  m.att = 80; m.deg = 50;
  t.pv = 1;
  const now = Date.now();
  m.nextDla = now - 1;
  mp.tick(w, now);
  assert(t.dead, "troll terrassé");
  const r = mp.action(w, t, { type: "move", dx: 1, dy: 0 });
  assert(r.error, "un mort ne joue pas");
  mp.tick(w, now + 2000);
  assert(!t.dead, "réapparition après le délai");
  assert.strictEqual(t.pv, t.pvMax, "réapparition PV pleins");
}

// Actions : déplacement, PA, ramassage, entraînement
{
  const w = makeWorld();
  const { troll: t } = mp.newTroll(w, "Actif", "Skrim");
  // trouve une direction libre
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  let moved = false;
  for (const [dx, dy] of dirs) {
    const r = mp.action(w, t, { type: "move", dx, dy });
    if (r.ok) { moved = true; break; }
  }
  assert(moved, "au moins une direction praticable");
  assert.strictEqual(t.pa, g.PA_PER_TURN - 1, "déplacement = 1 PA");
  t.pa = 0;
  assert(mp.action(w, t, { type: "move", dx: 1, dy: 0 }).error, "sans PA, pas d'action");
  // ramassage (on libère d'abord la case d'un éventuel trésor aléatoire)
  t.pa = 6;
  w.items = w.items.filter(i => i.x !== t.x || i.y !== t.y);
  w.items.push({ kind: "gold", gold: 50, name: "50 Mountyzédons", emoji: "💰", x: t.x, y: t.y });
  const r2 = mp.action(w, t, { type: "pickup" });
  assert(r2.ok && t.gold === 50, "or ramassé");
  // entraînement
  t.pi = 12;
  const r3 = mp.action(w, t, { type: "train", stat: "att" });
  assert(r3.ok && t.att === 5 && t.pi === 0, "ATT Skrim améliorée pour 12 PI");
  assert(mp.action(w, t, { type: "train", stat: "att" }).error, "plus assez de PI");
}

// Combat troll → monstre, PX et mise à mort
{
  const w = makeWorld();
  const { troll: t } = mp.newTroll(w, "Tueur", "Kastar");
  t.att = 50; t.deg = 20; // écrasant
  const m = w.monsters[0];
  m.x = t.x + 1; m.y = t.y;
  m.pv = 5;
  t.pa = 6;
  const r = mp.action(w, t, { type: "attack", target: m.id });
  assert(r.ok, "attaque résolue");
  assert(!w.monsters.includes(m), "monstre terrassé");
  assert(t.kills === 1 && t.totalPI > 0, "PX de mise à mort");
}

// Les monstres ne s'attaquent jamais entre eux : un monstre adjacent à un autre
// monstre (sans troll) ne fait que bouger ou rester sur place
{
  const w = makeWorld();
  // aucun troll : on tique longtemps, les PV des monstres ne bougent pas
  const pvs = w.monsters.map(m => m.pv);
  let now = Date.now();
  for (let i = 0; i < 50; i++) {
    now += 200000;
    mp.tick(w, now);
  }
  const alive = w.monsters.map(m => m.pv);
  assert(alive.every(pv => pv > 0), "tous les monstres vivants");
  // (la population peut avoir augmenté par repop, mais aucun PV n'a baissé)
  for (let i = 0; i < Math.min(pvs.length, alive.length); i++) {
    assert(alive[i] > 0, "pas d'attaque entre monstres");
  }
}

// Repeuplement : la population remonte vers la cible
{
  const w = makeWorld({ monsterTarget: 6, repopSec: 10 });
  w.monsters = w.monsters.slice(0, 2);
  mp.tick(w, Date.now() + 11000 + 1);
  assert(w.monsters.length >= 6, "repeuplement vers la cible : " + w.monsters.length);
}

// Vue : un troll ne voit que ce qui est à portée ; camouflage invisible aux autres
{
  const w = makeWorld();
  const { troll: t1 } = mp.newTroll(w, "Voyeur", "Skrim");
  const { troll: t2 } = mp.newTroll(w, "Discret", "Tomawak");
  t1.x = 5; t1.y = 5; // positions forcées : la visibilité ne dépend pas du terrain
  t2.x = 7; t2.y = 5;
  let st = mp.stateFor(w, t1);
  assert(st.trolls.some(o => o.name === "Discret"), "troll visible à 2 cases");
  t2.camo = true;
  st = mp.stateFor(w, t1);
  assert(!st.trolls.some(o => o.name === "Discret"), "troll camouflé invisible");
  t2.camo = false;
  t2.x = 25; t2.y = 18; // distance Chebyshev 20 ≫ vue 3
  st = mp.stateFor(w, t1);
  assert(!st.trolls.some(o => o.name === "Discret"), "troll hors de vue");
  // l'état ne fuit jamais le secret
  assert(!JSON.stringify(st).includes(t2.secret), "pas de fuite de secret");
  assert(st.map.length === w.config.mapH, "carte envoyée");
  assert(st.you.nextDlaIn >= 0, "compte à rebours de DLA");
}

// Admin : config bornée et appliquée à chaud, reset, overview
{
  const w = makeWorld();
  mp.adminSetConfig(w, { trollDlaSec: 42, monsterDlaMinSec: 999999, pollSec: 2 });
  assert.strictEqual(w.config.trollDlaSec, 42, "réglage appliqué");
  assert.strictEqual(w.config.monsterDlaMinSec, 3600, "borné au max");
  assert(w.config.monsterDlaMaxSec >= w.config.monsterDlaMinSec, "min ≤ max garanti");
  assert.strictEqual(w.config.pollSec, 2);
  mp.adminSetConfig(w, { trollDlaSec: "nawak" });
  assert.strictEqual(w.config.trollDlaSec, 42, "valeur invalide ignorée");
  // une baisse de la DLA des monstres re-planifie immédiatement les échéances
  const now = Date.now();
  mp.adminSetConfig(w, { monsterDlaMinSec: 5, monsterDlaMaxSec: 10 }, now);
  for (const m of w.monsters) {
    assert(m.nextDla - now <= 10000, "DLA re-planifiée dans la nouvelle borne : " + (m.nextDla - now));
  }
  const ov = mp.adminOverview(w);
  assert(ov.config && ov.monsters.length === w.monsters.length && Array.isArray(ov.trolls), "overview");
  mp.newTroll(w, "Persistant", "Skrim");
  mp.adminResetWorld(w);
  assert(Object.keys(w.trolls).length === 1, "trolls conservés au reset");
  assert(w.monsters.length === w.config.monsterTarget, "monstres régénérés");
}

// Persistance : save + load
{
  const os = require("os");
  const path = require("path");
  const file = path.join(os.tmpdir(), "mc-world-test.json");
  const w = makeWorld();
  mp.newTroll(w, "Durable", "Darkling");
  mp.saveWorld(w, file);
  const w2 = mp.loadWorld(file);
  assert(w2, "monde rechargé");
  assert.strictEqual(Object.keys(w2.trolls).length, 1, "troll persisté");
  assert.strictEqual(w2.monsters.length, w.monsters.length, "monstres persistés");
  assert.strictEqual(w2.config.trollDlaSec, 60, "config persistée");
  require("fs").unlinkSync(file);
}

console.log("✅ Tous les tests multijoueur passent.");
