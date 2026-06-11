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
 * Si l'attaque dépasse l'esquive, dégâts = DEG D3 (+ bonus d'arme) − armure.
 * (Les dégâts sont en D3 comme dans les profils officiels des races.) */
function resolveAttack(attacker, defender, opts = {}) {
  const att = rollDice(attacker.att, 6);
  const esq = rollDice(defender.esq, 6);
  const result = {
    attRoll: att.total, esqRoll: esq.total,
    attDice: attacker.att, esqDice: defender.esq,
    hit: opts.autoHit || att.total > esq.total, damage: 0, rawDamage: 0,
  };
  if (result.hit) {
    const deg = rollDice(attacker.deg, 3);
    result.rawDamage = deg.total + (attacker.degBonus || 0);
    // armure : réduction fixe (équipement) + armure naturelle en D3 (achetée en PI)
    const armor = opts.ignoreArmor ? 0
      : (defender.armor || 0) + (defender.armorDice ? rollDice(defender.armorDice, 3).total : 0);
    result.damage = Math.max(1, result.rawDamage - armor);
  }
  return result;
}

/* Maîtrise d'un talent (compétence ou sortilège) : jet D100 sous le pourcentage.
 * En cas de réussite, la maîtrise progresse comme à MountyHall :
 * +1D6 % jusqu'à 50 %, +1D3 % jusqu'à 75 %, +1 % ensuite.
 * Sous 50 %, un échec fait quand même progresser de 1 % (on apprend de ses ratés).
 * Plafond `cap` : 90 % pour les compétences, 80 % pour les sortilèges. */
function masteryRoll(talent, cap) {
  const roll = 1 + Math.floor(Math.random() * 100);
  const success = roll <= talent.pct;
  let gain = 0;
  if (success) {
    gain = talent.pct < 50 ? rollDice(1, 6).total : talent.pct < 75 ? rollDice(1, 3).total : 1;
  } else if (talent.pct < 50) {
    gain = 1;
  }
  talent.pct = Math.min(cap, talent.pct + gain);
  return { roll, success, gain };
}

/* Sortilège façon MM vs RM : Seuil de Résistance borné à [10, 90] %. */
function resolveSpell(mm, rm) {
  const sr = Math.min(90, Math.max(10, Math.round(50 + (mm - rm) * 5)));
  const roll = 1 + Math.floor(Math.random() * 100);
  return { sr, roll, success: roll <= sr };
}

/* Coûts d'amélioration officiels (MH_Rules/Rules_3.php) : le N-ième achat d'une
 * caractéristique coûte N × coût de base de la race. La caractéristique favorite
 * est à 12 PI (REG du Darkling : 22), le reste à 16, REG à 30, Armure à 30.
 * `bought` = nombre d'améliorations déjà achetées dans cette caractéristique. */
const IMPROVE_BASE = { att: 16, esq: 16, deg: 16, reg: 30, pv: 16, vue: 16, armor: 30 };
const IMPROVE_FAVORED = { att: 12, deg: 12, pv: 12, vue: 12, reg: 22 };

function improveCost(stat, bought, race) {
  const favored = RACES[race].favored === stat;
  const base = favored ? IMPROVE_FAVORED[stat] : IMPROVE_BASE[stat];
  return (bought + 1) * base;
}

/* Niveau d'ancienneté : passer au niveau N coûte 10×N PI gagnés (cumulés). */
function levelFromTotalPI(totalPI) {
  let level = 1, spent = 0;
  while (spent + 10 * (level + 1) <= totalPI) { spent += 10 * (level + 1); level++; }
  return level;
}

/* ================= Les 5 races ================= */

/* Profils de base officiels (mountyhall.com/MH_Rules/Races_*.php) :
 * chaque race a sa compétence et son sortilège réservés, démarrés à 15 % de maîtrise. */
const RACES = {
  Skrim: {
    emoji: "🟢", favored: "att",
    desc: "Simplicité et vitesse : ils frappent plus souvent que leur ombre.",
    stats: { att: 4, esq: 3, deg: 3, reg: 1, pvMax: 30, vue: 3 },
    comp: { name: "Botte Secrète", cost: 2, desc: "Une attaque supplémentaire (1/DLA) : 2D6 par tranche de 3 dés d'ATT, dégâts 1D3 par tranche de 2 dés d'ATT." },
    sort: { name: "Hypnotisme", cost: 4, desc: "Cible adjacente : esquive divisée par 2 et perd son prochain tour (résistance : effets réduits)." },
  },
  Durakuir: {
    emoji: "🟤", favored: "pv",
    desc: "Les tanks du Hall, durs au mal et infatigables.",
    stats: { att: 3, esq: 3, deg: 3, reg: 1, pvMax: 40, vue: 3 },
    comp: { name: "Régénération Accrue", cost: 2, desc: "Soigne immédiatement 1D3 par tranche de 15 PV max." },
    sort: { name: "Rafale Psychique", cost: 4, desc: "Touche automatiquement (imparable) : 1D3 par dé de DEG, ignore l'armure (résistance : moitié)." },
  },
  Kastar: {
    emoji: "🔴", favored: "deg",
    desc: "Les vampires du Hall : leurs coups les nourrissent.",
    stats: { att: 3, esq: 3, deg: 4, reg: 1, pvMax: 30, vue: 3 },
    comp: { name: "Accélération du Métabolisme", cost: 2, desc: "Sacrifie des PV (1D3 + fatigue) pour regagner 4 PA. La fatigue monte à chaque usage." },
    sort: { name: "Vampirisme", cost: 4, desc: "Cible adjacente : 2D6 par tranche de 3 dés de DEG vs ESQ, dégâts 1D3 par dé de DEG, ignore l'armure, soigne 50 % (résistance : moitié)." },
  },
  Tomawak: {
    emoji: "🟡", favored: "vue",
    desc: "Trõlls furtifs, chasseurs embusqués aux yeux perçants.",
    stats: { att: 3, esq: 3, deg: 3, reg: 1, pvMax: 30, vue: 4 },
    comp: { name: "Camouflage", cost: 2, desc: "Invisible aux monstres tant que tu n'attaques pas ; à chaque pas, jet sous 75 % de la maîtrise pour rester caché." },
    sort: { name: "Projectile Magique", cost: 4, desc: "À distance (portée = Vue) : 1D6 par case de Vue + bonus de proximité, dégâts 1D3 par tranche de 2 cases de Vue, ignore l'armure (résistance : moitié)." },
  },
  Darkling: {
    emoji: "🟣", favored: "reg",
    desc: "Mystiques des profondeurs, ils siphonnent l'âme de leurs proies.",
    stats: { att: 3, esq: 3, deg: 3, reg: 2, pvMax: 30, vue: 3 },
    comp: { name: "Balayage", cost: 2, desc: "Déstabilise (1/DLA) : 1D6 par dé d'ATT vs 2D6 par tranche de 3 dés d'ESQ de la cible ; à terre, elle perd son prochain tour." },
    sort: { name: "Siphon des Âmes", cost: 4, desc: "1D6 par dé d'ATT vs ESQ, dégâts 1D3 par dé de REG, ignore toute armure, nécrose : la cible perd des dés d'ATT pendant 2 tours (résistance : moitié)." },
  },
};

/* ================= Bestiaire ================= */

/* Dégâts des monstres en D3, comme ceux des trolls. */
const MONSTER_TYPES = [
  { name: "Gobelin",           emoji: "👺", level: 1, att: 2, esq: 2, deg: 2, pv: 12, armor: 0, vue: 4 },
  { name: "Champignon Vénéneux", emoji: "🍄", level: 1, att: 3, esq: 1, deg: 3, pv: 10, armor: 0, vue: 1, static: true },
  { name: "Araignée Géante",   emoji: "🕷️", level: 2, att: 3, esq: 3, deg: 3, pv: 16, armor: 0, vue: 5 },
  { name: "Gargouille",        emoji: "🦇", level: 3, att: 3, esq: 3, deg: 3, pv: 22, armor: 2, vue: 4 },
  { name: "Momie",             emoji: "🧟", level: 3, att: 4, esq: 2, deg: 4, pv: 26, armor: 1, vue: 3 },
  { name: "Sorcière",          emoji: "🧙", level: 4, att: 4, esq: 3, deg: 5, pv: 24, armor: 0, vue: 6 },
  { name: "Golem de Pierre",   emoji: "🗿", level: 5, att: 4, esq: 1, deg: 6, pv: 40, armor: 4, vue: 3 },
];

const BOSS = { name: "Béhémoth", emoji: "👹", level: 9, att: 6, esq: 4, deg: 8, pv: 90, armor: 3, vue: 8, boss: true };

/* Gabarits d'âge façon MountyHall : plus on descend, plus les bêtes sont vieilles. */
const TEMPLATES = [
  { prefix: "Jeune ",   mult: 0.7 },
  { prefix: "",         mult: 1.0 },
  { prefix: "Vieux ",   mult: 1.3 },
  { prefix: "Ancien ",  mult: 1.6 },
  { prefix: "Mythique ", mult: 2.0 },
];

function applyTemplate(type, tpl, x, y) {
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

function makeMonster(depth, x, y) {
  const pool = MONSTER_TYPES.filter(m => m.level <= depth + 1 && m.level >= Math.max(1, depth - 2));
  const type = pool[Math.floor(Math.random() * pool.length)];
  const tplMax = Math.min(TEMPLATES.length - 1, depth - 1);
  const tpl = TEMPLATES[Math.floor(Math.random() * (tplMax + 1))];
  return applyTemplate(type, tpl, x, y);
}

/* Instancie un monstre depuis une spec d'éditeur : {x, y, type, tpl} ou {x, y, boss: true} */
function monsterFromSpec(spec) {
  if (spec.boss) return { ...BOSS, pvMax: BOSS.pv, x: spec.x, y: spec.y, boss: true, static: false };
  const type = MONSTER_TYPES[spec.type % MONSTER_TYPES.length];
  const tpl = TEMPLATES[spec.tpl % TEMPLATES.length];
  return applyTemplate(type, tpl, spec.x, spec.y);
}

/* Instancie un objet depuis une spec d'éditeur : {x, y, kind, idx?, gold?} */
function itemFromSpec(spec) {
  const base = { x: spec.x, y: spec.y };
  if (spec.kind === "potion") return { ...base, kind: "potion", name: "Potion de Vie", emoji: "🧪" };
  if (spec.kind === "gold") {
    const gold = spec.gold || 60;
    return { ...base, kind: "gold", name: `${gold} Mountyzédons`, emoji: "💰", gold };
  }
  const list = spec.kind === "weapon" ? WEAPONS : ARMORS;
  return { ...base, kind: "gear", ...list[(spec.idx || 0) % list.length] };
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

function newGame(name, race, customLevel = null) {
  const s = RACES[race].stats;
  G = {
    custom: customLevel,
    troll: {
      name, race,
      att: s.att, esq: s.esq, deg: s.deg, reg: s.reg,
      pv: s.pvMax, pvMax: s.pvMax, vue: s.vue,
      degBonus: 0, armor: 0, armorDice: 0,
      bought: { att: 0, esq: 0, deg: 0, reg: 0, pv: 0, vue: 0, armor: 0 },
      comp: { pct: 15 }, sort: { pct: 15 }, fatigue: 0, compUsed: false,
      weapon: null, armorItem: null,
      pa: PA_PER_TURN, pi: 0, totalPI: 0, gold: 0,
      bag: [], camo: false, kills: 0, dla: 1,
    },
    depth: 1, grid: null, monsters: [], items: [], doors: [], stairs: null,
    seen: new Set(), over: false,
  };
  if (customLevel) buildCustomLevel(customLevel);
  else buildLevel();
  if (customLevel) {
    log(`${name} le ${race} entre dans « ${customLevel.name} », un niveau de ${customLevel.author}.`, "good");
    const hasExitTile = G.grid.some(row => row.includes(T_STAIRS));
    const hasDoors = G.doors.length > 0;
    if (hasExitTile) log("Objectif : atteindre la sortie ▼.", "info");
    else if (hasDoors) log("Objectif : des portes 🚪 mènent vers d'autres niveaux — explore !", "info");
    else log("Objectif : terrasser tous les monstres.", "info");
  } else {
    log(`${name} le ${race} pénètre dans le Monde Souterrain. Que les Dieux Trõlls te gardent !`, "good");
  }
}

/* Construit un niveau venu de l'éditeur : grid = tableau de chaînes '#' mur, '.' sol, '>' sortie. */
function buildCustomLevel(level) {
  const grid = [];
  for (let y = 0; y < MAP_H; y++) {
    grid.push([]);
    for (let x = 0; x < MAP_W; x++) {
      const c = level.grid[y][x];
      grid[y].push(c === "#" ? T_WALL : c === ">" ? T_STAIRS : T_FLOOR);
    }
  }
  G.grid = grid;
  G.troll.x = level.start.x; G.troll.y = level.start.y;
  G.seen = new Set();
  G.monsters = level.monsters.map(monsterFromSpec);
  G.items = level.items.map(itemFromSpec);
  G.doors = (level.doors || []).map(d => ({ ...d }));
  G.stairs = null;
  updateFov();
}

function doorAt(x, y) {
  return (G.doors || []).find(d => d.x === x && d.y === y);
}

/* Le niveau custom courant a-t-il encore un objectif au-delà du nettoyage ? */
function customHasExit() {
  return G.grid.some(row => row.includes(T_STAIRS)) || (G.doors || []).length > 0;
}

/* Franchir une porte : charge le niveau cible en conservant le troll (PV, PI, sac…). */
async function enterDoor() {
  const door = doorAt(G.troll.x, G.troll.y);
  if (!door || G.over) return;
  log("🚪 Tu pousses la lourde porte…", "info");
  try {
    const res = await fetch("api/levels/" + door.target);
    if (!res.ok) throw new Error();
    const level = await res.json();
    G.custom = level;
    buildCustomLevel(level);
    log(`Tu débouches dans « ${level.name} », un niveau de ${level.author}.`, "good");
    afterAction();
  } catch {
    log("La porte est condamnée : le niveau cible n'existe plus.", "bad");
  }
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

  // camouflé, chaque pas exige un jet sous 75 % de la maîtrise
  if (t.camo) {
    const threshold = Math.floor(t.comp.pct * 0.75);
    if (1 + Math.floor(Math.random() * 100) > threshold) {
      t.camo = false;
      log("Un caillou roule sous ton pied : te voilà repéré !", "bad");
    }
  }

  if (G.grid[ny][nx] === T_STAIRS) {
    if (G.custom) log("La sortie ! (bouton « Sortir »)", "info");
    else log("Un passage s'enfonce vers les profondeurs… (bouton « Descendre »)", "info");
  }
  if (doorAt(nx, ny)) log("Une porte massive se dresse là. (bouton « Franchir la porte »)", "info");
  const item = G.items.find(i => i.x === nx && i.y === ny);
  if (item) log(`Tu vois : ${item.emoji} ${item.name}. Ramasse-le pour ${COSTS.pickup} PA.`, "info");
  afterAction();
}

function attackMonster(m, opts = {}) {
  const cost = opts.cost ?? COSTS.attack;
  if (!spendPA(cost)) return false;
  const r = resolveAttack(G.troll, effMonster(m));
  if (r.hit) {
    m.pv -= r.damage;
    G.troll.pi += 1; G.troll.totalPI += 1; // +1 PX par attaque réussie (converti en PI)
    log(`Tu attaques ${m.name} : ATT ${r.attDice}D6=${r.attRoll} vs ESQ ${r.esqDice}D6=${r.esqRoll} → touché ! ${r.rawDamage} dégâts (−${m.armor} armure) = ${r.damage} PV.`, "combat");
    if (m.pv <= 0) killMonster(m);
  } else {
    log(`Tu attaques ${m.name} : ATT ${r.attDice}D6=${r.attRoll} vs ESQ ${r.esqDice}D6=${r.esqRoll} → esquivé !`, "combat");
  }
  if (G.troll.camo) {
    G.troll.camo = false;
    log("Ton attaque brise le camouflage.", "info");
  }
  afterAction();
  return true;
}

function killMonster(m) {
  const px = m.level * 2;
  G.troll.pi += px; G.troll.totalPI += px;
  G.troll.kills++;
  log(`💀 ${m.name} est terrassé ! +${px} PX (convertis en PI à l'entraînement).`, "good");
  G.monsters = G.monsters.filter(x => x !== m);
  if (G.custom) {
    if (G.monsters.length === 0) {
      if (customHasExit()) log("Le niveau est nettoyé… mais l'aventure continue derrière une porte ou une sortie.", "info");
      else win();
    }
  } else if (m.boss) {
    win();
  }
}

/* ----- Compétences et sortilèges réservés (effets d'après la Mountypedia) ----- */

const trollMM = () => levelFromTotalPI(G.troll.totalPI) + 1;
const monsterRM = m => Math.ceil(m.level / 2);

/* Jet de résistance magique du monstre : s'il résiste, l'effet est de moitié. */
function resisted(m) {
  return !resolveSpell(trollMM(), monsterRM(m)).success;
}

/* Tente le talent : dépense les PA (moitié remboursée en cas d'échec, comme à MH),
 * jette la maîtrise et journalise. Retourne true si l'effet s'applique. */
function tryTalent(talent, cap, cost, label) {
  if (!spendPA(cost)) return false;
  const r = masteryRoll(talent, cap);
  if (!r.success) {
    G.troll.pa += Math.floor(cost / 2);
    const learn = r.gain ? ` Tu apprends de ton raté : maîtrise +1 % → ${talent.pct} %.` : "";
    log(`${label} : échec (jet ${r.roll}). La moitié des PA est remboursée.${learn}`, "combat");
    return false;
  }
  G.troll.pi += 1; G.troll.totalPI += 1;
  if (talent.pct < cap && r.gain) log(`${label} : réussite (jet ${r.roll}) — maîtrise +${r.gain} % → ${talent.pct} %.`, "good");
  return true;
}

function useComp() {
  if (G.over) return;
  const t = G.troll;
  const comp = RACES[t.race].comp;

  if (t.race === "Skrim") { // Botte Secrète : attaque bonus, 1 fois par DLA
    if (t.compUsed) { log("Botte Secrète déjà utilisée cette DLA.", "info"); return; }
    const m = adjacentMonster();
    if (!m) { log("Aucun monstre adjacent.", "info"); return; }
    if (!tryTalent(t.comp, 90, comp.cost, "🥋 Botte Secrète")) { afterAction(); return; }
    t.compUsed = true;
    const pseudo = { att: Math.max(1, Math.floor(t.att * 2 / 3)), deg: Math.max(1, Math.floor(t.att / 2)), degBonus: 0 };
    const r = resolveAttack(pseudo, effMonster(m));
    if (r.hit) {
      m.pv -= r.damage;
      log(`Botte Secrète : ${r.attDice}D6=${r.attRoll} vs ${r.esqDice}D6=${r.esqRoll} → ${r.damage} dégâts !`, "combat");
      if (m.pv <= 0) killMonster(m);
    } else {
      log(`Botte Secrète esquivée (${r.attRoll} vs ${r.esqRoll}).`, "combat");
    }
  } else if (t.race === "Durakuir") { // Régénération Accrue : 1D3 par tranche de 15 PV max
    if (!tryTalent(t.comp, 90, comp.cost, "🥋 Régénération Accrue")) { afterAction(); return; }
    const dice = Math.max(1, Math.floor(t.pvMax / 15));
    const heal = rollDice(dice, 3).total;
    t.pv = Math.min(t.pvMax, t.pv + heal);
    log(`Régénération Accrue : ${dice}D3 → +${heal} PV.`, "good");
  } else if (t.race === "Kastar") { // Accélération du Métabolisme : PV → PA, fatigue croissante
    if (!tryTalent(t.comp, 90, comp.cost, "🥋 Accélération du Métabolisme")) { afterAction(); return; }
    const cost = rollDice(1, 3).total + t.fatigue;
    t.fatigue += 1;
    t.pv -= cost;
    t.pa = Math.min(PA_PER_TURN, t.pa + 4);
    log(`Accélération du Métabolisme : −${cost} PV, +4 PA (fatigue ${t.fatigue}).`, "good");
    if (t.pv <= 0) { die({ name: "son propre métabolisme" }); return; }
  } else if (t.race === "Tomawak") { // Camouflage : invisible tant qu'on n'attaque pas
    if (t.camo) { log("Tu es déjà camouflé.", "info"); return; }
    if (!tryTalent(t.comp, 90, comp.cost, "🥋 Camouflage")) { afterAction(); return; }
    t.camo = true;
    log("🌫️ Camouflage : les monstres ne te voient plus. Chaque pas risque de te dévoiler (75 % de la maîtrise).", "good");
  } else if (t.race === "Darkling") { // Balayage : déstabilise, la cible perd son tour
    if (t.compUsed) { log("Balayage déjà utilisé cette DLA.", "info"); return; }
    const m = adjacentMonster();
    if (!m) { log("Aucun monstre adjacent.", "info"); return; }
    if (!tryTalent(t.comp, 90, comp.cost, "🥋 Balayage")) { afterAction(); return; }
    t.compUsed = true;
    const destab = rollDice(t.att, 6).total;
    const stab = rollDice(Math.max(1, Math.floor(m.esq * 2 / 3)), 6).total;
    if (destab > stab) {
      m.skip = (m.skip || 0) + 1;
      log(`Balayage : ${destab} vs ${stab} → ${m.name} est à terre et perdra son prochain tour !`, "good");
    } else {
      log(`Balayage : ${destab} vs ${stab} → ${m.name} reste stable.`, "combat");
    }
  }
  afterAction();
}

function useSort() {
  if (G.over) return;
  const t = G.troll;
  const sort = RACES[t.race].sort;

  if (t.race === "Skrim") { // Hypnotisme : esquive /2 + perd son tour
    const m = adjacentMonster();
    if (!m) { log("Aucun monstre adjacent.", "info"); return; }
    if (!tryTalent(t.sort, 80, sort.cost, "🔮 Hypnotisme")) { afterAction(); return; }
    const res = resisted(m);
    m.esqHalfTurns = (m.esqHalfTurns || 0) + (res ? 1 : 2);
    if (!res) m.skip = (m.skip || 0) + 1;
    log(res
      ? `Hypnotisme : ${m.name} résiste — esquive réduite 1 tour seulement.`
      : `Hypnotisme : ${m.name} est hébété ! Esquive divisée par 2 et tour perdu.`, "good");
  } else if (t.race === "Durakuir") { // Rafale Psychique : imparable, ignore l'armure
    const m = adjacentMonster();
    if (!m) { log("Aucun monstre adjacent.", "info"); return; }
    if (!tryTalent(t.sort, 80, sort.cost, "🔮 Rafale Psychique")) { afterAction(); return; }
    let dmg = rollDice(t.deg, 3).total;
    const res = resisted(m);
    if (res) dmg = Math.max(1, Math.ceil(dmg / 2));
    m.pv -= dmg;
    log(`Rafale Psychique : touche automatique, ${dmg} dégâts${res ? " (résisté : moitié)" : ""}, armure ignorée.`, "combat");
    if (m.pv <= 0) killMonster(m);
  } else if (t.race === "Kastar") { // Vampirisme : dégâts + vol de vie
    const m = adjacentMonster();
    if (!m) { log("Aucun monstre adjacent.", "info"); return; }
    if (!tryTalent(t.sort, 80, sort.cost, "🔮 Vampirisme")) { afterAction(); return; }
    const pseudo = { att: Math.max(1, Math.floor(t.deg * 2 / 3)), deg: t.deg, degBonus: 0 };
    const r = resolveAttack(pseudo, effMonster(m), { ignoreArmor: true });
    if (r.hit) {
      let dmg = r.damage;
      const res = resisted(m);
      if (res) dmg = Math.max(1, Math.ceil(dmg / 2));
      m.pv -= dmg;
      const heal = Math.ceil(dmg / 2);
      t.pv = Math.min(t.pvMax, t.pv + heal);
      log(`Vampirisme : ${dmg} dégâts${res ? " (résisté)" : ""}, tu draines ${heal} PV.`, "good");
      if (m.pv <= 0) killMonster(m);
    } else {
      log(`Vampirisme esquivé (${r.attRoll} vs ${r.esqRoll}).`, "combat");
    }
  } else if (t.race === "Tomawak") { // Projectile Magique : à distance, portée = Vue
    const m = nearestVisibleMonster();
    if (!m) { log("Aucun monstre en vue.", "info"); return; }
    if (!tryTalent(t.sort, 80, sort.cost, "🔮 Projectile Magique")) { afterAction(); return; }
    const dist = Math.max(Math.abs(m.x - t.x), Math.abs(m.y - t.y));
    const proxBonus = Math.max(0, t.vue - dist);
    const pseudo = { att: t.vue + proxBonus, deg: Math.max(1, Math.floor(t.vue / 2)), degBonus: 0 };
    const r = resolveAttack(pseudo, effMonster(m), { ignoreArmor: true });
    if (r.hit) {
      let dmg = r.damage;
      const res = resisted(m);
      if (res) dmg = Math.max(1, Math.ceil(dmg / 2));
      m.pv -= dmg;
      log(`Projectile Magique sur ${m.name} (distance ${dist}) : ${dmg} dégâts${res ? " (résisté)" : ""}.`, "combat");
      if (m.pv <= 0) killMonster(m);
    } else {
      log(`Projectile Magique esquivé (${r.attRoll} vs ${r.esqRoll}).`, "combat");
    }
    // 25 % de la maîtrise pour conserver le camouflage
    if (t.camo && 1 + Math.floor(Math.random() * 100) > Math.floor(t.comp.pct * 0.25)) {
      t.camo = false;
      log("Ton camouflage se dissipe dans l'éclat du projectile.", "info");
    }
  } else if (t.race === "Darkling") { // Siphon des Âmes : dégâts + nécrose (−ATT)
    const m = adjacentMonster();
    if (!m) { log("Aucun monstre adjacent.", "info"); return; }
    if (!tryTalent(t.sort, 80, sort.cost, "🔮 Siphon des Âmes")) { afterAction(); return; }
    const pseudo = { att: t.att, deg: t.reg, degBonus: 0 };
    const r = resolveAttack(pseudo, effMonster(m), { ignoreArmor: true });
    if (r.hit) {
      let dmg = r.damage;
      const res = resisted(m);
      if (res) dmg = Math.max(1, Math.ceil(dmg / 2));
      m.pv -= dmg;
      const necrose = res ? Math.max(1, Math.floor(t.reg / 2)) : t.reg;
      m.attDownDice = (m.attDownDice || 0) + necrose;
      m.attDownTurns = 2;
      log(`Siphon des Âmes : ${dmg} dégâts${res ? " (résisté)" : ""}, nécrose −${necrose} dé(s) d'ATT pendant 2 tours.`, "combat");
      if (m.pv <= 0) killMonster(m);
    } else {
      log(`Siphon des Âmes esquivé (${r.attRoll} vs ${r.esqRoll}).`, "combat");
    }
  }
  if (!G.over) afterAction();
}

/* Caractéristiques effectives d'un monstre, statuts compris. */
function effMonster(m) {
  return {
    ...m,
    att: Math.max(1, m.att - (m.attDownTurns > 0 ? m.attDownDice || 0 : 0)),
    esq: m.esqHalfTurns > 0 ? Math.max(1, Math.floor(m.esq / 2)) : m.esq,
  };
}

function nearestVisibleMonster() {
  let best = null, bestDist = Infinity;
  for (const m of G.monsters) {
    if (!inSight(m)) continue;
    const d = Math.max(Math.abs(m.x - G.troll.x), Math.abs(m.y - G.troll.y));
    if (d < bestDist) { best = m; bestDist = d; }
  }
  return best;
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
  if (G.custom) {
    G.over = true;
    log("🚪 Tu atteins la sortie, sain et sauf !", "good");
    showEnd(true);
    return;
  }
  G.depth++;
  log(`⬇️ Tu descends. Profondeur −${G.depth}. L'air devient lourd…`, "info");
  if (G.depth === MAX_DEPTH) log("👹 Le sol tremble. Le Béhémoth est proche.", "bad");
  buildLevel();
  afterAction();
}

function improveStat(stat) {
  const t = G.troll;
  const cost = improveCost(stat, t.bought[stat], t.race);
  if (t.pi < cost) return;
  t.pi -= cost;
  t.bought[stat] += 1;
  if (stat === "pv") { t.pvMax += 10; t.pv += 10; }
  else if (stat === "armor") t.armorDice += 1;
  else t[stat] += 1;
  const label = { att: "Attaque", esq: "Esquive", deg: "Dégâts", reg: "Régénération", pv: "PV max", vue: "Vue", armor: "Armure naturelle" }[stat];
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
    if (m.skip > 0) {
      m.skip--;
      log(`${m.emoji} ${m.name} est au sol et perd son tour.`, "good");
      continue;
    }
    const dist = Math.max(Math.abs(m.x - t.x), Math.abs(m.y - t.y));
    const seesTroll = !t.camo && dist <= m.vue;
    if (dist <= 1 && !t.camo) {
      const eff = effMonster(m);
      const r = resolveAttack(eff, t);
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
    // les statuts s'estompent à la fin de l'activation du monstre
    if (m.esqHalfTurns > 0) m.esqHalfTurns--;
    if (m.attDownTurns > 0 && --m.attDownTurns === 0) m.attDownDice = 0;
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
  t.compUsed = false;
  t.fatigue = Math.floor(t.fatigue / 1.25); // la fatigue du Kastar retombe à chaque DLA
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
  if (G.custom) log("🏆 Tous les monstres sont terrassés ! Niveau vaincu !", "good");
  else log("🏆 Le Béhémoth s'effondre ! Le Trésor de MountyHall est à toi !", "good");
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

  // pastille de couleur sous chaque entité : lisible même sans police emoji
  const disc = (x, y, color) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x * TILE + TILE / 2, y * TILE + TILE / 2, TILE / 2 - 3, 0, Math.PI * 2);
    ctx.fill();
  };
  for (const i of G.items) {
    if (!G.seen.has(i.y * MAP_W + i.x)) continue;
    disc(i.x, i.y, i.kind === "gold" ? "#caa53d" : i.kind === "potion" ? "#5d8535" : "#7a8db0");
    ctx.fillStyle = "#1a140e";
    ctx.fillText(i.emoji, i.x * TILE + TILE / 2, i.y * TILE + TILE / 2 + 1);
  }
  for (const d of G.doors || []) {
    if (!G.seen.has(d.y * MAP_W + d.x)) continue;
    disc(d.x, d.y, "#a06a28");
    ctx.fillStyle = "#1a140e";
    ctx.fillText("🚪", d.x * TILE + TILE / 2, d.y * TILE + TILE / 2 + 1);
  }
  for (const m of G.monsters) {
    if (!inSight(m)) continue;
    disc(m.x, m.y, m.boss ? "#7a2070" : "#8a3030");
    ctx.fillStyle = "#1a140e";
    ctx.fillText(m.emoji, m.x * TILE + TILE / 2, m.y * TILE + TILE / 2 + 1);
    // barre de vie du monstre
    const w = Math.max(2, Math.round((TILE - 6) * m.pv / m.pvMax));
    ctx.fillStyle = "#b03030";
    ctx.fillRect(m.x * TILE + 3, m.y * TILE + 1, w, 3);
  }
  disc(G.troll.x, G.troll.y, "#8fbf5a");
  ctx.fillStyle = "#1a140e";
  ctx.fillText("🧌", G.troll.x * TILE + TILE / 2, G.troll.y * TILE + TILE / 2 + 1);
  if (G.troll.camo) {
    ctx.strokeStyle = "#8fbf5a";
    ctx.strokeRect(G.troll.x * TILE + 1, G.troll.y * TILE + 1, TILE - 2, TILE - 2);
  }
}

function renderPanels() {
  const t = G.troll;
  $("depth-label").textContent = G.custom
    ? `« ${G.custom.name} » par ${G.custom.author} · DLA n°${t.dla} · ${G.monsters.length} monstre(s) restant(s)`
    : `Profondeur −${G.depth} · DLA n°${t.dla}`;
  $("troll-title").textContent = `${RACES[t.race].emoji} ${t.name}, ${t.race} niv. ${levelFromTotalPI(t.totalPI)}`;

  const pct = Math.max(0, t.pv / t.pvMax);
  const hpClass = pct > 0.6 ? "high" : pct > 0.3 ? "mid" : "";
  $("stats").innerHTML = `
    <div><span>PV</span><span class="stat-val">${t.pv} / ${t.pvMax}</span></div>
    <div class="hp-bar-wrap"><div class="hp-bar ${hpClass}" style="width:${pct * 100}%"></div></div>
    <div><span>Attaque</span><span class="stat-val">${t.att}D6</span></div>
    <div><span>Esquive</span><span class="stat-val">${t.esq}D6</span></div>
    <div><span>Dégâts</span><span class="stat-val">${t.deg}D3${t.degBonus ? "+" + t.degBonus : ""}</span></div>
    <div><span>Régénération</span><span class="stat-val">${t.reg}D3</span></div>
    <div><span>Armure</span><span class="stat-val">${t.armor}${t.armorDice ? "+" + t.armorDice + "D3" : ""}</span></div>
    <div><span>Vue</span><span class="stat-val">${t.vue}</span></div>
    <div><span>${RACES[t.race].comp.name}</span><span class="stat-val">${t.comp.pct} %</span></div>
    <div><span>${RACES[t.race].sort.name}</span><span class="stat-val">${t.sort.pct} %</span></div>
    ${t.race === "Kastar" ? `<div><span>Fatigue</span><span class="stat-val">${t.fatigue}</span></div>` : ""}
    ${t.camo ? '<div><span>🌫️ Camouflé</span><span class="stat-val">oui</span></div>' : ""}
    <div><span>PI</span><span class="stat-val">${t.pi}</span></div>
    <div><span>Mountyzédons</span><span class="stat-val">${t.gold}</span></div>
    <div><span>Monstres tués</span><span class="stat-val">${t.kills}</span></div>`;

  const improve = $("improve");
  improve.innerHTML = "";
  const labels = { att: "Attaque +1D6", esq: "Esquive +1D6", deg: "Dégâts +1D3", reg: "Régén. +1D3", pv: "PV max +10", vue: "Vue +1", armor: "Armure +1D3" };
  for (const stat of Object.keys(labels)) {
    const cost = improveCost(stat, t.bought[stat], t.race);
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
  const comp = RACES[t.race].comp, sort = RACES[t.race].sort;
  addBtn(`🥋 ${comp.name} (${comp.cost} PA · ${t.comp.pct} %)`, useComp, t.pa >= comp.cost);
  addBtn(`🔮 ${sort.name} (${sort.cost} PA · ${t.sort.pct} %)`, useSort, t.pa >= sort.cost);
  const onItem = G.items.some(i => i.x === t.x && i.y === t.y);
  addBtn(`🖐️ Ramasser (${COSTS.pickup} PA)`, pickup, onItem && t.pa >= COSTS.pickup);
  const onStairs = G.grid[t.y][t.x] === T_STAIRS;
  addBtn(G.custom ? "🏁 Sortir" : "⬇️ Descendre", descend, onStairs);
  if (doorAt(t.x, t.y)) addBtn("🚪 Franchir la porte", enterDoor, true);
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

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function showEnd(victory, killer) {
  const t = G.troll;
  $("screen-game").classList.add("hidden");
  $("screen-end").classList.remove("hidden");
  $("end-title").textContent = victory ? "🏆 GLOIRE AU TRÕLL !" : "☠️ MORT DANS LES PROFONDEURS";
  const score = t.gold + t.totalPI * 10 + t.kills * 25 + (victory ? 1000 : 0);
  const stats = `Monstres tués : ${t.kills} · Mountyzédons : ${t.gold} · DLA écoulées : ${t.dla}<br><b>Score : ${score}</b>`;
  let text;
  if (G.custom) {
    text = victory
      ? `${esc(t.name)} le ${t.race} a vaincu « ${esc(G.custom.name)} », le niveau de ${esc(G.custom.author)} !`
      : `${esc(t.name)} le ${t.race} a été terrassé par ${esc(killer ? killer.name : "les profondeurs")} dans « ${esc(G.custom.name)} » (niveau de ${esc(G.custom.author)}).`;
  } else {
    text = victory
      ? `${esc(t.name)} le ${t.race} a terrassé le Béhémoth et rapporte le Trésor de MountyHall à la Taverne !`
      : `${esc(t.name)} le ${t.race} a été terrassé par ${esc(killer ? killer.name : "les profondeurs")} à la profondeur −${G.depth}.<br>
         À MountyHall on ne meurt jamais vraiment : les Dieux Trõlls te ramèneront à la Taverne.`;
  }
  $("end-text").innerHTML = text + "<br><br>" + stats;
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
      <div class="race-desc">${r.desc}<br>
        <b>🥋 ${r.comp.name}</b> (${r.comp.cost} PA) : ${r.comp.desc}<br>
        <b>🔮 ${r.sort.name}</b> (${r.sort.cost} PA) : ${r.sort.desc}</div>
      <div class="race-stats">ATT ${s.att}D6 · ESQ ${s.esq}D6 · DEG ${s.deg}D3 · REG ${s.reg}D3 · PV ${s.pvMax} · VUE ${s.vue}</div>`;
    card.onclick = () => {
      selectedRace = name;
      initCreateScreen();
    };
    list.appendChild(card);
  }
}

function startGame(customLevel = null) {
  const name = $("troll-name").value.trim() || "Trõllinet";
  $("screen-create").classList.add("hidden");
  $("screen-end").classList.add("hidden");
  $("screen-game").classList.remove("hidden");
  $("log").innerHTML = "";
  newGame(name, selectedRace, customLevel);
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
    $("btn-start").onclick = () => startGame();
    // ?autostart=1&race=Durakuir&name=Grosbill : lance directement une partie
    const params = new URLSearchParams(location.search);
    if (params.get("autostart")) {
      if (RACES[params.get("race")]) selectedRace = params.get("race");
      if (params.get("name")) $("troll-name").value = params.get("name");
      startGame();
    }
    $("btn-restart").onclick = () => {
      $("screen-end").classList.add("hidden");
      if (window.MC_afterEnd === "editor") {
        window.MC_afterEnd = null;
        $("screen-editor").classList.remove("hidden");
      } else {
        $("screen-create").classList.remove("hidden");
        initCreateScreen();
      }
    };
  });
}

/* Export pour les tests node */
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    rollDice, resolveAttack, resolveSpell, masteryRoll, improveCost, levelFromTotalPI,
    RACES, MONSTER_TYPES, BOSS, TEMPLATES, makeMonster, monsterFromSpec, itemFromSpec,
    generateCavern, largestRegion,
    MAP_W, MAP_H, T_WALL, T_FLOOR, T_STAIRS,
  };
}
