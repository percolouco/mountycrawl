/* Moteur multijoueur MountyCrawl — monde partagé persistant, autoritaire côté
 * serveur. Node pur, réutilise les règles de js/game.js (dés, combat, races,
 * monstres, équipement, potions, parchemins).
 *
 * Principes :
 *  - Le monde vit en mémoire et tique en continu (tick() appelée chaque seconde
 *    par server.js) : chaque monstre a sa propre DLA (période en ms, tirée dans
 *    une fourchette paramétrable) et agit à son échéance, joueurs connectés ou non.
 *  - Les monstres ne s'attaquent jamais entre eux.
 *  - Chaque troll a 6 PA, rechargés à sa DLA personnelle (période paramétrable) ;
 *    les actions (déplacement, attaque, talents…) coûtent des PA comme en solo.
 *  - À MountyHall on ne meurt jamais vraiment : un troll terrassé réapparaît
 *    après un délai paramétrable, PV pleins, en conservant tout son avoir.
 *  - La configuration (world.config) est modifiable à chaud via l'API admin.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const g = require("./js/game.js");
const p = require("./js/potions.js");
const sc = require("./js/scrolls.js");
const gearLib = require("./js/gear.js");
const bestiaryLib = require("./js/bestiary.js");
const db = require("./db.js");

/* ---------- Configuration par défaut (tout est réglable via l'admin) ---------- */

const DEFAULT_CONFIG = {
  mapW: 40, mapH: 28,            // taille du monde partagé
  worldDepth: 2,                  // « profondeur » : pools de monstres/objets (1-5)
  monsterDlaMinSec: 90,           // DLA des monstres : période tirée dans [min, max]
  monsterDlaMaxSec: 360,
  trollDlaSec: 180,               // recharge des PA des trolls
  pollSec: 5,                     // intervalle de rafraîchissement conseillé au client
  monsterTarget: 24,              // population de monstres visée
  repopSec: 120,                  // période de vérification du repeuplement
  itemTarget: 16,                 // trésors au sol visés
  deathRespawnSec: 90,            // délai de réapparition d'un troll terrassé
  maxTrolls: 40,
  logSize: 150,
  templateChance: 0,              // proba (%) qu'un emplacement de template soit rempli sur un drop d'équipement
};

const CONFIG_BOUNDS = {
  mapW: [24, 80], mapH: [16, 60], worldDepth: [1, 45],
  monsterDlaMinSec: [5, 3600], monsterDlaMaxSec: [5, 7200],
  trollDlaSec: [5, 3600], pollSec: [1, 60],
  monsterTarget: [0, 120], repopSec: [10, 3600],
  itemTarget: [0, 120], deathRespawnSec: [0, 3600],
  maxTrolls: [1, 200], logSize: [20, 500],
  templateChance: [0, 100],
};

/* ---------- Tuning : valeurs du bestiaire, de l'équipement et des trésors ----------
 * Les valeurs de référence vivent dans la base SQLite (db.js) ; chaque
 * spawn/drop la relit, donc une modification (page admin ou éditeur SQLite)
 * s'applique à chaud aux nouveaux spawns/drops — le solo reste vanilla. */

const MONSTER_TUNE_KEYS = db.MONSTER_KEYS;
const MONSTER_TUNE_BOUNDS = { level: [1, 99], att: [1, 99], attMag: [0, 99], esq: [1, 99], deg: [1, 99], degMag: [0, 99], pv: [1, 999], armor: [0, 99], armorMag: [0, 99], vue: [1, 30] };
const GEAR_TUNE_KEYS = db.GEAR_KEYS;
const GEAR_TUNE_BOUNDS = [-100, 100];
const POWER_BOUNDS = [0, 200];

function randRange([min, max]) {
  const lo = Math.min(min, max), hi = Math.max(min, max);
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

const sameRange = (a, b) => a && b && Math.min(...a) === Math.min(...b) && Math.max(...a) === Math.max(...b);

/* Types de monstres tels qu'en base (avant gabarit d'âge). */
function tunedMonsterTypes() {
  return db.monsters();
}

function tunedRandomPotion() {
  const item = p.makeRandomPotion();
  const range = db.treasureRange("potions", item.potionId);
  // fourchette d'origine → on garde le tirage vanilla (ex. Longue-Vue {1,2,3,5,8})
  if (!range || sameRange(range, db.POTION_POWER_DEFAULTS[item.potionId])) return item;
  return p.makePotionItem(item.potionId, randRange(range));
}

function tunedRandomScroll() {
  const item = sc.makeRandomScroll();
  const range = db.treasureRange("scrolls", item.scrollId);
  if (!range || sameRange(range, db.SCROLL_POWER_DEFAULTS[item.scrollId])) return item;
  return sc.makeScrollItem(item.scrollId, randRange(range));
}

function applyGearTuning(item) {
  if (!item || item.kind !== "gear") return item;
  const row = db.gearRow(item.slot, item.name);
  if (row) {
    item.mods = Object.fromEntries(db.GEAR_KEYS.map(k => [k, row[k] || 0]).filter(([, v]) => v));
  }
  return item;
}

/* Templates de drop : un objet qui tombe reçoit jusqu'à 3 templates (6 pour une
 * arme à 2 mains), chaque emplacement étant rempli avec la proba `chance` (%)
 * par un template DISTINCT tiré au hasard en base. Les bonus (dont `tour`)
 * s'ajoutent aux mods de l'objet, et les suffixes au nom (« Épée Courte de
 * l'Aigle des Mages »). N'affecte que le monde partagé (drops) ; le solo reste
 * vanilla. */
function applyGearTemplates(item, chance) {
  if (!item || item.kind !== "gear" || !(chance > 0)) return item;
  const pool = db.templatesAll();
  if (!pool.length) return item;
  const slots = item.twoHanded ? 6 : 3;
  const picked = [];
  for (let i = 0; i < slots && pool.length; i++) {
    if (Math.random() * 100 >= chance) continue;
    picked.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  if (!picked.length) return item;
  const mods = { ...(item.mods || {}) };
  for (const t of picked) {
    for (const k of db.TEMPLATE_KEYS) if (t[k]) mods[k] = (mods[k] || 0) + t[k];
  }
  item.mods = Object.fromEntries(Object.entries(mods).filter(([, v]) => v));
  item.name = `${item.name} ${picked.map(t => t.name).join(" ")}`;
  item.templates = picked.map(t => t.name);
  return item;
}

/* ---------- Création du monde ---------- */

function randomFloor(world, taken = null) {
  const { grid, config } = world;
  for (let tries = 0; tries < 800; tries++) {
    const x = 1 + Math.floor(Math.random() * (config.mapW - 2));
    const y = 1 + Math.floor(Math.random() * (config.mapH - 2));
    if (grid[y][x] !== g.T_FLOOR) continue;
    if (taken && taken.has(y * config.mapW + x)) continue;
    if (occupied(world, x, y)) continue;
    if (taken) taken.add(y * config.mapW + x);
    return { x, y };
  }
  return null;
}

function occupied(world, x, y) {
  return world.monsters.some(m => m.x === x && m.y === y)
    || Object.values(world.trolls).some(t => !t.dead && t.x === x && t.y === y);
}

function monsterDlaMs(config) {
  const min = Math.min(config.monsterDlaMinSec, config.monsterDlaMaxSec);
  const max = Math.max(config.monsterDlaMinSec, config.monsterDlaMaxSec);
  return (min + Math.random() * (max - min)) * 1000;
}

function spawnMonster(world, now = Date.now()) {
  const pos = randomFloor(world);
  if (!pos) return null;
  // Bestiaire : on tire un monstre dont le niveau tombe dans la tranche de la
  // profondeur, avec un âge au hasard. Données de la base (tunées admin) +
  // multiplicateurs d'âge.
  const depth = world.config.worldDepth;
  const m = g.buildBestiaryMonster(db.bestiaryAll(), db.monsterAges().map(a => a.mult), bestiaryLib.AGE_NAMES, bestiaryLib.AGE_NAMES_F, depth, pos.x, pos.y);
  if (!m) return null;
  m.id = world.nextId++;
  m.dlaMs = Math.round(monsterDlaMs(world.config));
  m.nextDla = now + m.dlaMs;
  world.monsters.push(m);
  return m;
}

function spawnItem(world) {
  const pos = randomFloor(world);
  if (!pos) return null;
  const r = Math.random();
  const depth = world.config.worldDepth;
  const item = r < 0.34 ? tunedRandomPotion()
    : r < 0.48 ? tunedRandomScroll()
    : r < 0.78 ? applyGearTemplates(applyGearTuning(gearLib.makeRandomGear(depth)), world.config.templateChance)
    : { kind: "gold", gold: g.rollDice(depth, 6).total * 10, emoji: "💰" };
  if (item.kind === "gold") item.name = `${item.gold} Mountyzédons`;
  world.items.push({ ...item, x: pos.x, y: pos.y });
  return item;
}

function createWorld(config = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const world = {
    config: cfg,
    grid: g.generateCavern(cfg.mapW, cfg.mapH),
    trolls: {},
    monsters: [],
    items: [],
    log: [],
    nextId: 1,
    nextRepop: 0,
    createdAt: Date.now(),
  };
  for (let i = 0; i < cfg.monsterTarget; i++) spawnMonster(world);
  for (let i = 0; i < cfg.itemTarget; i++) spawnItem(world);
  worldLog(world, "🌋 Le Monde Souterrain partagé s'éveille…");
  return world;
}

/* ---------- Journal ---------- */

function worldLog(world, msg, cls = "info") {
  world.log.push({ t: Date.now(), msg, cls });
  while (world.log.length > world.config.logSize) world.log.shift();
}

function privLog(troll, msg, cls = "info") {
  troll.privLog = troll.privLog || [];
  troll.privLog.push({ t: Date.now(), msg, cls });
  while (troll.privLog.length > 60) troll.privLog.shift();
}

/* ---------- Trolls ---------- */

function hashPass(salt, password) {
  return crypto.createHash("sha256").update(`${salt}:${password}`).digest("hex");
}

/* Le troll vit côté serveur : le mot de passe (optionnel mais conseillé)
 * permet de le retrouver depuis n'importe quel appareil via login(). */
function newTroll(world, name, race, password = "", now = Date.now()) {
  if (!g.RACES[race]) return { error: "race inconnue" };
  name = String(name || "").trim().slice(0, 20) || "Trõllinet";
  password = String(password || "");
  const taken = Object.values(world.trolls).some(t => t.name.toLowerCase() === name.toLowerCase());
  if (taken) return { error: "ce nom de troll est déjà pris — choisis-en un autre ou retrouve ton troll avec ton mot de passe" };
  const living = Object.keys(world.trolls).length;
  if (living >= world.config.maxTrolls) return { error: "le Hall est plein (max atteint)" };
  const pos = randomFloor(world);
  if (!pos) return { error: "pas de place dans la caverne" };
  const salt = crypto.randomBytes(8).toString("hex");
  const s = g.RACES[race].stats;
  const troll = {
    id: crypto.randomBytes(6).toString("hex"),
    secret: crypto.randomBytes(16).toString("hex"),
    salt, passHash: password ? hashPass(salt, password) : null,
    name, race, x: pos.x, y: pos.y,
    att: s.att, esq: s.esq, deg: s.deg, reg: s.reg,
    pv: s.pvMax, pvMax: s.pvMax, vue: s.vue,
    degBonus: 0, armor: 0, armorDice: 0,
    bought: { att: 0, esq: 0, deg: 0, reg: 0, pv: 0, vue: 0, armor: 0 },
    comp: { pct: g.START_COMP_PCT }, sort: { pct: g.START_SORT_PCT },
    fatigue: 0, compUsed: false, compPXTurn: false, sortPXTurn: false,
    equip: { arme: null, armure: null, casque: null, bouclier: null, talisman: null, bottes: null },
    gearMods: null,
    pa: g.PA_PER_TURN, pi: 0, totalPI: 0, gold: 0,
    bag: [], camo: false, kills: 0, dla: 1, tour: 1,
    potionEffects: [], blockCamoTurns: 0,
    dead: false, respawnAt: 0,
    nextDla: now + world.config.trollDlaSec * 1000,
    lastSeen: now,
    privLog: [],
  };
  world.trolls[troll.id] = troll;
  worldLog(world, `${g.RACES[race].emoji} ${name} le ${race} entre dans le Monde Souterrain !`, "good");
  return { troll };
}

function authTroll(world, id, secret) {
  const t = world.trolls[id];
  if (!t || t.secret !== secret) return null;
  t.lastSeen = Date.now();
  return t;
}

/* Retrouver son troll par nom + mot de passe (multi-appareils). */
function login(world, name, password) {
  name = String(name || "").trim().toLowerCase();
  password = String(password || "");
  const t = Object.values(world.trolls).find(t => t.name.toLowerCase() === name);
  if (!t) return { error: "aucun troll de ce nom" };
  if (!t.passHash) return { error: "ce troll n'a pas de mot de passe — il n'est accessible que depuis son navigateur d'origine" };
  if (hashPass(t.salt, password) !== t.passHash) return { error: "mot de passe incorrect" };
  t.lastSeen = Date.now();
  return { troll: t };
}

const chebyshev = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

function effTrollMP(t) {
  return p.effTroll(t);
}

/* ---------- DLA et tick du monde ---------- */

/* DLA d'un troll : PA rechargés, régénération, effets magiques décomptés. */
function trollDla(world, t, now) {
  t.dla++;
  const dlaBonusPA = p.tickPotionTurns(t, () => {});
  const te = effTrollMP(t);
  if (!t.dead && t.pv < t.pvMax && t.pv > 0) {
    const heal = Math.max(0, g.rollDice(te.reg, 3).total + (te.regFlat || 0));
    t.pv = Math.min(t.pvMax, t.pv + heal);
    if (heal) privLog(t, `💤 DLA n°${t.dla} : tu régénères ${heal} PV.`, "info");
  }
  t.pa = Math.max(1, Math.min(g.PA_PER_TURN + 3, g.PA_PER_TURN + dlaBonusPA));
  t.compUsed = false;
  t.compPXTurn = false;
  t.sortPXTurn = false;
  t.fatigue = Math.floor(t.fatigue / 1.25);
  t.nextDla = now + world.config.trollDlaSec * 1000;
}

function killTrollMP(world, t, killer, now) {
  t.dead = true;
  t.camo = false;
  t.respawnAt = now + world.config.deathRespawnSec * 1000;
  privLog(t, `☠️ ${killer} t'a terrassé… Les Dieux Trõlls te ramèneront bientôt.`, "bad");
  worldLog(world, `☠️ ${t.name} a été terrassé par ${killer} !`, "bad");
}

function respawnTroll(world, t) {
  const pos = randomFloor(world);
  if (!pos) return;
  t.dead = false;
  t.x = pos.x; t.y = pos.y;
  t.pv = t.pvMax;
  t.pa = g.PA_PER_TURN;
  t.potionEffects = [];
  t.blockCamoTurns = 0;
  privLog(t, "✨ Les Dieux Trõlls te ramènent dans la caverne, requinqué.", "good");
  worldLog(world, `✨ ${t.name} est de retour dans le Monde Souterrain.`, "info");
}

/* Activation d'un monstre à sa DLA : attaque un troll adjacent, sinon se
 * rapproche du troll visible le plus proche, sinon erre. Jamais de monstre
 * contre monstre. */
function monsterAct(world, m, now) {
  if (m.skip > 0) {
    m.skip--;
    return;
  }
  const targets = Object.values(world.trolls).filter(t => !t.dead && !t.camo);
  const em = monsterEff(m);
  let best = null, bestDist = Infinity;
  for (const t of targets) {
    const d = chebyshev(m, t);
    if (d < bestDist) { best = t; bestDist = d; }
  }
  if (best && bestDist <= 1) {
    const te = effTrollMP(best);
    // un monstre doté d'une attaque magique (attMag/degMag) alterne au hasard
    const magic = em.attMag > 0 && em.degMag > 0 && Math.random() < 0.5;
    const r = g.resolveAttack(magic ? { ...em, att: em.attMag, deg: em.degMag } : em, te, { magic });
    if (r.hit) {
      best.pv -= r.damage;
      privLog(best, `${m.emoji} ${m.name} t'attaque${magic ? " (magie)" : ""} : ${r.attRoll} vs ${r.esqRoll} → ${r.damage} dégâts${r.armorReduction ? ` (armure${magic ? " magique" : ""} −${r.armorReduction})` : ""} !`, "bad");
      if (best.pv <= 0) killTrollMP(world, best, m.name, now);
    } else {
      privLog(best, `${m.emoji} ${m.name} t'attaque${magic ? " (magie)" : ""}… et tu esquives !`, "combat");
    }
  } else if (best && bestDist <= em.vue) {
    stepTowardMP(world, m, best);
  } else if (!m.static && Math.random() < 0.6) {
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const [dx, dy] = dirs[Math.floor(Math.random() * 4)];
    moveMonsterMP(world, m, m.x + dx, m.y + dy);
  }
  // les statuts s'estompent à chaque activation
  if (m.esqHalfTurns > 0) m.esqHalfTurns--;
  if (m.attDownTurns > 0 && --m.attDownTurns === 0) m.attDownDice = 0;
  if (m.vueMalusTurns > 0 && --m.vueMalusTurns === 0) m.vueMalus = 0;
}

function monsterEff(m) {
  return {
    ...m,
    att: Math.max(1, m.att - (m.attDownTurns > 0 ? m.attDownDice || 0 : 0)),
    esq: m.esqHalfTurns > 0 ? Math.max(1, Math.floor(m.esq / 2)) : m.esq,
    vue: Math.max(1, m.vue - (m.vueMalusTurns > 0 ? m.vueMalus || 0 : 0)),
    armorPhys: m.armor || 0,
    armorMag: m.armorMag || 0,
  };
}

function stepTowardMP(world, m, t) {
  if (m.static) return;
  const dx = Math.sign(t.x - m.x), dy = Math.sign(t.y - m.y);
  if (dx !== 0 && moveMonsterMP(world, m, m.x + dx, m.y)) return;
  if (dy !== 0 && moveMonsterMP(world, m, m.x, m.y + dy)) return;
  if (dx !== 0 && dy !== 0) moveMonsterMP(world, m, m.x + dx, m.y + dy);
}

function moveMonsterMP(world, m, nx, ny) {
  const { mapW, mapH } = world.config;
  if (nx < 0 || ny < 0 || nx >= mapW || ny >= mapH) return false;
  if (world.grid[ny][nx] === g.T_WALL) return false;
  // Empilement autorisé : les monstres peuvent partager une case (mais ne se
  // déplacent pas sur un troll — ils l'attaquent quand il est adjacent).
  if (Object.values(world.trolls).some(t => !t.dead && t.x === nx && t.y === ny)) return false;
  m.x = nx; m.y = ny;
  return true;
}

/* Tick global : appelé régulièrement (1 s) par server.js. Retourne true si
 * l'état a changé (pour la sauvegarde). */
function tick(world, now = Date.now()) {
  let changed = false;
  for (const m of world.monsters) {
    if (m.nextDla <= now) {
      monsterAct(world, m, now);
      m.dlaMs = Math.round(monsterDlaMs(world.config)); // re-tirée : DLA vivante
      m.nextDla = now + m.dlaMs;
      changed = true;
    }
  }
  for (const t of Object.values(world.trolls)) {
    if (t.dead && t.respawnAt <= now) { respawnTroll(world, t); changed = true; }
    if (!t.dead && t.nextDla <= now) { trollDla(world, t, now); changed = true; }
  }
  if (world.nextRepop <= now) {
    world.nextRepop = now + world.config.repopSec * 1000;
    while (world.monsters.length < world.config.monsterTarget) { spawnMonster(world, now); changed = true; }
    while (world.items.length < world.config.itemTarget) { spawnItem(world); changed = true; }
  }
  return changed;
}

/* ---------- Actions des joueurs ---------- */

function spendPA(t, cost) {
  if (t.pa < cost) return false;
  t.pa -= cost;
  return true;
}

function monsterById(world, id) {
  return world.monsters.find(m => m.id === id);
}

function gainPXMP(t, n) {
  if (!n) return;
  t.pi += n;
  t.totalPI += n;
}

function killMonsterMP(world, t, m) {
  const lvl = g.levelFromTotalPI(t.totalPI);
  const px = g.killPX(lvl, m.level);
  if (px > 0) gainPXMP(t, px);
  t.kills++;
  privLog(t, `💀 ${m.name} est terrassé !${px > 0 ? ` +${px} PX.` : " Pas de PX (adversaire trop faible)."}`, "good");
  worldLog(world, `⚔️ ${t.name} a terrassé ${m.emoji} ${m.name} !`, "combat");
  if (Math.random() < 0.4) {
    const lr = Math.random();
    const drop = lr < 0.4 ? { ...tunedRandomPotion(), x: m.x, y: m.y }
      : lr < 0.65 ? { ...tunedRandomScroll(), x: m.x, y: m.y }
      : { kind: "gold", gold: m.level * 10, name: `${m.level * 10} Mountyzédons`, emoji: "💰", x: m.x, y: m.y };
    world.items.push(drop);
    privLog(t, `${m.name} laisse tomber ${drop.emoji} ${drop.name}.`, "info");
  }
  world.monsters = world.monsters.filter(x => x !== m);
}

/* Attaque de base d'un troll sur un monstre (3 PA). */
function actAttack(world, t, m) {
  if (!spendPA(t, g.COSTS.attack)) return { error: "pas assez de PA" };
  const r = g.resolveAttack(effTrollMP(t), monsterEff(m));
  if (t.camo) { t.camo = false; privLog(t, "Ton attaque brise le camouflage.", "info"); }
  if (r.hit) {
    m.pv -= r.damage;
    gainPXMP(t, 1);
    privLog(t, `Tu attaques ${m.name} : ${r.attRoll} vs ${r.esqRoll} → ${r.critical ? "CRITIQUE ! " : ""}${r.damage} dégâts${r.armorReduction ? ` (armure −${r.armorReduction})` : ""}.`, "combat");
    if (m.pv <= 0) killMonsterMP(world, t, m);
  } else {
    privLog(t, `Tu attaques ${m.name} : ${r.attRoll} vs ${r.esqRoll} → esquivé !`, "combat");
  }
  return { ok: true };
}

/* Attaque d'un troll sur un autre (PvP, 3 PA) — uniquement sur la même case. */
function actAttackTroll(world, t, v, now = Date.now()) {
  if (!spendPA(t, g.COSTS.attack)) return { error: "pas assez de PA" };
  const r = g.resolveAttack(effTrollMP(t), effTrollMP(v));
  if (t.camo) { t.camo = false; privLog(t, "Ton attaque brise le camouflage.", "info"); }
  if (r.hit) {
    v.pv -= r.damage;
    gainPXMP(t, 1);
    const armTxt = r.armorReduction ? ` (armure −${r.armorReduction})` : "";
    privLog(t, `Tu attaques ${v.name} : ${r.attRoll} vs ${r.esqRoll} → ${r.critical ? "CRITIQUE ! " : ""}${r.damage} dégâts${armTxt}.`, "combat");
    privLog(v, `⚔️ ${t.name} t'attaque : ${r.attRoll} vs ${r.esqRoll} → ${r.damage} dégâts${armTxt} !`, "bad");
    if (v.pv <= 0) { t.kills++; killTrollMP(world, v, t.name, now); }
  } else {
    privLog(t, `Tu attaques ${v.name} : ${r.attRoll} vs ${r.esqRoll} → esquivé !`, "combat");
    privLog(v, `⚔️ ${t.name} t'attaque… et tu esquives !`, "combat");
  }
  return { ok: true };
}

/* Talent (compétence/sortilège) : jet de maîtrise mutualisé avec le solo. */
function tryTalentMP(t, talent, cap, cost) {
  if (!spendPA(t, cost)) return { error: "pas assez de PA" };
  const before = talent.pct;
  const effPct = p.talentPctWithPotions(t, talent, cap);
  const r = g.masteryRoll(talent, cap, effPct);
  talent.tries = (talent.tries || 0) + 1;
  if (r.success) talent.successes = (talent.successes || 0) + 1;
  talent.lastUse = Date.now();
  if (!r.success) {
    t.pa += Math.floor(cost / 2);
    privLog(t, `Échec du talent (jet ${r.roll} > ${effPct} %). Moitié des PA remboursée.${talent.pct > before ? ` Maîtrise → ${talent.pct} %.` : ""}`, "combat");
    return { failed: true };
  }
  if (talent.pct > before) privLog(t, `Maîtrise +${talent.pct - before} % → ${talent.pct} %.`, "good");
  return { ok: true };
}

const trollMMMP = t => g.levelFromTotalPI(t.totalPI) + 1;
const monsterRMMP = m => Math.ceil(m.level / 2);

function resistMP(t, m) {
  const te = effTrollMP(t);
  const mm = trollMMMP(t) + Math.round(te.mmPct / 10);
  const rm = monsterRMMP(m) + Math.round((te.rmPct || 0) / 10);
  return !g.resolveSpell(mm, rm).success; // true = la cible résiste (effet réduit)
}

function actComp(world, t, m) {
  const te = effTrollMP(t);
  const comp = g.RACES[t.race].comp;
  const pxOnce = () => { if (!t.compPXTurn) { gainPXMP(t, 1); t.compPXTurn = true; } };

  if (t.race === "Skrim") {
    if (t.compUsed) return { error: "Botte Secrète déjà utilisée cette DLA" };
    if (!m) return { error: "aucun monstre adjacent" };
    const res = tryTalentMP(t, t.comp, 90, comp.cost);
    if (!res.ok) return res;
    pxOnce();
    t.compUsed = true;
    const pseudo = { ...te, att: Math.max(1, Math.floor(te.att * 2 / 3)), deg: Math.max(1, Math.floor(te.att / 2)) };
    const r = g.resolveAttack(pseudo, monsterEff(m));
    if (r.hit) {
      m.pv -= r.damage;
      privLog(t, `🥋 Botte Secrète : ${r.attRoll} vs ${r.esqRoll} → ${r.damage} dégâts !`, "combat");
      if (m.pv <= 0) killMonsterMP(world, t, m);
    } else privLog(t, `🥋 Botte Secrète esquivée (${r.attRoll} vs ${r.esqRoll}).`, "combat");
  } else if (t.race === "Durakuir") {
    const res = tryTalentMP(t, t.comp, 90, comp.cost);
    if (!res.ok) return res;
    pxOnce();
    const dice = Math.max(1, Math.floor(t.pvMax / 15));
    const heal = g.rollDice(dice, 3).total;
    t.pv = Math.min(t.pvMax, t.pv + heal);
    privLog(t, `🥋 Régénération Accrue : +${heal} PV (${dice}D3).`, "good");
  } else if (t.race === "Kastar") {
    const res = tryTalentMP(t, t.comp, 90, comp.cost);
    if (!res.ok) return res;
    pxOnce();
    const cost = g.rollDice(1, 3).total + t.fatigue;
    t.fatigue += 1;
    t.pv -= cost;
    t.pa = Math.min(g.PA_PER_TURN, t.pa + 4);
    privLog(t, `🥋 Métabolisme : −${cost} PV, +4 PA (fatigue ${t.fatigue}).`, "good");
    if (t.pv <= 0) killTrollMP(world, t, "son propre métabolisme", Date.now());
  } else if (t.race === "Tomawak") {
    if (t.blockCamoTurns > 0) return { error: "la Pàïntûré t'empêche de te camoufler" };
    if (t.camo) return { error: "déjà camouflé" };
    const res = tryTalentMP(t, t.comp, 90, comp.cost);
    if (!res.ok) return res;
    pxOnce();
    t.camo = true;
    privLog(t, "🌫️ Camouflage : les monstres ne te voient plus.", "good");
  } else if (t.race === "Darkling") {
    if (t.compUsed) return { error: "Balayage déjà utilisé cette DLA" };
    if (!m) return { error: "aucun monstre adjacent" };
    const res = tryTalentMP(t, t.comp, 90, comp.cost);
    if (!res.ok) return res;
    pxOnce();
    t.compUsed = true;
    const destab = g.rollDice(te.att, 6).total;
    const stab = g.rollDice(Math.max(1, Math.floor(m.esq * 2 / 3)), 6).total;
    if (destab > stab) {
      m.skip = (m.skip || 0) + 1;
      privLog(t, `🥋 Balayage : ${destab} vs ${stab} → ${m.name} est à terre (perd sa prochaine DLA) !`, "good");
    } else privLog(t, `🥋 Balayage : ${destab} vs ${stab} → ${m.name} reste stable.`, "combat");
  }
  return { ok: true };
}

function actSort(world, t, m) {
  const te = effTrollMP(t);
  const sort = g.RACES[t.race].sort;
  const pxOnce = () => { if (!t.sortPXTurn) { gainPXMP(t, 1); t.sortPXTurn = true; } };

  if (t.race === "Skrim") {
    if (!m) return { error: "aucun monstre adjacent" };
    const res = tryTalentMP(t, t.sort, 80, sort.cost);
    if (!res.ok) return res;
    pxOnce();
    const resisted = resistMP(t, m);
    m.esqHalfTurns = (m.esqHalfTurns || 0) + (resisted ? 1 : 2);
    if (!resisted) m.skip = (m.skip || 0) + 1;
    privLog(t, resisted
      ? `🔮 Hypnotisme : ${m.name} résiste — esquive réduite 1 DLA seulement.`
      : `🔮 Hypnotisme : ${m.name} est hébété ! Esquive ÷2 et DLA perdue.`, "good");
  } else if (t.race === "Durakuir") {
    if (!m) return { error: "aucun monstre adjacent" };
    const res = tryTalentMP(t, t.sort, 80, sort.cost);
    if (!res.ok) return res;
    pxOnce();
    const armMag = Math.max(0, monsterEff(m).armorMag);
    let dmg = Math.max(1, g.rollDice(te.deg, 3).total - armMag);
    const resisted = resistMP(t, m);
    if (resisted) dmg = Math.max(1, Math.ceil(dmg / 2));
    m.pv -= dmg;
    privLog(t, `🔮 Rafale Psychique : touche automatique, ${dmg} dégâts${resisted ? " (résisté)" : ""}.`, "combat");
    if (m.pv <= 0) killMonsterMP(world, t, m);
  } else if (t.race === "Kastar") {
    if (!m) return { error: "aucun monstre adjacent" };
    const res = tryTalentMP(t, t.sort, 80, sort.cost);
    if (!res.ok) return res;
    pxOnce();
    const pseudo = { ...te, att: Math.max(1, Math.floor(te.deg * 2 / 3)) };
    const r = g.resolveAttack(pseudo, monsterEff(m), { magic: true });
    if (r.hit) {
      let dmg = r.damage;
      const resisted = resistMP(t, m);
      if (resisted) dmg = Math.max(1, Math.ceil(dmg / 2));
      m.pv -= dmg;
      const heal = Math.ceil(dmg / 2);
      t.pv = Math.min(t.pvMax, t.pv + heal);
      privLog(t, `🔮 Vampirisme : ${dmg} dégâts${resisted ? " (résisté)" : ""}, tu draines ${heal} PV.`, "good");
      if (m.pv <= 0) killMonsterMP(world, t, m);
    } else privLog(t, `🔮 Vampirisme esquivé (${r.attRoll} vs ${r.esqRoll}).`, "combat");
  } else if (t.race === "Tomawak") {
    if (!m) return { error: "aucun monstre en vue" };
    const dist = chebyshev(m, t);
    if (dist > te.vue) return { error: "cible hors de portée (Vue)" };
    const res = tryTalentMP(t, t.sort, 80, sort.cost);
    if (!res.ok) return res;
    pxOnce();
    const proxBonus = Math.max(0, te.vue - dist);
    const pseudo = { att: te.vue + proxBonus, deg: Math.max(1, Math.floor(te.vue / 2)), degBonus: 0 };
    const r = g.resolveAttack(pseudo, monsterEff(m), { magic: true });
    if (r.hit) {
      let dmg = r.damage;
      const resisted = resistMP(t, m);
      if (resisted) dmg = Math.max(1, Math.ceil(dmg / 2));
      m.pv -= dmg;
      privLog(t, `🔮 Projectile Magique sur ${m.name} (distance ${dist}) : ${dmg} dégâts${resisted ? " (résisté)" : ""}.`, "combat");
      if (m.pv <= 0) killMonsterMP(world, t, m);
    } else privLog(t, `🔮 Projectile Magique esquivé (${r.attRoll} vs ${r.esqRoll}).`, "combat");
    if (t.camo && 1 + Math.floor(Math.random() * 100) > Math.floor(t.comp.pct * 0.25)) {
      t.camo = false;
      privLog(t, "Ton camouflage se dissipe dans l'éclat du projectile.", "info");
    }
  } else if (t.race === "Darkling") {
    if (!m) return { error: "aucun monstre adjacent" };
    const res = tryTalentMP(t, t.sort, 80, sort.cost);
    if (!res.ok) return res;
    pxOnce();
    const pseudo = { ...te, deg: te.reg, degBonus: 0 };
    const r = g.resolveAttack(pseudo, monsterEff(m), { ignoreArmor: true, magic: true });
    if (r.hit) {
      let dmg = r.damage;
      const resisted = resistMP(t, m);
      if (resisted) dmg = Math.max(1, Math.ceil(dmg / 2));
      m.pv -= dmg;
      const necrose = resisted ? Math.max(1, Math.floor(te.reg / 2)) : te.reg;
      m.attDownDice = (m.attDownDice || 0) + necrose;
      m.attDownTurns = 2;
      privLog(t, `🔮 Siphon des Âmes : ${dmg} dégâts${resisted ? " (résisté)" : ""}, nécrose −${necrose} dé(s) d'ATT.`, "combat");
      if (m.pv <= 0) killMonsterMP(world, t, m);
    } else privLog(t, `🔮 Siphon des Âmes esquivé (${r.attRoll} vs ${r.esqRoll}).`, "combat");
  }
  return { ok: true };
}

/* Point d'entrée des actions : { type, ... }. Retourne { ok } ou { error }. */
function action(world, t, act) {
  if (t.dead) return { error: "tu es terrassé — attends ta réapparition" };
  const { mapW, mapH } = world.config;

  if (act.type === "move") {
    const dx = Math.sign(act.dx || 0), dy = Math.sign(act.dy || 0);
    if (!dx && !dy) return { error: "déplacement nul" };
    const nx = t.x + dx, ny = t.y + dy;
    if (nx < 0 || ny < 0 || nx >= mapW || ny >= mapH) return { error: "hors du monde" };
    if (world.grid[ny][nx] === g.T_WALL) return { error: "un mur" };
    // Empilement autorisé : une case accueille plusieurs trolls/monstres/trésors.
    // Se déplacer ne fait plus attaquer — l'attaque passe par l'action « attack »
    // (avec choix de la cible si plusieurs sur la case ou adjacentes).
    if (!spendPA(t, g.COSTS.move)) return { error: "pas assez de PA" };
    t.x = nx; t.y = ny;
    if (t.camo) {
      const threshold = Math.floor(t.comp.pct * 0.75);
      if (1 + Math.floor(Math.random() * 100) > threshold) {
        t.camo = false;
        privLog(t, "Un caillou roule sous ton pied : te voilà repéré !", "bad");
      }
    }
    return { ok: true };
  }

  if (act.type === "attack") {
    // On ne peut frapper (monstre OU troll) que sur SA PROPRE case (même case).
    const m = monsterById(world, act.target);
    if (m) {
      if (chebyshev(m, t) !== 0) return { error: "il faut être sur la case du monstre" };
      return actAttack(world, t, m);
    }
    const v = world.trolls[act.target];
    if (v && v !== t && !v.dead) {
      if (chebyshev(v, t) !== 0) return { error: "il faut être sur la case du troll" };
      return actAttackTroll(world, t, v);
    }
    return { error: "aucune cible sur ta case" };
  }

  if (act.type === "comp" || act.type === "sort") {
    let m = act.target != null ? monsterById(world, act.target) : null;
    if (!m) {
      // Cible implicite : un monstre sur TA case ; exception, le Projectile
      // Magique (sortilège du Tomawak) frappe à distance (jusqu'à la Vue).
      const te = effTrollMP(t);
      const range = act.type === "sort" && t.race === "Tomawak" ? te.vue : 0;
      let bestDist = Infinity;
      for (const cand of world.monsters) {
        const d = chebyshev(cand, t);
        if (d <= range && d < bestDist) { m = cand; bestDist = d; }
      }
    }
    return act.type === "comp" ? actComp(world, t, m) : actSort(world, t, m);
  }

  if (act.type === "pickup") {
    const i = world.items.find(it => it.x === t.x && it.y === t.y);
    if (!i) return { error: "rien à ramasser ici" };
    if (!spendPA(t, g.COSTS.pickup)) return { error: "pas assez de PA" };
    world.items = world.items.filter(x => x !== i);
    if (i.kind === "gold") {
      t.gold += i.gold;
      privLog(t, `💰 Tu ramasses ${i.gold} Mountyzédons.`, "good");
    } else {
      const { x, y, ...item } = i;
      t.bag.push(item);
      privLog(t, `Tu ramasses ${i.emoji} ${i.name}.`, "good");
    }
    return { ok: true };
  }

  if (act.type === "use") {
    const item = t.bag[act.idx];
    if (!item) return { error: "objet introuvable dans le sac" };
    if (item.kind === "potion") {
      if (!spendPA(t, g.COSTS.potion)) return { error: "pas assez de PA" };
      if (!p.drinkPotion(t, item, g.rollDice, (msg, cls) => privLog(t, msg, cls))) return { error: "fiole inconnue" };
      t.bag.splice(act.idx, 1);
      if (t.pv <= 0) killTrollMP(world, t, "une fiole douteuse", Date.now());
    } else if (item.kind === "scroll") {
      if (!spendPA(t, g.COSTS.scroll)) return { error: "pas assez de PA" };
      const res = sc.readScroll(t, item, g.rollDice, (msg, cls) => privLog(t, msg, cls));
      if (!res) return { error: "parchemin illisible" };
      t.bag.splice(act.idx, 1);
      if (res.zone) applyZoneMP(world, t, res.zone);
      if (t.pv <= 0) killTrollMP(world, t, "un parchemin retors", Date.now());
    } else if (item.kind === "gear") {
      if (!spendPA(t, g.COSTS.equip)) return { error: "pas assez de PA" };
      t.bag.splice(act.idx, 1);
      g.equipGear(t, item);
      privLog(t, `Tu t'équipes : ${item.emoji} ${item.name}.`, "good");
    }
    return { ok: true };
  }

  if (act.type === "unequip") {
    if (!t.equip[act.slot]) return { error: "rien d'équipé à cet emplacement" };
    if (!spendPA(t, g.COSTS.unequip)) return { error: "pas assez de PA" };
    g.unequipToBag(t, act.slot, (msg, cls) => privLog(t, msg, cls));
    t.gearMods = gearLib.gearMods(t.equip);
    return { ok: true };
  }

  if (act.type === "eat") {
    const item = t.bag[act.idx];
    if (!item || item.kind !== "gear") return { error: "seul l'équipement se goinfre" };
    if (!spendPA(t, g.COSTS.eat)) return { error: "pas assez de PA" };
    t.bag.splice(act.idx, 1);
    const r = p.goinfreItem(t, g.rollDice);
    privLog(t, `🍴 Tu goinfres ${item.emoji} ${item.name} : « ${r.cry} » ${r.effect}.`, "good");
    privLog(t, r.flavor, "info");
    return { ok: true };
  }

  if (act.type === "drop") {
    const item = t.bag[act.idx];
    if (!item) return { error: "objet introuvable dans le sac" };
    // Empilement autorisé : plusieurs trésors peuvent cohabiter sur une case.
    if (!spendPA(t, g.COSTS.drop)) return { error: "pas assez de PA" };
    t.bag.splice(act.idx, 1);
    world.items.push({ ...item, x: t.x, y: t.y });
    privLog(t, `Tu jettes ${item.emoji} ${item.name} à terre.`, "info");
    return { ok: true };
  }

  if (act.type === "train") {
    const stat = act.stat;
    if (!["att", "esq", "deg", "reg", "pv", "vue", "armor"].includes(stat)) return { error: "caractéristique inconnue" };
    const cost = g.improveCost(stat, t.bought[stat], t.race);
    if (t.pi < cost) return { error: `il te faut ${cost} PI` };
    t.pi -= cost;
    t.bought[stat] += 1;
    if (stat === "pv") { t.pvMax += 10; t.pv += 10; }
    else if (stat === "armor") t.armorDice += 1;
    else t[stat] += 1;
    privLog(t, `📈 Entraînement : ${stat} améliorée pour ${cost} PI.`, "good");
    return { ok: true };
  }

  return { error: "action inconnue" };
}

/* Effet de zone d'un parchemin en multi : monstres à 3 cases ou moins. */
function applyZoneMP(world, t, zone) {
  const targets = world.monsters.filter(m => chebyshev(m, t) <= sc.SCROLL_ZONE_RADIUS);
  for (const m of targets) {
    if (zone.type === "damage") {
      const armMag = Math.max(0, m.armorMag || 0);
      const dmg = Math.max(1, zone.total - armMag);
      m.pv -= dmg;
      privLog(t, `💥 ${m.name} est pris dans l'explosion : −${dmg} PV.`, "combat");
      if (m.pv <= 0) killMonsterMP(world, t, m);
    } else if (zone.type === "vue") {
      m.vueMalus = Math.max(m.vueMalus || 0, zone.malus);
      m.vueMalusTurns = Math.max(m.vueMalusTurns || 0, zone.turns);
      privLog(t, `🌶️ ${m.name} est aveuglé : VUE −${zone.malus}.`, "good");
    }
  }
}

/* ---------- État envoyé au client ---------- */

function gridStrings(world) {
  return world.grid.map(row => row.map(c => c === g.T_WALL ? "#" : ".").join(""));
}

/* Vue du troll : terrain complet (le brouillard est géré côté client),
 * entités limitées à la portée de Vue. Les trolls camouflés sont invisibles
 * pour les autres. */
function stateFor(world, t, now = Date.now()) {
  const te = effTrollMP(t);
  const vue = te.vue;
  const seen = e => chebyshev(e, t) <= vue;
  return {
    now,
    config: { pollSec: world.config.pollSec, trollDlaSec: world.config.trollDlaSec, mapW: world.config.mapW, mapH: world.config.mapH },
    map: gridStrings(world),
    you: {
      id: t.id, name: t.name, race: t.race, x: t.x, y: t.y,
      pv: t.pv, pvMax: t.pvMax, pa: t.pa, pi: t.pi, gold: t.gold, kills: t.kills,
      dla: t.dla, level: g.levelFromTotalPI(t.totalPI),
      dead: t.dead, respawnIn: t.dead ? Math.max(0, t.respawnAt - now) : 0,
      nextDlaIn: Math.max(0, t.nextDla - now),
      camo: t.camo, fatigue: t.fatigue, compUsed: t.compUsed,
      att: t.att, esq: t.esq, deg: t.deg, reg: t.reg, vue: t.vue,
      armorDice: t.armorDice, bought: t.bought,
      comp: { pct: t.comp.pct }, sort: { pct: t.sort.pct },
      eff: te,
      equip: t.equip, bag: t.bag,
      // effets bruts : le client réutilise renderEffectsPanel() du solo,
      // qui a besoin des modificateurs chiffrés (total) en plus des modLines.
      potionEffects: (t.potionEffects || []).map(e => ({ ...e, modLines: e.modLines || [] })),
      blockCamoTurns: t.blockCamoTurns,
    },
    trolls: Object.values(world.trolls)
      .filter(o => o !== t && !o.dead && !o.camo && seen(o))
      .map(o => ({ id: o.id, name: o.name, race: o.race, x: o.x, y: o.y, level: g.levelFromTotalPI(o.totalPI), pvPct: Math.max(0, o.pv / o.pvMax) })),
    monsters: world.monsters.filter(seen)
      .map(m => ({ id: m.id, name: m.name, emoji: m.emoji, x: m.x, y: m.y, level: m.level, pvPct: Math.max(0, m.pv / m.pvMax), nextDlaIn: Math.max(0, m.nextDla - now) })),
    items: world.items.filter(seen)
      .map(i => ({ name: i.name, emoji: i.emoji, x: i.x, y: i.y, kind: i.kind, color: i.color })),
    log: world.log.slice(-25),
    privLog: (t.privLog || []).slice(-30),
  };
}

/* ---------- Admin ---------- */

function adminOverview(world, now = Date.now()) {
  return {
    config: world.config,
    bounds: CONFIG_BOUNDS,
    tuning: currentTuning(),
    defaults: adminDefaults(),
    uptime: now - world.createdAt,
    trolls: Object.values(world.trolls).map(t => ({
      id: t.id, name: t.name, race: t.race, level: g.levelFromTotalPI(t.totalPI),
      pv: t.pv, pvMax: t.pvMax, pa: t.pa, kills: t.kills, gold: t.gold,
      dead: t.dead, x: t.x, y: t.y,
      lastSeenAgo: now - (t.lastSeen || now),
    })),
    monsters: world.monsters.map(m => ({
      id: m.id, name: m.name, emoji: m.emoji, level: m.level, pv: m.pv, pvMax: m.pvMax,
      x: m.x, y: m.y, dlaSec: Math.round(m.dlaMs / 1000), nextDlaIn: Math.max(0, m.nextDla - now),
    })),
    items: world.items.length,
    logTail: world.log.slice(-30),
  };
}

/* Applique des réglages (validés et bornés). La taille de carte ne change
 * qu'à la régénération du monde. Retourne la config effective. */
function adminSetConfig(world, patch, now = Date.now()) {
  const cfg = world.config;
  for (const [key, bounds] of Object.entries(CONFIG_BOUNDS)) {
    if (patch[key] === undefined) continue;
    const v = Number(patch[key]);
    if (!Number.isFinite(v)) continue;
    cfg[key] = Math.max(bounds[0], Math.min(bounds[1], Math.round(v)));
  }
  if (cfg.monsterDlaMinSec > cfg.monsterDlaMaxSec)
    cfg.monsterDlaMaxSec = cfg.monsterDlaMinSec;
  // effet immédiat : les DLA déjà planifiées au-delà des nouvelles bornes sont re-tirées
  for (const m of world.monsters) {
    if (m.nextDla - now > cfg.monsterDlaMaxSec * 1000) {
      m.dlaMs = Math.round(monsterDlaMs(cfg));
      m.nextDla = now + m.dlaMs;
    }
  }
  for (const t of Object.values(world.trolls)) {
    if (t.nextDla - now > cfg.trollDlaSec * 1000) t.nextDla = now + cfg.trollDlaSec * 1000;
  }
  return cfg;
}

/* Valeurs de base (vanilla) pour construire les formulaires de tuning admin. */
function adminDefaults() {
  return {
    monsters: db.vanillaMonsters(),
    monsterKeys: MONSTER_TUNE_KEYS,
    gear: db.vanillaGear().map(it => ({
      slot: it.slot, name: it.name, emoji: it.emoji, twoHanded: it.twoHanded,
      mods: Object.fromEntries(GEAR_TUNE_KEYS.map(k => [k, it[k] || 0])),
    })),
    gearKeys: GEAR_TUNE_KEYS,
    potions: db.vanillaTreasures("potions").map(t => ({ id: t.id, name: t.name, emoji: t.emoji, min: t.powerMin, max: t.powerMax })),
    scrolls: db.vanillaTreasures("scrolls").map(t => ({ id: t.id, name: t.name, emoji: t.emoji, min: t.powerMin, max: t.powerMax })),
  };
}

/* Écarts actuels entre la base et le vanilla (pour surligner dans l'admin). */
function currentTuning() {
  const out = { monsters: {}, gear: {}, potions: {}, scrolls: {} };
  const vm = Object.fromEntries(db.vanillaMonsters().map(m => [m.name, m]));
  for (const m of db.monsters()) {
    if (!vm[m.name]) continue;
    const d = {};
    for (const k of MONSTER_TUNE_KEYS) if ((m[k] || 0) !== vm[m.name][k]) d[k] = m[k];
    if (Object.keys(d).length) out.monsters[m.name] = d;
  }
  const vg = Object.fromEntries(db.vanillaGear().map(i => [`${i.slot}/${i.name}`, i]));
  for (const it of db.gearAll()) {
    const key = `${it.slot}/${it.name}`;
    if (!vg[key]) continue;
    const d = {};
    for (const k of GEAR_TUNE_KEYS) if ((it[k] || 0) !== vg[key][k]) d[k] = it[k];
    if (Object.keys(d).length) out.gear[key] = d;
  }
  for (const cat of ["potions", "scrolls"]) {
    const defaults = cat === "potions" ? db.POTION_POWER_DEFAULTS : db.SCROLL_POWER_DEFAULTS;
    for (const t of db.treasuresAll(cat)) {
      if (defaults[t.id] && !sameRange([t.powerMin, t.powerMax], defaults[t.id])) {
        out[cat][t.id] = [t.powerMin, t.powerMax];
      }
    }
  }
  return out;
}

const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(v)));

/* Applique un patch de tuning. Mises à jour CIBLÉES : seuls les objets fournis
 * (valeurs absolues) sont écrits, sans toucher au reste de la catégorie — ainsi
 * les éditions faites en parallèle dans la base (sqlite-web) ne sont PAS écrasées.
 * `patch.reset` (tableau de catégories) remet explicitement une catégorie entière
 * au vanilla (bouton « Tout remettre d'origine »). */
function adminSetTuning(world, patch) {
  const known = {
    monsters: new Set(db.vanillaMonsters().map(t => t.name)),
    gear: new Set(db.vanillaGear().map(i => `${i.slot}/${i.name}`)),
    potions: new Set(p.POTION_IDS),
    scrolls: new Set(sc.SCROLL_IDS),
  };
  if (Array.isArray(patch.reset)) {
    for (const cat of patch.reset) {
      if (["monsters", "gear", "potions", "scrolls", "bestiary", "ages"].includes(cat)) db.resetCategory(cat);
    }
  }
  // Bestiaire : multiplicateurs d'âge + édition d'un monstre (valeurs absolues).
  if (patch.ages && typeof patch.ages === "object") {
    for (const [age, mult] of Object.entries(patch.ages)) {
      const a = Number(age), m = Number(mult);
      if (Number.isInteger(a) && a >= 0 && a <= 7 && Number.isFinite(m)) db.setMonsterAge(a, Math.max(0, Math.min(99, m)));
    }
  }
  if (patch.bestiary && typeof patch.bestiary === "object") {
    const knownB = new Set(db.bestiaryAll().map(b => b.name));
    const txt = new Set(["family", "speed", "capacities", "blason"]);
    for (const [name, vals] of Object.entries(patch.bestiary)) {
      if (!knownB.has(name) || typeof vals !== "object") continue;
      const entry = {};
      for (const k of db.BESTIARY_KEYS) {
        if (vals[k] == null) continue;
        if (txt.has(k)) entry[k] = String(vals[k]).slice(0, 300);
        else { const v = Number(vals[k]); if (Number.isFinite(v)) entry[k] = clampInt(v, 0, 99999); }
      }
      if (Object.keys(entry).length) db.setBestiary(name, entry);
    }
  }
  if (patch.monsters && typeof patch.monsters === "object") {
    for (const [name, vals] of Object.entries(patch.monsters)) {
      if (!known.monsters.has(name) || typeof vals !== "object") continue;
      const entry = {};
      for (const k of MONSTER_TUNE_KEYS) {
        const v = Number(vals[k]);
        if (Number.isFinite(v)) entry[k] = clampInt(v, MONSTER_TUNE_BOUNDS[k][0], MONSTER_TUNE_BOUNDS[k][1]);
      }
      if (Object.keys(entry).length) db.setMonster(name, entry);
    }
  }
  if (patch.gear && typeof patch.gear === "object") {
    for (const [key, mods] of Object.entries(patch.gear)) {
      if (!known.gear.has(key) || typeof mods !== "object") continue;
      const entry = {};
      for (const k of GEAR_TUNE_KEYS) {
        const v = Number(mods[k]);
        if (Number.isFinite(v)) entry[k] = clampInt(v, GEAR_TUNE_BOUNDS[0], GEAR_TUNE_BOUNDS[1]);
      }
      if (Object.keys(entry).length) {
        const slash = key.indexOf("/");
        db.setGear(key.slice(0, slash), key.slice(slash + 1), entry);
      }
    }
  }
  for (const cat of ["potions", "scrolls"]) {
    if (!patch[cat] || typeof patch[cat] !== "object") continue;
    for (const [id, range] of Object.entries(patch[cat])) {
      if (!known[cat].has(id) || !Array.isArray(range)) continue;
      const lo = Number(range[0]), hi = Number(range[1]);
      if (!Number.isFinite(lo) || !Number.isFinite(hi)) continue;
      db.setTreasureRange(cat, id, [
        clampInt(Math.min(lo, hi), POWER_BOUNDS[0], POWER_BOUNDS[1]),
        clampInt(Math.max(lo, hi), POWER_BOUNDS[0], POWER_BOUNDS[1]),
      ]);
    }
  }
  return currentTuning();
}

/* Supprime définitivement un troll du monde (admin). */
function adminKickTroll(world, id) {
  const t = world.trolls[id];
  if (!t) return { error: "troll inconnu" };
  delete world.trolls[id];
  worldLog(world, `⚡ Les Dieux Trõlls ont rappelé ${t.name} hors du Monde Souterrain.`);
  return { ok: true, name: t.name };
}

/* Régénère le monde (carte, monstres, trésors) en conservant trolls et config ;
 * les trolls sont replacés. */
function adminResetWorld(world) {
  const cfg = world.config;
  world.grid = g.generateCavern(cfg.mapW, cfg.mapH);
  world.monsters = [];
  world.items = [];
  world.nextId = 1;
  world.nextRepop = 0;
  for (let i = 0; i < cfg.monsterTarget; i++) spawnMonster(world);
  for (let i = 0; i < cfg.itemTarget; i++) spawnItem(world);
  for (const t of Object.values(world.trolls)) {
    const pos = randomFloor(world);
    if (pos) { t.x = pos.x; t.y = pos.y; }
    privLog(t, "🌋 Le Monde Souterrain a été régénéré par les Dieux Trõlls !", "info");
  }
  worldLog(world, "🌋 Le Monde Souterrain a été régénéré !", "good");
}

/* ---------- Persistance ---------- */

function saveWorld(world, file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(world));
  fs.renameSync(tmp, file);
}

function loadWorld(file) {
  try {
    const world = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!world || !world.grid || !world.trolls) return null;
    world.config = { ...DEFAULT_CONFIG, ...world.config };
    // migration < 2.3.0 : les écarts de tuning vivaient dans world.json,
    // on les déverse une fois dans la base puis on les retire du monde
    if (world.tuning) {
      const hasDeltas = Object.values(world.tuning).some(cat => cat && Object.keys(cat).length);
      if (hasDeltas) adminSetTuning(world, world.tuning);
      delete world.tuning;
    }
    return world;
  } catch { return null; }
}

module.exports = {
  DEFAULT_CONFIG, CONFIG_BOUNDS,
  createWorld, tick, newTroll, authTroll, login, action, stateFor,
  adminOverview, adminSetConfig, adminSetTuning, adminDefaults, adminResetWorld, adminKickTroll,
  currentTuning, saveWorld, loadWorld,
  spawnMonster, spawnItem, monsterAct, trollDla, worldLog,
  tunedRandomPotion, tunedRandomScroll, applyGearTuning, applyGearTemplates,
};
