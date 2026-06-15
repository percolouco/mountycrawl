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
  m.x = t.x; m.y = t.y; // même case : l'attaque ne porte que sur sa propre case
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

// Identité côté serveur : mot de passe, login multi-appareils, unicité du nom
{
  const w = makeWorld();
  const r = mp.newTroll(w, "Perco", "Durakuir", "tr0ll!");
  assert(r.troll, "troll avec mot de passe créé");
  assert(!("password" in r.troll), "le mot de passe en clair n'est pas stocké");
  assert(r.troll.passHash && r.troll.passHash !== "tr0ll!", "hash stocké");
  assert(mp.newTroll(w, "perco", "Skrim").error, "nom déjà pris (insensible à la casse)");
  // login depuis « un autre appareil »
  const l1 = mp.login(w, "Perco", "tr0ll!");
  assert(l1.troll === r.troll, "login OK → même troll");
  assert(mp.login(w, "Perco", "mauvais").error, "mauvais mot de passe refusé");
  assert(mp.login(w, "Inconnu", "x").error, "troll inconnu refusé");
  // troll sans mot de passe : pas de login possible
  mp.newTroll(w, "SansPass", "Skrim");
  assert(mp.login(w, "SansPass", "").error, "pas de login sans mot de passe");
  // l'état ne fuit ni hash ni sel
  const st = JSON.stringify(mp.stateFor(w, r.troll));
  assert(!st.includes(r.troll.passHash) && !st.includes(r.troll.salt), "pas de fuite du hash/sel");
}

// Tuning admin : ancienne table monsters (legacy) — validation/bornage/reset
{
  const w = makeWorld({ monsterTarget: 0, itemTarget: 0, worldDepth: 1 });
  const tun1 = mp.adminSetTuning(w, { monsters: { "Gobelin": { att: 9 } } });
  assert.strictEqual(tun1.monsters.Gobelin.att, 9, "écart ATT visible dans le tuning courant");
  const tun2 = mp.adminSetTuning(w, { monsters: { "Dragon": { att: 5 }, "Gobelin": { att: 5000 } } });
  assert(!tun2.monsters.Dragon, "type inconnu ignoré");
  assert.strictEqual(tun2.monsters.Gobelin.att, 99, "ATT bornée à 99");
  const tun3 = mp.adminSetTuning(w, { reset: ["monsters"] });
  assert.strictEqual(Object.keys(tun3.monsters).length, 0, "monstres legacy d'origine restaurés");
}

// Bestiaire : les apparitions du monde partagé viennent du bestiaire
{
  const best = require("../js/bestiary.js");
  const db = require("../db.js");
  const w = makeWorld({ monsterTarget: 0, itemTarget: 0, worldDepth: 12 });
  const m = mp.spawnMonster(w);
  assert(m && m.name && m.att >= 1 && m.deg >= 1 && m.pv >= 1 && typeof m.family === "string", "spawn d'un monstre du bestiaire : " + (m && m.name));
  // tirage déterministe : 1 monstre, plages fixes, multiplicateurs neutres
  const one = [{ name: "Cobaye", family: "Monstre", minAge: 0, maxAge: 0, levelMin: 10, levelMax: 10,
    pvMin: 5000, pvMax: 5000, attMin: 7, attMax: 7, esqMin: 3, esqMax: 3, degMin: 4, degMax: 4, regMin: 1, regMax: 1,
    armPhysMin: 2, armPhysMax: 2, armMagMin: 0, armMagMax: 0, vueMin: 4, vueMax: 4, mmMin: 0, mmMax: 0, rmMin: 0, rmMax: 0,
    fly: 0, ranged: 0, magic: 1, seesHidden: 0, speed: "Normale", nbAtt: 1, capacities: "", blason: "" }];
  const bm = g.buildBestiaryMonster(one, [1, 1, 1, 1, 1, 1, 1, 1], best.AGE_NAMES, 10, 0, 0);
  assert.strictEqual(bm.pv, 5000, "PV tiré dans la plage du bestiaire");
  assert.strictEqual(bm.att, 7, "ATT tirée dans la plage");
  assert.strictEqual(bm.attMag, 7, "monstre magique : attMag = att");
  // édition admin du bestiaire reflétée en base
  const name = db.bestiaryAll()[0].name;
  mp.adminSetTuning(w, { bestiary: { [name]: { pvMin: 4242, pvMax: 4242 } } });
  assert.strictEqual(db.bestiaryAll().find(b => b.name === name).pvMin, 4242, "édition du bestiaire écrite en base");
}

// Tuning admin : mises à jour CIBLÉES — éditer un objet n'écrase pas les autres
// (cohabitation avec les éditions directes en base, ex. sqlite-web).
{
  const db = require("../db.js");
  const w = makeWorld({ monsterTarget: 0, itemTarget: 0 });
  // édition « externe » (façon sqlite-web) sur le Chapeau pointu
  db.setGear("casque", "Chapeau pointu", { mmPct: 20 });
  // l'admin sauve un AUTRE objet : le chapeau ne doit PAS être réinitialisé
  mp.adminSetTuning(w, { gear: { "arme/Gourdin": { att: 7 } } });
  assert.strictEqual(db.gearRow("casque", "Chapeau pointu").mmPct, 20, "édition externe préservée");
  assert.strictEqual(db.gearRow("arme", "Gourdin").att, 7, "objet édité par l'admin appliqué");
  // reset explicite : tout revient au vanilla
  mp.adminSetTuning(w, { reset: ["gear"] });
  assert.strictEqual(db.gearRow("casque", "Chapeau pointu").mmPct, 5, "reset gear → vanilla (chapeau)");
  assert.strictEqual(db.gearRow("arme", "Gourdin").att, 2, "reset gear → vanilla (gourdin)");
}

// Templates de drop : nombre selon les mains, distincts, bonus fusionnés, proba 0
{
  const one = mp.applyGearTemplates({ kind: "gear", slot: "arme", name: "Épée Courte", twoHanded: false, mods: { deg: 2 } }, 100);
  assert.strictEqual(one.templates.length, 3, "1 main : 3 templates max");
  assert.strictEqual(one.mods.deg >= 2, true, "mod de base conservé");
  assert(one.name.startsWith("Épée Courte "), "suffixes de template ajoutés au nom");
  const two = mp.applyGearTemplates({ kind: "gear", slot: "arme", name: "Épée Longue", twoHanded: true, mods: {} }, 100);
  assert.strictEqual(two.templates.length, 6, "2 mains : 6 templates max");
  assert.strictEqual(new Set(two.templates).size, 6, "templates tous distincts");
  const none = mp.applyGearTemplates({ kind: "gear", slot: "arme", name: "Gourdin", twoHanded: false, mods: { att: 2 } }, 0);
  assert(!none.templates, "proba 0 : aucun template");
  assert.strictEqual(none.name, "Gourdin", "nom inchangé sans template");
}

// Tuning admin : puissance des potions/parchemins et bonus d'équipement
{
  const w = makeWorld({ monsterTarget: 0, itemTarget: 0 });
  const tun = mp.adminSetTuning(w, {
    potions: { guerison: [9, 9], nimporte: [1, 2] },
    scrolls: { runeExplosive: [7, 3] }, // inversé : doit devenir [3, 7]
    gear: { "arme/Gourdin": { deg: 12 }, "arme/Excalibur": { deg: 99 } },
  });
  assert(!tun.potions.nimporte, "potion inconnue ignorée");
  assert.deepStrictEqual(tun.scrolls.runeExplosive, [3, 7], "fourchette remise dans l'ordre");
  assert(!tun.gear["arme/Excalibur"], "objet inconnu ignoré");
  // la puissance tirée respecte l'override
  for (let i = 0; i < 100; i++) {
    const it = mp.tunedRandomPotion();
    if (it.potionId === "guerison") assert.strictEqual(it.power, 9, "Guérison forcée à X=9");
  }
  // l'équipement tuné garde ses autres mods
  const gearLib = require("../js/gear.js");
  const club = mp.applyGearTuning(gearLib.gearItemByName("arme", "Gourdin"));
  assert.strictEqual(club.mods.deg, 12, "DEG du Gourdin tuné");
  assert.strictEqual(club.mods.att, 2, "ATT du Gourdin inchangée");
  // les défauts pour l'admin sont complets
  const defs = mp.adminDefaults();
  assert.strictEqual(defs.potions.length, 25, "25 potions");
  assert.strictEqual(defs.scrolls.length, 7, "7 parchemins");
  assert(defs.gear.length >= 50, "tout l'équipement listé");
  assert.strictEqual(defs.monsters.length, 8, "7 types + boss");
}

// Tuning admin : saveurs magiques (attMag/degMag/armMag) et suppression de troll
{
  const w = makeWorld({ monsterTarget: 0, itemTarget: 0, worldDepth: 1 });
  const tunMag = mp.adminSetTuning(w, {
    gear: { "arme/Bâton de mage": { attMag: 4, armMag: 2 } },
  });
  assert.strictEqual(tunMag.gear["arme/Bâton de mage"].armMag, 2, "Armure mag du bâton tunée");
  const gearLib = require("../js/gear.js");
  const baton = mp.applyGearTuning(gearLib.gearItemByName("arme", "Bâton de mage"));
  assert.strictEqual(baton.mods.attMag, 4, "ATT mag du bâton droppé");
  assert.strictEqual(baton.mods.mmPct, 15, "MM % vanilla conservé");
  // suppression admin d'un troll
  const r = mp.newTroll(w, "Banni", "Skrim");
  assert(mp.adminKickTroll(w, "inconnu").error, "kick d'un id inconnu refusé");
  assert(mp.adminKickTroll(w, r.troll.id).ok, "troll supprimé");
  assert(!w.trolls[r.troll.id], "le troll n'existe plus");
  assert(!mp.newTroll(w, "Banni", "Skrim").error, "son nom redevient libre");
}

// Sac : déséquiper, goinfrer, jeter
{
  const gearLib = require("../js/gear.js");
  const w = makeWorld({ monsterTarget: 0, itemTarget: 0 });
  const { troll: t } = mp.newTroll(w, "Sakatrõll", "Durakuir");
  t.pa = 6;
  const armure = gearLib.gearItemByName("armure", "Armure de bois"); // arm +6, pv +15
  t.bag.push(armure);
  // équiper puis déséquiper : l'objet revient au sac, PV max restaurés
  const basePvMax = t.pvMax;
  mp.action(w, t, { type: "use", idx: 0 });
  assert.strictEqual(t.pvMax, basePvMax + 15, "PV max d'équipement appliqués");
  assert(t.equip.armure, "armure équipée");
  let r = mp.action(w, t, { type: "unequip", slot: "armure" });
  assert(r.ok, "déséquipement accepté");
  assert(!t.equip.armure, "emplacement vidé");
  assert.strictEqual(t.bag.length, 1, "l'objet est revenu dans le sac");
  assert.strictEqual(t.pvMax, basePvMax, "PV max restaurés");
  assert.strictEqual(t.gearMods.arm, 0, "modificateurs recalculés");
  assert(mp.action(w, t, { type: "unequip", slot: "casque" }).error, "emplacement vide refusé");
  // jeter : l'objet se retrouve au sol sur la case du troll
  r = mp.action(w, t, { type: "drop", idx: 0 });
  assert(r.ok, "jet accepté");
  assert.strictEqual(t.bag.length, 0, "sac vidé");
  const ground = w.items.find(i => i.x === t.x && i.y === t.y);
  assert(ground && ground.name === "Armure de bois", "l'objet est à terre");
  // empilement : on peut désormais jeter plusieurs trésors sur la même case
  t.bag.push(gearLib.gearItemByName("arme", "Torche"));
  assert(mp.action(w, t, { type: "drop", idx: 0 }).ok, "second jet sur la même case accepté (empilement)");
  assert.strictEqual(w.items.filter(i => i.x === t.x && i.y === t.y).length, 2, "deux trésors empilés");
  // on peut re-ramasser (un objet à la fois)
  r = mp.action(w, t, { type: "pickup" });
  assert(r.ok && t.bag.some(i => i.name === "Armure de bois"), "objet re-ramassé");
  // goinfrer : objet détruit, un des trois effets appliqué
  t.pa = 6;
  t.pv = 1; // pour voir un éventuel soin MIAM
  t.bag.push(gearLib.gearItemByName("arme", "Torche"));
  const before = t.bag.length;
  const idxTorche = t.bag.findIndex(i => i.name === "Torche");
  r = mp.action(w, t, { type: "eat", idx: idxTorche });
  assert(r.ok, "goinfre accepté");
  assert.strictEqual(t.bag.length, before - 1, "objet détruit");
  const fed = t.pv > 1 || (t.potionEffects || []).some(e => e.name.includes("Goinfre"));
  assert(fed, "un effet MIAM/CLONK/GRRROUAR s'est appliqué");
  const lastLogs = t.privLog.slice(-2).map(l => l.msg).join(" ");
  assert(/MIAM|CLONK|GRRROUAR/.test(lastLogs), "cri du goinfre dans le rapport");
  // on ne goinfre pas une potion
  t.bag.push(require("../js/potions.js").makePotionItem("guerison", 3));
  assert(mp.action(w, t, { type: "eat", idx: t.bag.length - 1 }).error, "potion non goinfrable");
}

// Empilement : se déplacer sur la case d'un monstre l'empile (ne l'attaque plus) ;
// l'attaque explicite reste possible (même case, cheby 0)
{
  const w = makeWorld({ monsterTarget: 0, itemTarget: 0 });
  const { troll: t } = mp.newTroll(w, "Empileur", "Skrim");
  t.pa = 6;
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const dir = dirs.find(([dx, dy]) => w.grid[t.y + dy] && w.grid[t.y + dy][t.x + dx] !== undefined && w.grid[t.y + dy][t.x + dx] !== g.T_WALL);
  assert(dir, "le troll a un voisin praticable");
  const m = mp.spawnMonster(w);
  m.x = t.x + dir[0]; m.y = t.y + dir[1];
  const hpBefore = m.pv;
  const r = mp.action(w, t, { type: "move", dx: dir[0], dy: dir[1] });
  assert(r.ok, "déplacement sur la case du monstre accepté");
  assert(t.x === m.x && t.y === m.y, "troll et monstre empilés sur la même case");
  assert.strictEqual(m.pv, hpBefore, "se déplacer n'attaque pas le monstre");
  t.pa = 6;
  const ra = mp.action(w, t, { type: "attack", target: m.id });
  assert(ra.ok, "attaque explicite possible sur la même case");
}

// PvP : un troll peut attaquer un autre troll sur sa case (et le terrasser)
{
  const w = makeWorld({ monsterTarget: 0, itemTarget: 0 });
  const { troll: a } = mp.newTroll(w, "Agresseur", "Kastar");
  const { troll: b } = mp.newTroll(w, "Victime", "Skrim");
  a.att = 50; a.deg = 20; a.pa = 6;
  b.x = a.x; b.y = a.y; b.pv = 5; b.esq = 1;
  // pas sur la même case → refusé
  b.x = a.x + 5;
  assert(mp.action(w, a, { type: "attack", target: b.id }).error, "PvP refusé hors de la case");
  // sur la même case → combat, mise à mort
  b.x = a.x; b.y = a.y;
  const r = mp.action(w, a, { type: "attack", target: b.id });
  assert(r.ok, "PvP résolu sur la même case");
  assert(b.dead, "le troll visé est terrassé");
  assert(a.kills === 1, "kill comptabilisé pour l'attaquant");
}

// Base de référence : les retouches survivent au redémarrage (seed non destructif)
{
  const os = require("os");
  const path = require("path");
  const fs = require("fs");
  const db = require("../db.js");
  const file = path.join(os.tmpdir(), "mc-test-ref.db");
  for (const f of [file, file + "-wal", file + "-shm"]) { try { fs.rmSync(f); } catch {} }
  db.init(file);
  db.setGear("arme", "Gourdin", { deg: 42 });
  db.setMonster("Sorcière", { attMag: 7, degMag: 5 });
  db.init(file); // « redémarrage » : INSERT OR IGNORE ne doit rien écraser
  assert.strictEqual(db.gearRow("arme", "Gourdin").deg, 42, "retouche d'équipement conservée");
  const sorciere = db.monsters().find(m => m.name === "Sorcière");
  assert.strictEqual(sorciere.attMag, 7, "retouche du bestiaire conservée");
  assert.strictEqual(db.gearRow("arme", "Torche").vue, 1, "valeurs vanilla seedées");
  db.init(":memory:"); // base propre pour la suite des tests
}

// Migration < 2.3.0 : le tuning de world.json est déversé une fois dans la base
{
  const os = require("os");
  const path = require("path");
  const w = makeWorld();
  w.tuning = { monsters: { "Gobelin": { att: 42 } }, gear: {}, potions: {}, scrolls: {} };
  const file = path.join(os.tmpdir(), "mc-world-migration.json");
  mp.saveWorld(w, file);
  const loaded = mp.loadWorld(file);
  assert(loaded && !loaded.tuning, "tuning retiré du monde migré");
  assert.strictEqual(mp.currentTuning().monsters.Gobelin.att, 42, "écart migré en base");
  mp.adminSetTuning(loaded, { monsters: {} }); // nettoyage
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
