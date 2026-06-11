/* MountyCrawl — roguelike hommage à MountyHall (https://www.mountyhall.com)
 * Vanilla JS, aucune dépendance. Le cœur des règles (dés, combat, progression)
 * est exporté pour les tests node (voir test/smoke.js). */

"use strict";

/* ================= Dés & règles de base ================= */

function rollDice(n, faces) {
  const rolls = [];
  for (let i = 0; i < n; i++) rolls.push(1 + Math.floor(Math.random() * faces));
  return { total: rolls.reduce((a, b) => a + b, 0), rolls };
}

/* Jet d'attaque MountyHall : somme de ATT D6 contre somme de ESQ D6.
 * Si l'attaque dépasse l'esquive, dégâts = DEG D6 (+ bonus d'arme) − armure. */
function resolveAttack(attacker, defender, opts = {}) {
  const att = rollDice(attacker.att, 6);
  const esq = rollDice(defender.esq, 6);
  const result = {
    attRoll: att.total, esqRoll: esq.total,
    attDice: attacker.att, esqDice: defender.esq,
    hit: att.total > esq.total, damage: 0, rawDamage: 0,
  };
  if (result.hit) {
    const deg = rollDice(attacker.deg, 6);
    result.rawDamage = deg.total + (attacker.degBonus || 0);
    const armor = opts.ignoreArmor ? 0 : (defender.armor || 0);
    result.damage = Math.max(1, result.rawDamage - armor);
  }
  return result;
}

/* Sortilège façon MM vs RM : Seuil de Résistance borné à [10, 90] %. */
function resolveSpell(mm, rm) {
  const sr = Math.min(90, Math.max(10, Math.round(50 + (mm - rm) * 5)));
  const roll = 1 + Math.floor(Math.random() * 100);
  return { sr, roll, success: roll <= sr };
}

/* Coût en PI du prochain dé d'une caractéristique : (dés actuels + 1) × coût de base,
 * réduit pour la caractéristique favorite de la race (cf. règles MH). */
function improveCost(stat, currentValue, race) {
  const base = { att: 18, esq: 18, deg: 18, reg: 15, pv: 10, vue: 15 };
  const favored = RACES[race].favored === stat;
  const mult = favored ? Math.ceil(base[stat] * 2 / 3) : base[stat];
  if (stat === "pv") return mult; // +5 PV, coût fixe
  return (currentValue + 1) * mult;
}

/* Niveau d'ancienneté : passer au niveau N coûte 10×N PI gagnés (cumulés). */
function levelFromTotalPI(totalPI) {
  let level = 1, spent = 0;
  while (spent + 10 * (level + 1) <= totalPI) { spent += 10 * (level + 1); level++; }
  return level;
}

/* ================= Les 5 races ================= */

const RACES = {
  Skrim: {
    emoji: "🟢", favored: "att",
    desc: "Rapides et précis, ils frappent deux fois là où d'autres hésitent.",
    ability: "Frappe Double (4 PA) : deux attaques dans le même assaut.",
    stats: { att: 4, esq: 4, deg: 1, reg: 2, pvMax: 35, vue: 3 },
  },
  Kastar: {
    emoji: "🔴", favored: "deg",
    desc: "Les vampires du Hall : leurs coups les nourrissent.",
    ability: "Morsure Vampirique (4 PA) : attaque qui soigne 50 % des dégâts infligés.",
    stats: { att: 3, esq: 3, deg: 3, reg: 1, pvMax: 40, vue: 2 },
  },
  Durakuir: {
    emoji: "🟤", favored: "pv",
    desc: "Les tanks du Hall, durs au mal et infatigables.",
    ability: "Peau de Pierre (2 PA) : +3 d'armure jusqu'à la prochaine DLA.",
    stats: { att: 3, esq: 2, deg: 2, reg: 3, pvMax: 55, vue: 2 },
  },
  Tomawak: {
    emoji: "🟡", favored: "vue",
    desc: "Trõlls furtifs, chasseurs embusqués aux yeux perçants.",
    ability: "Camouflage (3 PA) : invisible aux monstres jusqu'à la prochaine DLA.",
    stats: { att: 3, esq: 3, deg: 2, reg: 2, pvMax: 40, vue: 4 },
  },
  Darkling: {
    emoji: "🟣", favored: "reg",
    desc: "Mystiques des profondeurs, ils siphonnent l'âme de leurs proies.",
    ability: "Siphon d'Âme (3 PA) : 2D6 dégâts magiques (MM vs RM, ignore l'armure), soigne la moitié.",
    stats: { att: 2, esq: 3, deg: 2, reg: 3, pvMax: 38, vue: 3 },
  },
};

/* ================= Bestiaire ================= */

const MONSTER_TYPES = [
  { name: "Gobelin",           emoji: "👺", level: 1, att: 2, esq: 2, deg: 1, pv: 12, armor: 0, vue: 4 },
  { name: "Champignon Vénéneux", emoji: "🍄", level: 1, att: 3, esq: 1, deg: 2, pv: 10, armor: 0, vue: 1, static: true },
  { name: "Araignée Géante",   emoji: "🕷️", level: 2, att: 3, esq: 3, deg: 2, pv: 16, armor: 0, vue: 5 },
  { name: "Gargouille",        emoji: "🦇", level: 3, att: 3, esq: 3, deg: 2, pv: 22, armor: 2, vue: 4 },
  { name: "Momie",             emoji: "🧟", level: 3, att: 4, esq: 2, deg: 3, pv: 26, armor: 1, vue: 3 },
  { name: "Sorcière",          emoji: "🧙", level: 4, att: 4, esq: 3, deg: 3, pv: 24, armor: 0, vue: 6 },
  { name: "Golem de Pierre",   emoji: "🗿", level: 5, att: 4, esq: 1, deg: 4, pv: 40, armor: 4, vue: 3 },
];

const BOSS = { name: "Béhémoth", emoji: "👹", level: 9, att: 6, esq: 4, deg: 5, pv: 90, armor: 3, vue: 8, boss: true };

/* Gabarits d'âge façon MountyHall : plus on descend, plus les bêtes sont vieilles. */
const TEMPLATES = [
  { prefix: "Jeune ",   mult: 0.7 },
  { prefix: "",         mult: 1.0 },
  { prefix: "Vieux ",   mult: 1.3 },
  { prefix: "Ancien ",  mult: 1.6 },
  { prefix: "Mythique ", mult: 2.0 },
];

function makeMonster(depth, x, y) {
  const pool = MONSTER_TYPES.filter(m => m.level <= depth + 1 && m.level >= Math.max(1, depth - 2));
  const type = pool[Math.floor(Math.random() * pool.length)];
  const tplMax = Math.min(TEMPLATES.length - 1, depth - 1);
  const tpl = TEMPLATES[Math.floor(Math.random() * (tplMax + 1))];
  return {
    name: tpl.prefix + type.name, emoji: type.emoji,
    level: Math.max(1, Math.round(type.level * tpl.mult)),
    att: Math.max(1, Math.round(type.att * tpl.mult)),
    esq: Math.max(1, Math.round(type.esq * tpl.mult)),
    deg: Math.max(1, Math.round(type.deg * tpl.mult)),
    pv: Math.round(type.pv * tpl.mult), pvMax: Math.round(type.pv * tpl.mult),
    armor: type.armor, vue: type.vue, static: !!type.static,
    x, y, boss: false,
  };
}

/* ================= Génération du Monde Souterrain ================= */

const MAP_W = 28, MAP_H = 20;
const T_WALL = 0, T_FLOOR = 1, T_STAIRS = 2;

function generateCavern(w, h) {
  let grid = [];
  for (let y = 0; y < h; y++) {
    grid.push([]);
    for (let x = 0; x < w; x++) {
      const border = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      grid[y].push(border || Math.random() < 0.42 ? T_WALL : T_FLOOR);
    }
  }
  // Automate cellulaire : 4 passes de lissage
  for (let pass = 0; pass < 4; pass++) {
    const next = grid.map(row => row.slice());
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        let walls = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++)
            if (grid[y + dy][x + dx] === T_WALL) walls++;
        next[y][x] = walls >= 5 ? T_WALL : T_FLOOR;
      }
    }
    grid = next;
  }
  // Ne garder que la plus grande zone connexe
  const region = largestRegion(grid, w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (grid[y][x] === T_FLOOR && !region.has(y * w + x)) grid[y][x] = T_WALL;
  return grid;
}

function largestRegion(grid, w, h) {
  const seen = new Set();
  let best = new Set();
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const key = y * w + x;
      if (grid[y][x] !== T_FLOOR || seen.has(key)) continue;
      const region = new Set();
      const stack = [[x, y]];
      while (stack.length) {
        const [cx, cy] = stack.pop();
        const ck = cy * w + cx;
        if (seen.has(ck) || grid[cy][cx] !== T_FLOOR) continue;
        seen.add(ck); region.add(ck);
        stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
      }
      if (region.size > best.size) best = region;
    }
  }
  return best;
}

function randomFloor(grid, taken) {
  for (let tries = 0; tries < 500; tries++) {
    const x = 1 + Math.floor(Math.random() * (MAP_W - 2));
    const y = 1 + Math.floor(Math.random() * (MAP_H - 2));
    if (grid[y][x] === T_FLOOR && !taken.has(y * MAP_W + x)) {
      taken.add(y * MAP_W + x);
      return { x, y };
    }
  }
  return null;
}

/* ================= Objets ================= */

const WEAPONS = [
  { name: "Dague Rouillée", emoji: "🗡️", slot: "weapon", bonus: 1 },
  { name: "Hache de Jet",   emoji: "🪓", slot: "weapon", bonus: 2 },
  { name: "Épée Longue",    emoji: "⚔️", slot: "weapon", bonus: 3 },
  { name: "Masse d'Armes",  emoji: "🔨", slot: "weapon", bonus: 4 },
];
const ARMORS = [
  { name: "Armure de Cuir",   emoji: "🦺", slot: "armor", bonus: 1 },
  { name: "Cotte de Mailles", emoji: "🥋", slot: "armor", bonus: 2 },
  { name: "Armure de Plates", emoji: "🛡️", slot: "armor", bonus: 3 },
];

function makeItem(depth) {
  const r = Math.random();
  if (r < 0.35) return { kind: "potion", name: "Potion de Vie", emoji: "🧪" };
  if (r < 0.55) {
    const w = WEAPONS[Math.min(WEAPONS.length - 1, Math.floor(Math.random() * (depth + 1)))];
    return { kind: "gear", ...w };
  }
  if (r < 0.7) {
    const a = ARMORS[Math.min(ARMORS.length - 1, Math.floor(Math.random() * depth))];
    return { kind: "gear", ...a };
  }
  const gold = rollDice(depth, 6).total * 10;
  return { kind: "gold", name: `${gold} Mountyzédons`, emoji: "💰", gold };
}

/* ================= État du jeu ================= */

const MAX_DEPTH = 5;
const PA_PER_TURN = 6;
const COSTS = { move: 1, attack: 3, pickup: 1, equip: 2, potion: 1 };

let G = null; // état global de la partie

function newGame(name, race) {
  const s = RACES[race].stats;
  G = {
    troll: {
      name, race,
      att: s.att, esq: s.esq, deg: s.deg, reg: s.reg,
      pv: s.pvMax, pvMax: s.pvMax, vue: s.vue,
      degBonus: 0, armor: 0, mm: race === "Darkling" ? 4 : 2,
      weapon: null, armorItem: null,
      pa: PA_PER_TURN, pi: 0, totalPI: 0, gold: 0,
      bag: [], camo: false, stoneSkin: 0, kills: 0, dla: 1,
    },
    depth: 1, grid: null, monsters: [], items: [], stairs: null,
    seen: new Set(), over: false,
  };
  buildLevel();
  log(`${name} le ${race} pénètre dans le Monde Souterrain. Que les Dieux Trõlls te gardent !`, "good");
}

function buildLevel() {
  const grid = generateCavern(MAP_W, MAP_H);
  const taken = new Set();
  const start = randomFloor(grid, taken);
  G.grid = grid;
  G.troll.x = start.x; G.troll.y = start.y;
  G.seen = new Set();

  G.monsters = [];
  if (G.depth === MAX_DEPTH) {
    const bp = randomFloor(grid, taken);
    G.monsters.push({ ...BOSS, pvMax: BOSS.pv, x: bp.x, y: bp.y, static: false });
  }
  const count = 4 + G.depth * 2 - (G.depth === MAX_DEPTH ? 3 : 0);
  for (let i = 0; i < count; i++) {
    const p = randomFloor(grid, taken);
    if (p) G.monsters.push(makeMonster(G.depth, p.x, p.y));
  }

  G.items = [];
  for (let i = 0; i < 3 + G.depth; i++) {
    const p = randomFloor(grid, taken);
    if (p) G.items.push({ ...makeItem(G.depth), x: p.x, y: p.y });
  }

  if (G.depth < MAX_DEPTH) {
    const p = randomFloor(grid, taken);
    grid[p.y][p.x] = T_STAIRS;
    G.stairs = p;
  } else {
    G.stairs = null;
  }
  updateFov();
}

/* ================= Champ de vision (la Vue du troll) ================= */

function updateFov() {
  const { x, y } = G.troll;
  const r = G.troll.vue;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const tx = x + dx, ty = y + dy;
      if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) continue;
      if (dx * dx + dy * dy <= r * r) G.seen.add(ty * MAP_W + tx);
    }
  }
}

function inSight(e) {
  const dx = e.x - G.troll.x, dy = e.y - G.troll.y;
  return dx * dx + dy * dy <= G.troll.vue * G.troll.vue;
}

/* ================= Actions du troll ================= */

function spendPA(cost) {
  if (G.troll.pa < cost) { log(`Pas assez de PA (${cost} requis).`, "info"); return false; }
  G.troll.pa -= cost;
  return true;
}

function tryMove(dx, dy) {
  if (G.over) return;
  const t = G.troll;
  const nx = t.x + dx, ny = t.y + dy;
  if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) return;
  if (G.grid[ny][nx] === T_WALL) return;

  const target = G.monsters.find(m => m.x === nx && m.y === ny);
  if (target) { attackMonster(target); return; }

  if (!spendPA(COSTS.move)) return;
  t.x = nx; t.y = ny;
  updateFov();

  if (G.grid[ny][nx] === T_STAIRS) {
    log("Un passage s'enfonce vers les profondeurs… (bouton « Descendre »)", "info");
  }
  const item = G.items.find(i => i.x === nx && i.y === ny);
  if (item) log(`Tu vois : ${item.emoji} ${item.name}. Ramasse-le pour ${COSTS.pickup} PA.`, "info");
  afterAction();
}

function attackMonster(m, opts = {}) {
  const cost = opts.cost ?? COSTS.attack;
  if (!spendPA(cost)) return false;
  const swings = opts.swings || 1;
  for (let i = 0; i < swings && m.pv > 0; i++) {
    const r = resolveAttack(G.troll, m);
    if (r.hit) {
      m.pv -= r.damage;
      G.troll.pi += 1; G.troll.totalPI += 1; // +1 PX par attaque réussie (converti en PI)
      log(`Tu attaques ${m.name} : ATT ${r.attDice}D6=${r.attRoll} vs ESQ ${r.esqDice}D6=${r.esqRoll} → touché ! ${r.rawDamage} dégâts (−${m.armor} armure) = ${r.damage} PV.`, "combat");
      if (opts.vampiric) {
        const heal = Math.ceil(r.damage / 2);
        G.troll.pv = Math.min(G.troll.pvMax, G.troll.pv + heal);
        log(`🩸 Morsure Vampirique : tu récupères ${heal} PV.`, "good");
      }
      if (m.pv <= 0) killMonster(m);
    } else {
      log(`Tu attaques ${m.name} : ATT ${r.attDice}D6=${r.attRoll} vs ESQ ${r.esqDice}D6=${r.esqRoll} → esquivé !`, "combat");
    }
  }
  G.troll.camo = false;
  afterAction();
  return true;
}

function killMonster(m) {
  const px = m.level * 2;
  G.troll.pi += px; G.troll.totalPI += px;
  G.troll.kills++;
  log(`💀 ${m.name} est terrassé ! +${px} PX (convertis en PI à l'entraînement).`, "good");
  G.monsters = G.monsters.filter(x => x !== m);
  if (m.boss) win();
}

function useAbility() {
  if (G.over) return;
  const t = G.troll;
  const race = t.race;
  if (race === "Skrim") {
    const m = adjacentMonster();
    if (!m) { log("Aucun monstre adjacent pour la Frappe Double.", "info"); return; }
    log("⚡ Frappe Double !", "good");
    attackMonster(m, { cost: 4, swings: 2 });
  } else if (race === "Kastar") {
    const m = adjacentMonster();
    if (!m) { log("Aucun monstre adjacent pour la Morsure Vampirique.", "info"); return; }
    attackMonster(m, { cost: 4, vampiric: true });
  } else if (race === "Durakuir") {
    if (!spendPA(2)) return;
    t.stoneSkin = 3;
    log("🪨 Peau de Pierre : +3 d'armure jusqu'à la prochaine DLA.", "good");
    afterAction();
  } else if (race === "Tomawak") {
    if (!spendPA(3)) return;
    t.camo = true;
    log("🌫️ Camouflage : les monstres ne te voient plus jusqu'à la prochaine DLA.", "good");
    afterAction();
  } else if (race === "Darkling") {
    const m = adjacentMonster();
    if (!m) { log("Aucun monstre adjacent pour le Siphon d'Âme.", "info"); return; }
    if (!spendPA(3)) return;
    const spell = resolveSpell(t.mm, Math.ceil(m.level / 2));
    if (spell.success) {
      const dmg = rollDice(2, 6).total;
      m.pv -= dmg;
      const heal = Math.ceil(dmg / 2);
      t.pv = Math.min(t.pvMax, t.pv + heal);
      G.troll.pi += 1; G.troll.totalPI += 1;
      log(`🔮 Siphon d'Âme (SR ${spell.sr}%, jet ${spell.roll}) : ${dmg} dégâts, tu récupères ${heal} PV.`, "good");
      if (m.pv <= 0) killMonster(m);
    } else {
      log(`🔮 Siphon d'Âme raté (SR ${spell.sr}%, jet ${spell.roll}).`, "combat");
    }
    afterAction();
  }
}

function adjacentMonster() {
  return G.monsters.find(m => Math.abs(m.x - G.troll.x) <= 1 && Math.abs(m.y - G.troll.y) <= 1);
}

function pickup() {
  const i = G.items.find(it => it.x === G.troll.x && it.y === G.troll.y);
  if (!i) return;
  if (!spendPA(COSTS.pickup)) return;
  G.items = G.items.filter(x => x !== i);
  if (i.kind === "gold") {
    G.troll.gold += i.gold;
    log(`💰 Tu ramasses ${i.gold} Mountyzédons.`, "good");
  } else {
    G.troll.bag.push(i);
    log(`Tu ramasses ${i.emoji} ${i.name}.`, "good");
  }
  afterAction();
}

function useBagItem(idx) {
  const t = G.troll;
  const item = t.bag[idx];
  if (!item) return;
  if (item.kind === "potion") {
    if (!spendPA(COSTS.potion)) return;
    const heal = rollDice(2, 6).total + 3;
    t.pv = Math.min(t.pvMax, t.pv + heal);
    t.bag.splice(idx, 1);
    log(`🧪 Glou glou : +${heal} PV.`, "good");
  } else if (item.kind === "gear") {
    if (!spendPA(COSTS.equip)) return;
    if (item.slot === "weapon") {
      if (t.weapon) t.bag.push(t.weapon);
      t.weapon = item; t.degBonus = item.bonus;
    } else {
      if (t.armorItem) t.bag.push(t.armorItem);
      t.armorItem = item; t.armor = item.bonus;
    }
    t.bag.splice(t.bag.indexOf(item), 1);
    log(`Tu t'équipes : ${item.emoji} ${item.name} (+${item.bonus}).`, "good");
  }
  afterAction();
}

function descend() {
  if (G.grid[G.troll.y][G.troll.x] !== T_STAIRS) return;
  G.depth++;
  log(`⬇️ Tu descends. Profondeur −${G.depth}. L'air devient lourd…`, "info");
  if (G.depth === MAX_DEPTH) log("👹 Le sol tremble. Le Béhémoth est proche.", "bad");
  buildLevel();
  afterAction();
}

function improveStat(stat) {
  const t = G.troll;
  const current = stat === "pv" ? t.pvMax : t[stat];
  const cost = improveCost(stat, stat === "pv" ? 0 : current, t.race);
  if (t.pi < cost) return;
  t.pi -= cost;
  if (stat === "pv") { t.pvMax += 5; t.pv += 5; }
  else t[stat] += 1;
  const label = { att: "Attaque", esq: "Esquive", deg: "Dégâts", reg: "Régénération", pv: "PV max", vue: "Vue" }[stat];
  log(`📈 Entraînement : ${label} améliorée pour ${cost} PI.`, "good");
  if (stat === "vue") updateFov();
  afterAction();
}

/* ================= La DLA : tour des monstres + régénération ================= */

function passDLA() {
  if (G.over) return;
  const t = G.troll;
  t.dla++;

  // Tour des monstres
  for (const m of G.monsters) {
    if (m.pv <= 0) continue;
    const dist = Math.max(Math.abs(m.x - t.x), Math.abs(m.y - t.y));
    const seesTroll = !t.camo && dist <= m.vue;
    if (dist <= 1 && !t.camo) {
      const armorBonus = t.stoneSkin > 0 ? 3 : 0;
      const r = resolveAttack(m, { ...t, armor: t.armor + armorBonus });
      if (r.hit) {
        t.pv -= r.damage;
        log(`${m.emoji} ${m.name} t'attaque : ${r.attDice}D6=${r.attRoll} vs ${r.esqDice}D6=${r.esqRoll} → ${r.damage} dégâts !`, "bad");
        if (t.pv <= 0) { die(m); return; }
      } else {
        log(`${m.emoji} ${m.name} t'attaque… et tu esquives !`, "combat");
      }
    } else if (seesTroll && !m.static) {
      stepToward(m, t);
    } else if (!m.static && Math.random() < 0.4) {
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      const [dx, dy] = dirs[Math.floor(Math.random() * 4)];
      moveMonster(m, m.x + dx, m.y + dy);
    }
  }

  // Régénération (REG D3, comme à MountyHall)
  if (t.pv < t.pvMax && t.pv > 0) {
    const r = rollDice(t.reg, 3);
    t.pv = Math.min(t.pvMax, t.pv + r.total);
    log(`💤 Nouvelle DLA n°${t.dla} : tu régénères ${r.total} PV (${t.reg}D3).`, "info");
  } else {
    log(`💤 Nouvelle DLA n°${t.dla}.`, "info");
  }

  t.pa = PA_PER_TURN;
  t.camo = false;
  if (t.stoneSkin > 0) t.stoneSkin--;
  afterAction();
}

function stepToward(m, t) {
  const dx = Math.sign(t.x - m.x), dy = Math.sign(t.y - m.y);
  if (dx !== 0 && moveMonster(m, m.x + dx, m.y)) return;
  if (dy !== 0 && moveMonster(m, m.x, m.y + dy)) return;
  if (dx !== 0 && dy !== 0) moveMonster(m, m.x + dx, m.y + dy);
}

function moveMonster(m, nx, ny) {
  if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) return false;
  if (G.grid[ny][nx] === T_WALL) return false;
  if (nx === G.troll.x && ny === G.troll.y) return false;
  if (G.monsters.some(o => o !== m && o.x === nx && o.y === ny)) return false;
  m.x = nx; m.y = ny;
  return true;
}

function die(killer) {
  G.over = true;
  log(`☠️ ${killer.name} t'a terrassé…`, "bad");
  showEnd(false, killer);
}

function win() {
  G.over = true;
  log("🏆 Le Béhémoth s'effondre ! Le Trésor de MountyHall est à toi !", "good");
  showEnd(true);
}

/* ================= Interface ================= */

const $ = id => document.getElementById(id);
const TILE = 24;

function log(msg, cls = "info") {
  if (typeof document === "undefined") return;
  const el = $("log");
  if (!el) return;
  const line = document.createElement("div");
  line.className = "l-" + cls;
  line.textContent = msg;
  el.appendChild(line);
  el.scrollTop = el.scrollHeight;
  while (el.children.length > 200) el.removeChild(el.firstChild);
}

function afterAction() {
  if (typeof document === "undefined") return;
  render();
  renderPanels();
  if (!G.over && G.troll.pa === 0) {
    log("Plus de PA — la DLA expire…", "info");
    setTimeout(passDLA, 350);
  }
}

function render() {
  const canvas = $("map");
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = "18px serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const key = y * MAP_W + x;
      const px = x * TILE, py = y * TILE;
      if (!G.seen.has(key)) { ctx.fillStyle = "#0d0a06"; ctx.fillRect(px, py, TILE, TILE); continue; }
      const visible = (x - G.troll.x) ** 2 + (y - G.troll.y) ** 2 <= G.troll.vue ** 2;
      const t = G.grid[y][x];
      if (t === T_WALL) ctx.fillStyle = visible ? "#4a3a22" : "#2c2315";
      else ctx.fillStyle = visible ? "#7a6a45" : "#3d3522";
      ctx.fillRect(px, py, TILE - 1, TILE - 1);
      if (t === T_STAIRS) {
        ctx.fillStyle = "#111";
        ctx.fillText("▼", px + TILE / 2, py + TILE / 2 + 1);
      }
    }
  }

  for (const i of G.items) {
    if (!G.seen.has(i.y * MAP_W + i.x)) continue;
    ctx.fillText(i.emoji, i.x * TILE + TILE / 2, i.y * TILE + TILE / 2 + 1);
  }
  for (const m of G.monsters) {
    if (!inSight(m)) continue;
    ctx.fillText(m.emoji, m.x * TILE + TILE / 2, m.y * TILE + TILE / 2 + 1);
    // barre de vie du monstre
    const w = Math.max(2, Math.round((TILE - 6) * m.pv / m.pvMax));
    ctx.fillStyle = "#b03030";
    ctx.fillRect(m.x * TILE + 3, m.y * TILE + 1, w, 3);
  }
  ctx.fillText("🧌", G.troll.x * TILE + TILE / 2, G.troll.y * TILE + TILE / 2 + 1);
  if (G.troll.camo) {
    ctx.strokeStyle = "#8fbf5a";
    ctx.strokeRect(G.troll.x * TILE + 1, G.troll.y * TILE + 1, TILE - 2, TILE - 2);
  }
}

function renderPanels() {
  const t = G.troll;
  $("depth-label").textContent = `Profondeur −${G.depth} · DLA n°${t.dla}`;
  $("troll-title").textContent = `${RACES[t.race].emoji} ${t.name}, ${t.race} niv. ${levelFromTotalPI(t.totalPI)}`;

  const pct = Math.max(0, t.pv / t.pvMax);
  const hpClass = pct > 0.6 ? "high" : pct > 0.3 ? "mid" : "";
  $("stats").innerHTML = `
    <div><span>PV</span><span class="stat-val">${t.pv} / ${t.pvMax}</span></div>
    <div class="hp-bar-wrap"><div class="hp-bar ${hpClass}" style="width:${pct * 100}%"></div></div>
    <div><span>Attaque</span><span class="stat-val">${t.att}D6</span></div>
    <div><span>Esquive</span><span class="stat-val">${t.esq}D6</span></div>
    <div><span>Dégâts</span><span class="stat-val">${t.deg}D6${t.degBonus ? "+" + t.degBonus : ""}</span></div>
    <div><span>Régénération</span><span class="stat-val">${t.reg}D3</span></div>
    <div><span>Armure</span><span class="stat-val">${t.armor + (t.stoneSkin > 0 ? 3 : 0)}</span></div>
    <div><span>Vue</span><span class="stat-val">${t.vue}</span></div>
    <div><span>PI</span><span class="stat-val">${t.pi}</span></div>
    <div><span>Mountyzédons</span><span class="stat-val">${t.gold}</span></div>
    <div><span>Monstres tués</span><span class="stat-val">${t.kills}</span></div>`;

  const improve = $("improve");
  improve.innerHTML = "";
  const labels = { att: "Attaque +1D6", esq: "Esquive +1D6", deg: "Dégâts +1D6", reg: "Régén. +1D3", pv: "PV max +5", vue: "Vue +1" };
  for (const stat of Object.keys(labels)) {
    const current = stat === "pv" ? 0 : t[stat];
    const cost = improveCost(stat, current, t.race);
    const btn = document.createElement("button");
    const fav = RACES[t.race].favored === stat ? " ★" : "";
    btn.textContent = `${labels[stat]} — ${cost} PI${fav}`;
    btn.disabled = t.pi < cost || G.over;
    btn.onclick = () => improveStat(stat);
    improve.appendChild(btn);
  }

  $("pa-bar").textContent = "⚡".repeat(t.pa) + "▫️".repeat(PA_PER_TURN - t.pa);

  const actions = $("actions");
  actions.innerHTML = "";
  const addBtn = (label, fn, enabled) => {
    const b = document.createElement("button");
    b.textContent = label;
    b.disabled = !enabled || G.over;
    b.onclick = fn;
    actions.appendChild(b);
  };
  const adj = adjacentMonster();
  addBtn(`⚔️ Attaquer (${COSTS.attack} PA)`, () => adj && attackMonster(adj), adj && t.pa >= COSTS.attack);
  const abilityCost = { Skrim: 4, Kastar: 4, Durakuir: 2, Tomawak: 3, Darkling: 3 }[t.race];
  addBtn(`✨ ${RACES[t.race].ability.split(" (")[0]} (${abilityCost} PA)`, useAbility, t.pa >= abilityCost);
  const onItem = G.items.some(i => i.x === t.x && i.y === t.y);
  addBtn(`🖐️ Ramasser (${COSTS.pickup} PA)`, pickup, onItem && t.pa >= COSTS.pickup);
  const onStairs = G.grid[t.y][t.x] === T_STAIRS;
  addBtn("⬇️ Descendre", descend, onStairs);
  addBtn("⏳ Passer la DLA", passDLA, true);

  $("equipment").innerHTML =
    `<div>Arme : ${t.weapon ? t.weapon.emoji + " " + t.weapon.name + " (+" + t.weapon.bonus + ")" : "—"}</div>` +
    `<div>Armure : ${t.armorItem ? t.armorItem.emoji + " " + t.armorItem.name + " (+" + t.armorItem.bonus + ")" : "—"}</div>`;

  const inv = $("inventory");
  inv.innerHTML = "";
  if (t.bag.length === 0) inv.innerHTML = '<div class="empty">— vide —</div>';
  t.bag.forEach((item, idx) => {
    const b = document.createElement("button");
    const action = item.kind === "potion" ? `boire (${COSTS.potion} PA)` : `équiper (${COSTS.equip} PA)`;
    b.textContent = `${item.emoji} ${item.name} — ${action}`;
    b.disabled = G.over;
    b.onclick = () => useBagItem(idx);
    inv.appendChild(b);
  });
}

function showEnd(victory, killer) {
  const t = G.troll;
  $("screen-game").classList.add("hidden");
  $("screen-end").classList.remove("hidden");
  $("end-title").textContent = victory ? "🏆 GLOIRE AU TRÕLL !" : "☠️ MORT DANS LES PROFONDEURS";
  const score = t.gold + t.totalPI * 10 + t.kills * 25 + (victory ? 1000 : 0);
  $("end-text").innerHTML = victory
    ? `${t.name} le ${t.race} a terrassé le Béhémoth et rapporte le Trésor de MountyHall à la Taverne !<br><br>
       Monstres tués : ${t.kills} · Mountyzédons : ${t.gold} · DLA écoulées : ${t.dla}<br><b>Score : ${score}</b>`
    : `${t.name} le ${t.race} a été terrassé par ${killer ? killer.name : "les profondeurs"} à la profondeur −${G.depth}.<br>
       À MountyHall on ne meurt jamais vraiment : les Dieux Trõlls te ramèneront à la Taverne.<br><br>
       Monstres tués : ${t.kills} · Mountyzédons : ${t.gold} · DLA écoulées : ${t.dla}<br><b>Score : ${score}</b>`;
}

/* ================= Création du personnage ================= */

let selectedRace = "Skrim";

function initCreateScreen() {
  const list = $("race-list");
  list.innerHTML = "";
  for (const [name, r] of Object.entries(RACES)) {
    const card = document.createElement("div");
    card.className = "race-card" + (name === selectedRace ? " selected" : "");
    const s = r.stats;
    card.innerHTML = `<h4>${r.emoji} ${name}</h4>
      <div class="race-desc">${r.desc}<br><b>${r.ability}</b></div>
      <div class="race-stats">ATT ${s.att}D6 · ESQ ${s.esq}D6 · DEG ${s.deg}D6 · REG ${s.reg}D3 · PV ${s.pvMax} · VUE ${s.vue}</div>`;
    card.onclick = () => {
      selectedRace = name;
      initCreateScreen();
    };
    list.appendChild(card);
  }
}

function startGame() {
  const name = $("troll-name").value.trim() || "Trõllinet";
  $("screen-create").classList.add("hidden");
  $("screen-end").classList.add("hidden");
  $("screen-game").classList.remove("hidden");
  $("log").innerHTML = "";
  newGame(name, selectedRace);
  render();
  renderPanels();
}

function bindKeys() {
  document.addEventListener("keydown", e => {
    if (!G || G.over || $("screen-game").classList.contains("hidden")) return;
    const k = e.key.toLowerCase();
    const moves = {
      arrowup: [0, -1], z: [0, -1],
      arrowdown: [0, 1], s: [0, 1],
      arrowleft: [-1, 0], q: [-1, 0],
      arrowright: [1, 0], d: [1, 0],
    };
    if (moves[k]) { e.preventDefault(); tryMove(...moves[k]); }
    else if (k === " ") { e.preventDefault(); passDLA(); }
    else if (k === "e") pickup();
  });
}

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => {
    initCreateScreen();
    bindKeys();
    $("btn-start").onclick = startGame;
    // ?autostart=1&race=Durakuir&name=Grosbill : lance directement une partie
    const params = new URLSearchParams(location.search);
    if (params.get("autostart")) {
      if (RACES[params.get("race")]) selectedRace = params.get("race");
      if (params.get("name")) $("troll-name").value = params.get("name");
      startGame();
    }
    $("btn-restart").onclick = () => {
      $("screen-end").classList.add("hidden");
      $("screen-create").classList.remove("hidden");
      initCreateScreen();
    };
  });
}

/* Export pour les tests node */
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    rollDice, resolveAttack, resolveSpell, improveCost, levelFromTotalPI,
    RACES, MONSTER_TYPES, BOSS, makeMonster, generateCavern, largestRegion,
    MAP_W, MAP_H, T_WALL, T_FLOOR, T_STAIRS,
  };
}
