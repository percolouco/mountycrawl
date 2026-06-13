/* MountyCrawl — roguelike hommage à MountyHall (https://www.mountyhall.com)
 * Vanilla JS, aucune dépendance. Le cœur des règles (dés, combat, progression)
 * est exporté pour les tests node (voir test/smoke.js). */

"use strict";

const APP_VERSION = "2.6.3";

/* Alpha : maîtrise initiale haute pour les tests. Remettre 15 % / 15 % à la v1.0 officielle. */
const START_COMP_PCT = 90;
const START_SORT_PCT = 80;

/* potions.js et scrolls.js sont chargés avant ce fichier dans le navigateur ; en node, require explicite. */
if (typeof module !== "undefined" && module.exports && typeof makeRandomPotion === "undefined") {
  Object.assign(globalThis, require("./potions.js"));
}
if (typeof module !== "undefined" && module.exports && typeof makeRandomScroll === "undefined") {
  Object.assign(globalThis, require("./scrolls.js"));
}
if (typeof module !== "undefined" && module.exports && typeof makeRandomGear === "undefined") {
  Object.assign(globalThis, require("./gear.js"));
}

/* ================= Dés & règles de base ================= */

function rollDice(n, faces) {
  const rolls = [];
  for (let i = 0; i < n; i++) rolls.push(1 + Math.floor(Math.random() * faces));
  return { total: rolls.reduce((a, b) => a + b, 0), rolls };
}

/* Jet d'attaque MountyHall : somme de ATT D6 contre somme de ESQ D6.
 * Si l'attaque dépasse l'esquive, dégâts = DEG D3 (+ bonus d'arme) − armure.
 * (Les dégâts sont en D3 comme dans les profils officiels des races.)
 * Armure façon MH : les dégâts PHYSIQUES sont réduits par l'armure totale
 * (physique + magique) ; les dégâts MAGIQUES (opts.magic) par la seule armure
 * magique ; opts.ignoreArmor ignore tout (Siphon des Âmes).
 * Bonus fixes : on lance les dés, puis on ajoute TOUJOURS les deux saveurs —
 * le bonus physique ET le bonus magique se cumulent (xxxFlat = phys + mag,
 * cf. effTroll). opts.magic ne sert plus qu'à choisir l'armure qui réduit les
 * dégâts (magique seule pour une attaque magique). Les monstres n'ont pas de
 * flats (que des dés) → xxxFlat absent → 0. */
function resolveAttack(attacker, defender, opts = {}) {
  const att = rollDice(attacker.att, 6);
  const esq = rollDice(defender.esq, 6);
  const attFlat = attacker.attFlat || 0;
  const esqFlat = defender.esqFlat || 0;
  const attTotal = att.total + attFlat;
  const esqTotal = esq.total + esqFlat;
  const result = {
    attRoll: attTotal, esqRoll: esqTotal,
    attDice: attacker.att, esqDice: defender.esq,
    attFlat, esqFlat,
    hit: opts.autoHit || attTotal > esqTotal, damage: 0, rawDamage: 0,
    critical: !opts.autoHit && attTotal >= esqTotal * 2, // coup critique MH : dégâts doublés
  };
  if (result.hit) {
    const deg = rollDice(attacker.deg, 3);
    const degFlat = attacker.degFlat || 0;
    result.rawDamage = (deg.total + (attacker.degBonus || 0) + degFlat) * (result.critical ? 2 : 1);
    // armure physique : fixe (base + équipement) + naturelle en D3 (achetée en PI)
    // armure magique : effets de potions/parchemins (armorMag, peut être négative)
    let armor = 0;
    if (!opts.ignoreArmor) {
      const phys = (defender.armorPhys != null ? defender.armorPhys : defender.armor || 0)
        + (defender.armorDice ? rollDice(defender.armorDice, 3).total : 0);
      const mag = defender.armorMag || 0;
      armor = Math.max(0, opts.magic ? mag : phys + mag);
    }
    result.armorReduction = armor;
    result.damage = Math.max(1, result.rawDamage - armor);
  }
  return result;
}

/* Maîtrise d'un talent (compétence ou sortilège) : jet D100 sous le pourcentage.
 * En cas de réussite, la maîtrise progresse comme à MountyHall :
 * +1D6 % jusqu'à 50 %, +1D3 % jusqu'à 75 %, +1 % ensuite.
 * Sous 50 %, un échec fait quand même progresser de 1 % (on apprend de ses ratés).
 * Plafond `cap` : 90 % pour les compétences, 80 % pour les sortilèges. */
function masteryRoll(talent, cap, threshold) {
  const pct = threshold != null ? threshold : talent.pct;
  const roll = 1 + Math.floor(Math.random() * 100);
  const success = roll <= pct;
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

/* PX de mise à mort : 10 + 2 × (niveau cible − niveau troll) + niveau cible. */
function killPX(trollLevel, targetLevel) {
  return 10 + 2 * (targetLevel - trollLevel) + targetLevel;
}

/* ================= Les 5 races ================= */

/* Profils de base officiels (mountyhall.com/MH_Rules/Races_*.php) :
 * chaque race a sa compétence et son sortilège réservés (START_COMP_PCT / START_SORT_PCT). */
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
    sort: { name: "Rafale Psychique", cost: 4, desc: "Touche automatiquement (imparable) : 1D3 par dé de DEG, ignore l'armure physique (résistance : moitié)." },
  },
  Kastar: {
    emoji: "🔴", favored: "deg",
    desc: "Les vampires du Hall : leurs coups les nourrissent.",
    stats: { att: 3, esq: 3, deg: 4, reg: 1, pvMax: 30, vue: 3 },
    comp: { name: "Accélération du Métabolisme", cost: 2, desc: "Sacrifie des PV (1D3 + fatigue) pour regagner 4 PA. La fatigue monte à chaque usage." },
    sort: { name: "Vampirisme", cost: 4, desc: "Cible adjacente : 2D6 par tranche de 3 dés de DEG vs ESQ, dégâts 1D3 par dé de DEG, ignore l'armure physique, soigne 50 % (résistance : moitié)." },
  },
  Tomawak: {
    emoji: "🟡", favored: "vue",
    desc: "Trõlls furtifs, chasseurs embusqués aux yeux perçants.",
    stats: { att: 3, esq: 3, deg: 3, reg: 1, pvMax: 30, vue: 4 },
    comp: { name: "Camouflage", cost: 2, desc: "Invisible aux monstres tant que tu n'attaques pas ; à chaque pas, jet sous 75 % de la maîtrise pour rester caché." },
    sort: { name: "Projectile Magique", cost: 4, desc: "À distance (portée = Vue) : 1D6 par case de Vue + bonus de proximité, dégâts 1D3 par tranche de 2 cases de Vue, ignore l'armure physique (résistance : moitié)." },
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

/* Dégâts des monstres en D3, comme ceux des trolls.
 * Comme l'armure, l'ATT et les DEG existent en physique (`att`, `deg`, `armor`)
 * et en magique (`attMag`, `degMag`, `armorMag`) : un monstre avec attMag et
 * degMag > 0 peut porter une attaque magique (attMag D6 vs ESQ, degMag D3,
 * réduite par la seule armure magique). Valeurs magiques provisoires à 0 — le
 * bestiaire sera mis à jour avec les vraies valeurs (réglables via l'admin). */
const MONSTER_TYPES = [
  { name: "Gobelin",           emoji: "👺", level: 1, att: 2, esq: 2, deg: 2, attMag: 0, degMag: 0, pv: 12, armor: 0, armorMag: 0, vue: 4 },
  { name: "Champignon Vénéneux", emoji: "🍄", level: 1, att: 3, esq: 1, deg: 3, attMag: 0, degMag: 0, pv: 10, armor: 0, armorMag: 0, vue: 1, static: true },
  { name: "Araignée Géante",   emoji: "🕷️", level: 2, att: 3, esq: 3, deg: 3, attMag: 0, degMag: 0, pv: 16, armor: 0, armorMag: 0, vue: 5 },
  { name: "Gargouille",        emoji: "🦇", level: 3, att: 3, esq: 3, deg: 3, attMag: 0, degMag: 0, pv: 22, armor: 2, armorMag: 0, vue: 4 },
  { name: "Momie",             emoji: "🧟", level: 3, att: 4, esq: 2, deg: 4, attMag: 0, degMag: 0, pv: 26, armor: 1, armorMag: 0, vue: 3 },
  { name: "Sorcière",          emoji: "🧙", level: 4, att: 4, esq: 3, deg: 5, attMag: 0, degMag: 0, pv: 24, armor: 0, armorMag: 0, vue: 6 },
  { name: "Golem de Pierre",   emoji: "🗿", level: 5, att: 4, esq: 1, deg: 6, attMag: 0, degMag: 0, pv: 40, armor: 4, armorMag: 0, vue: 3 },
];

const BOSS = { name: "Béhémoth", emoji: "👹", level: 9, att: 6, esq: 4, deg: 8, attMag: 0, degMag: 0, pv: 90, armor: 3, armorMag: 0, vue: 8, boss: true };

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
    attMag: Math.round((type.attMag || 0) * tpl.mult),
    esq: Math.max(1, Math.round(type.esq * tpl.mult)),
    deg: Math.max(1, Math.round(type.deg * tpl.mult)),
    degMag: Math.round((type.degMag || 0) * tpl.mult),
    pv: Math.round(type.pv * tpl.mult), pvMax: Math.round(type.pv * tpl.mult),
    armor: type.armor, armorMag: type.armorMag || 0, vue: type.vue, static: !!type.static,
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

/* Instancie un objet depuis une spec d'éditeur : {x, y, kind, slot?, idx?, gold?}.
 * Les specs « weapon »/« armor » à idx des anciens niveaux publiés sont mappées
 * vers l'équipement Mountypedia équivalent. */
function itemFromSpec(spec) {
  const base = { x: spec.x, y: spec.y };
  if (spec.kind === "potion") return { ...base, ...makePotionItem(spec.potionId, spec.power) };
  if (spec.kind === "scroll") return { ...base, ...makeScrollItem(spec.scrollId, spec.power) };
  if (spec.kind === "gold") {
    const gold = spec.gold || 60;
    return { ...base, kind: "gold", name: `${gold} Mountyzédons`, emoji: "💰", gold };
  }
  if (spec.kind === "gear") return { ...base, ...makeRandomGear(5, spec.slot) };
  if (spec.kind === "weapon") {
    const name = LEGACY_WEAPON_NAMES[(spec.idx || 0) % LEGACY_WEAPON_NAMES.length];
    return { ...base, ...gearItemByName("arme", name) };
  }
  const name = LEGACY_ARMOR_NAMES[(spec.idx || 0) % LEGACY_ARMOR_NAMES.length];
  return { ...base, ...gearItemByName("armure", name) };
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

function makeItem(depth) {
  const r = Math.random();
  if (r < 0.3) return makeRandomPotion();
  if (r < 0.42) return makeRandomScroll();
  if (r < 0.7) return makeRandomGear(depth);
  const gold = rollDice(depth, 6).total * 10;
  return { kind: "gold", name: `${gold} Mountyzédons`, emoji: "💰", gold };
}

/* ================= État du jeu ================= */

const MAX_DEPTH = 5;
const PA_PER_TURN = 6;
const COSTS = { move: 1, attack: 3, pickup: 1, equip: 2, potion: 1, scroll: 1, unequip: 1, eat: 1, drop: 1 };

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
      comp: { pct: START_COMP_PCT }, sort: { pct: START_SORT_PCT }, fatigue: 0, compUsed: false,
      compPXTurn: false, sortPXTurn: false,
      equip: { arme: null, armure: null, casque: null, bouclier: null, talisman: null, bottes: null },
      gearMods: null,
      pa: PA_PER_TURN, pi: 0, totalPI: 0, gold: 0,
      bag: [], camo: false, kills: 0, dla: 1, tour: 1,
      potionEffects: [], blockCamoTurns: 0,
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

/* Portée en cases (Chebyshev), comme pour la Vue des monstres à MH. */
function tileDist(x, y) {
  const t = G.troll;
  return Math.max(Math.abs(x - t.x), Math.abs(y - t.y));
}

function currentVue() {
  return effTroll(G.troll).vue;
}

function inSightAt(x, y) {
  return tileDist(x, y) <= currentVue();
}

function inSight(e) {
  return inSightAt(e.x, e.y);
}

/* Révèle les cases à portée de la Vue actuelle (ajout uniquement).
 * La mémoire (zones déjà explorées, affichées plus sombres) est conservée
 * même si la Vue diminue — seuls monstres et trésors hors portée sont masqués. */
function refreshFov() {
  const r = currentVue();
  const { x, y } = G.troll;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) > r) continue;
      const tx = x + dx, ty = y + dy;
      if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) continue;
      G.seen.add(ty * MAP_W + tx);
    }
  }
}

const updateFov = refreshFov;

function spellMM() {
  const eff = effTroll(G.troll);
  return trollMM() + Math.round(eff.mmPct / 10);
}

function spellRM(m) {
  const eff = effTroll(G.troll);
  return monsterRM(m) + Math.round(eff.rmPct / 10);
}

/* ================= Actions du troll ================= */

/* ----- Détail du combat (panneau façon MountyHall, à droite du journal) ----- */

let CD = null; // bloc de détail en cours de construction

function cdStart(title) {
  CD = { title, lines: [] };
  G.actionPX = 0;
}

function cdLine(html) {
  if (CD) CD.lines.push(html);
}

function cdPXLine() {
  cdLine(`Pour cette action, vous avez gagné un total de <span class="cd-val">${G.actionPX} PX</span>.`);
}

function cdFlush() {
  if (!CD) return;
  const block = CD;
  CD = null;
  if (typeof document === "undefined") return;
  const panel = $("combat-detail");
  if (!panel) return;
  const empty = panel.querySelector(".cd-empty");
  if (empty) empty.remove();
  const div = document.createElement("div");
  div.className = "cd-block";
  div.innerHTML = `<div class="cd-title">${block.title}</div>` + block.lines.map(l => `<div>${l}</div>`).join("");
  panel.appendChild(div);
  while (panel.querySelectorAll(".cd-block").length > 25) panel.querySelector(".cd-block").remove();
  panel.scrollTop = panel.scrollHeight;
}

/* Gain de PX (convertis en PI) comptabilisé dans l'action en cours. */
function gainPX(n) {
  if (!n) return;
  G.troll.pi += n;
  G.troll.totalPI += n;
  if (G.actionPX !== undefined) G.actionPX += n;
}

function adjustPX(n) {
  if (!n) return;
  G.troll.pi += n;
  G.troll.totalPI += n;
  if (G.actionPX !== undefined) G.actionPX += n;
}

/* Jets de toucher au format MH dans le détail. */
function cdAttackRolls(r) {
  const attLbl = r.attFlat
    ? `${r.attDice}D6 ${r.attFlat > 0 ? "+" : ""}${r.attFlat}`
    : `${r.attDice}D6`;
  const esqLbl = r.esqFlat
    ? `${r.esqDice}D6 ${r.esqFlat > 0 ? "+" : ""}${r.esqFlat}`
    : `${r.esqDice}D6`;
  cdLine(`Votre jet d'Attaque est de : <span class="cd-val">${r.attRoll}</span> (${attLbl})`);
  cdLine(`Le jet d'Esquive de votre adversaire est de : <span class="cd-val">${r.esqRoll}</span> (${esqLbl})`);
  if (r.hit) {
    cdLine(r.critical
      ? `Vous avez donc <span class="cd-good">TOUCHÉ</span> votre adversaire par un <span class="cd-good">coup critique</span>.`
      : `Vous avez donc <span class="cd-good">TOUCHÉ</span> votre adversaire.`);
  } else {
    cdLine(`Vous avez donc <span class="cd-bad">RATÉ</span> votre adversaire.`);
  }
}

/* Jet de résistance magique au format MH. */
function resistInfo(m) {
  const r = resolveSpell(spellMM(), spellRM(m));
  cdLine(`Seuil de Résistance de la cible : <span class="cd-val">${r.sr} %</span>`);
  cdLine(`Jet de Résistance : <span class="cd-val">${r.roll}</span>`);
  cdLine(r.success
    ? `La cible endure donc <span class="cd-good">pleinement l'effet</span> du sortilège.`
    : `La cible <span class="cd-bad">résiste partiellement</span> à l'effet du sortilège.`);
  return !r.success;
}

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
  cdStart(`⚔️ Attaque sur ${m.name}`);
  cdLine(`Vous avez attaqué <b>${m.name}</b> avec votre ${G.troll.equip.arme ? G.troll.equip.arme.name : "Grosse Patte de Trõll"}.`);
  const r = resolveAttack(effTroll(G.troll), effMonster(m));
  cdAttackRolls(r);
  if (r.hit) {
    m.pv -= r.damage;
    gainPX(1); // +1 PX par attaque réussie (converti en PI)
    cdLine(`Vous lui avez infligé <span class="cd-val">${r.damage} points de dégâts</span>${r.armorReduction ? ` (son armure a absorbé ${r.armorReduction} point(s))` : ""}.`);
    log(`Tu attaques ${m.name} : ATT ${r.attRoll} vs ESQ ${r.esqRoll} → ${r.critical ? "CRITIQUE ! " : "touché ! "}${r.damage} dégâts.`, "combat");
    if (m.pv <= 0) killMonster(m, "attack");
  } else {
    log(`Tu attaques ${m.name} : ATT ${r.attRoll} vs ESQ ${r.esqRoll} → esquivé !`, "combat");
  }
  cdPXLine();
  cdFlush();
  if (G.troll.camo) {
    G.troll.camo = false;
    log("Ton attaque brise le camouflage.", "info");
  }
  afterAction();
  return true;
}

function killMonster(m, source = "attack") {
  const trollLvl = levelFromTotalPI(G.troll.totalPI);
  const rawKillPx = killPX(trollLvl, m.level);
  let killGain = 0;
  if (rawKillPx < 0) {
    if (source === "attack") adjustPX(-1); // annule le +1 PX d'attaque réussie
    // comp/sort : on conserve uniquement le PX de talent déjà gagné
  } else {
    killGain = rawKillPx;
    gainPX(killGain);
  }
  G.troll.kills++;
  cdLine(`Vous l'avez <span class="cd-good">TUÉ</span> et vous avez débarrassé le Monde Souterrain de sa présence maléfique.`);
  if (killGain > 0) {
    log(`💀 ${m.name} est terrassé ! +${killGain} PX de mise à mort (convertis en PI à l'entraînement).`, "good");
  } else if (rawKillPx < 0 && source !== "attack") {
    log(`💀 ${m.name} est terrassé ! Pas de bonus de mise à mort (adversaire trop faible).`, "good");
  } else if (rawKillPx < 0) {
    log(`💀 ${m.name} est terrassé ! Pas de PX (adversaire trop faible).`, "good");
  } else {
    log(`💀 ${m.name} est terrassé !`, "good");
  }
  // butin : les monstres lâchent parfois un trésor en mourant
  if (Math.random() < 0.4 && !G.items.some(i => i.x === m.x && i.y === m.y)) {
    const lr = Math.random();
    const drop = lr < 0.4
      ? { ...makeRandomPotion(), x: m.x, y: m.y }
      : lr < 0.65
        ? { ...makeRandomScroll(), x: m.x, y: m.y }
        : { kind: "gold", gold: m.level * 10, name: `${m.level * 10} Mountyzédons`, emoji: "💰", x: m.x, y: m.y };
    G.items.push(drop);
    cdLine(`Il a de plus laissé tomber <span class="cd-val">${drop.emoji} ${drop.name}</span>.`);
    log(`${m.name} laisse tomber ${drop.emoji} ${drop.name}.`, "info");
  }
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

/* En fin d'action de talent : clôt le bloc de détail s'il est ouvert. */
function cdClose() {
  if (CD) { cdPXLine(); cdFlush(); }
}

/* Tente le talent : dépense les PA (moitié remboursée en cas d'échec, comme à MH),
 * jette la maîtrise, journalise et ouvre le bloc de détail du combat.
 * Retourne true si l'effet s'applique ; le bloc reste à flusher par l'appelant. */
function tryTalent(talent, cap, cost, label, kind) {
  if (!spendPA(cost)) return false;
  cdStart(label);
  const before = talent.pct; // le jet se compare à la maîtrise d'avant progression (+ potions)
  const effPct = talentPctWithPotions(G.troll, talent, cap);
  const r = masteryRoll(talent, cap, effPct);
  talent.tries = (talent.tries || 0) + 1;
  if (r.success) talent.successes = (talent.successes || 0) + 1;
  talent.lastUse = Date.now();
  const pctLabel = effPct !== before ? `${effPct} % (base ${before} %)` : `${before} %`;
  cdLine(`Jet de maîtrise : <span class="cd-val">${r.roll}</span> (il fallait ${pctLabel} ou moins)`);
  if (!r.success) {
    G.troll.pa += Math.floor(cost / 2);
    if (r.gain) cdLine(`Vous avez <span class="cd-good">augmenté votre Maîtrise</span> de <span class="cd-val">1 point</span> en apprenant de votre raté (→ ${talent.pct} %).`);
    cdLine(`L'action <span class="cd-bad">échoue</span> ; la moitié des PA est remboursée.`);
    const learn = r.gain ? ` Maîtrise +1 % → ${talent.pct} %.` : "";
    log(`${label} : échec (jet ${r.roll}). La moitié des PA est remboursée.${learn}`, "combat");
    return false;
  }
  const pxFlag = kind === "comp" ? "compPXTurn" : "sortPXTurn";
  if (!G.troll[pxFlag]) {
    gainPX(1);
    G.troll[pxFlag] = true;
  }
  if (r.gain && talent.pct > before) {
    cdLine(`Vous avez <span class="cd-good">augmenté votre Maîtrise</span> de <span class="cd-val">${talent.pct - before} point(s)</span> (→ ${talent.pct} %).`);
    log(`${label} : réussite (jet ${r.roll}) — maîtrise +${talent.pct - before} % → ${talent.pct} %.`, "good");
  }
  return true;
}

function useComp() {
  if (G.over) return;
  const t = G.troll;
  const te = effTroll(t);
  const comp = RACES[t.race].comp;

  if (t.race === "Skrim") { // Botte Secrète : attaque bonus, 1 fois par DLA
    if (t.compUsed) { log("Botte Secrète déjà utilisée cette DLA.", "info"); return; }
    const m = adjacentMonster();
    if (!m) { log("Aucun monstre adjacent.", "info"); return; }
    if (!tryTalent(t.comp, 90, comp.cost, "🥋 Botte Secrète", "comp")) { cdFlush(); afterAction(); return; }
    t.compUsed = true;
    cdLine(`Vous portez une <b>Botte Secrète</b> à <b>${m.name}</b>.`);
    const pseudo = { ...te, att: Math.max(1, Math.floor(te.att * 2 / 3)), deg: Math.max(1, Math.floor(te.att / 2)) };
    const r = resolveAttack(pseudo, effMonster(m));
    cdAttackRolls(r);
    if (r.hit) {
      m.pv -= r.damage;
      cdLine(`Vous lui avez infligé <span class="cd-val">${r.damage} points de dégâts</span>.`);
      log(`Botte Secrète : ${r.attRoll} vs ${r.esqRoll} → ${r.damage} dégâts !`, "combat");
      if (m.pv <= 0) killMonster(m, "comp");
    } else {
      log(`Botte Secrète esquivée (${r.attRoll} vs ${r.esqRoll}).`, "combat");
    }
  } else if (t.race === "Durakuir") { // Régénération Accrue : 1D3 par tranche de 15 PV max
    if (!tryTalent(t.comp, 90, comp.cost, "🥋 Régénération Accrue", "comp")) { cdFlush(); afterAction(); return; }
    const dice = Math.max(1, Math.floor(t.pvMax / 15));
    const heal = rollDice(dice, 3).total;
    t.pv = Math.min(t.pvMax, t.pv + heal);
    cdLine(`Votre chair se referme : vous récupérez <span class="cd-val">${heal} points de Vie</span> (${dice}D3).`);
    log(`Régénération Accrue : ${dice}D3 → +${heal} PV.`, "good");
  } else if (t.race === "Kastar") { // Accélération du Métabolisme : PV → PA, fatigue croissante
    if (!tryTalent(t.comp, 90, comp.cost, "🥋 Accélération du Métabolisme", "comp")) { cdFlush(); afterAction(); return; }
    const cost = rollDice(1, 3).total + t.fatigue;
    t.fatigue += 1;
    t.pv -= cost;
    t.pa = Math.min(PA_PER_TURN, t.pa + 4);
    cdLine(`Vous sacrifiez <span class="cd-bad">${cost} points de Vie</span> pour regagner <span class="cd-val">4 PA</span> (fatigue : ${t.fatigue}).`);
    log(`Accélération du Métabolisme : −${cost} PV, +4 PA (fatigue ${t.fatigue}).`, "good");
    if (t.pv <= 0) { cdClose(); die({ name: "son propre métabolisme" }); return; }
  } else if (t.race === "Tomawak") { // Camouflage : invisible tant qu'on n'attaque pas
    if (t.blockCamoTurns > 0) { log("La Pàïntûré t'empêche de te camoufler.", "info"); return; }
    if (t.camo) { log("Tu es déjà camouflé.", "info"); return; }
    if (!tryTalent(t.comp, 90, comp.cost, "🥋 Camouflage", "comp")) { cdFlush(); afterAction(); return; }
    t.camo = true;
    cdLine(`Vous vous fondez dans les ombres : <span class="cd-good">invisible</span> tant que vous n'attaquez pas.`);
    log("🌫️ Camouflage : les monstres ne te voient plus. Chaque pas risque de te dévoiler (75 % de la maîtrise).", "good");
  } else if (t.race === "Darkling") { // Balayage : déstabilise, la cible perd son tour
    if (t.compUsed) { log("Balayage déjà utilisé cette DLA.", "info"); return; }
    const m = adjacentMonster();
    if (!m) { log("Aucun monstre adjacent.", "info"); return; }
    if (!tryTalent(t.comp, 90, comp.cost, "🥋 Balayage", "comp")) { cdFlush(); afterAction(); return; }
    t.compUsed = true;
    const destab = rollDice(te.att, 6).total;
    const stab = rollDice(Math.max(1, Math.floor(m.esq * 2 / 3)), 6).total;
    cdLine(`Vous balayez <b>${m.name}</b>.`);
    cdLine(`Votre jet de Déstabilisation est de : <span class="cd-val">${destab}</span>`);
    cdLine(`Le jet de Stabilité de votre adversaire est de : <span class="cd-val">${stab}</span>`);
    if (destab > stab) {
      m.skip = (m.skip || 0) + 1;
      cdLine(`Votre adversaire est <span class="cd-good">À TERRE</span> et perdra son prochain tour.`);
      log(`Balayage : ${destab} vs ${stab} → ${m.name} est à terre et perdra son prochain tour !`, "good");
    } else {
      cdLine(`Votre adversaire <span class="cd-bad">reste stable</span>.`);
      log(`Balayage : ${destab} vs ${stab} → ${m.name} reste stable.`, "combat");
    }
  }
  cdClose();
  afterAction();
}

function useSort() {
  if (G.over) return;
  const t = G.troll;
  const te = effTroll(t);
  const sort = RACES[t.race].sort;

  if (t.race === "Skrim") { // Hypnotisme : esquive /2 + perd son tour
    const m = adjacentMonster();
    if (!m) { log("Aucun monstre adjacent.", "info"); return; }
    if (!tryTalent(t.sort, 80, sort.cost, "🔮 Hypnotisme", "sort")) { cdFlush(); afterAction(); return; }
    cdLine(`Vous avez attaqué <b>${m.name}</b> grâce à un sortilège.`);
    const res = resistInfo(m);
    m.esqHalfTurns = (m.esqHalfTurns || 0) + (res ? 1 : 2);
    if (!res) m.skip = (m.skip || 0) + 1;
    cdLine(res
      ? `Son esquive est <span class="cd-val">divisée par 2</span> pendant 1 tour.`
      : `Son esquive est <span class="cd-val">divisée par 2</span> pendant 2 tours et il <span class="cd-good">perd son prochain tour</span>.`);
    log(res
      ? `Hypnotisme : ${m.name} résiste — esquive réduite 1 tour seulement.`
      : `Hypnotisme : ${m.name} est hébété ! Esquive divisée par 2 et tour perdu.`, "good");
  } else if (t.race === "Durakuir") { // Rafale Psychique : imparable, ignore l'armure
    const m = adjacentMonster();
    if (!m) { log("Aucun monstre adjacent.", "info"); return; }
    if (!tryTalent(t.sort, 80, sort.cost, "🔮 Rafale Psychique", "sort")) { cdFlush(); afterAction(); return; }
    cdLine(`Vous avez attaqué <b>${m.name}</b> grâce à un sortilège.`);
    cdLine(`Votre jet d'Attaque est : <span class="cd-good">automatiquement réussi</span> (imparable).`);
    const armMag = Math.max(0, effMonster(m).armorMag);
    let dmg = Math.max(1, rollDice(te.deg, 3).total - armMag);
    const res = resistInfo(m);
    if (res) dmg = Math.max(1, Math.ceil(dmg / 2));
    m.pv -= dmg;
    cdLine(`Vous lui avez infligé <span class="cd-val">${dmg} points de dégâts</span> (armure physique ignorée${armMag ? `, armure magique −${armMag}` : ""}).`);
    log(`Rafale Psychique : touche automatique, ${dmg} dégâts${res ? " (résisté : moitié)" : ""}, armure physique ignorée.`, "combat");
    if (m.pv <= 0) killMonster(m, "sort");
  } else if (t.race === "Kastar") { // Vampirisme : dégâts + vol de vie
    const m = adjacentMonster();
    if (!m) { log("Aucun monstre adjacent.", "info"); return; }
    if (!tryTalent(t.sort, 80, sort.cost, "🔮 Vampirisme", "sort")) { cdFlush(); afterAction(); return; }
    cdLine(`Vous avez attaqué <b>${m.name}</b> grâce à un sortilège.`);
    const pseudo = { ...te, att: Math.max(1, Math.floor(te.deg * 2 / 3)) };
    const r = resolveAttack(pseudo, effMonster(m), { magic: true });
    cdAttackRolls(r);
    if (r.hit) {
      let dmg = r.damage;
      const res = resistInfo(m);
      if (res) dmg = Math.max(1, Math.ceil(dmg / 2));
      m.pv -= dmg;
      const heal = Math.ceil(dmg / 2);
      t.pv = Math.min(t.pvMax, t.pv + heal);
      cdLine(`Vous lui avez infligé <span class="cd-val">${dmg} points de dégâts</span> (armure physique ignorée${r.armorReduction ? `, armure magique −${r.armorReduction}` : ""}).`);
      cdLine(`Vous avez également gagné <span class="cd-good">${heal} points de Vie</span> grâce au Vampirisme.`);
      log(`Vampirisme : ${dmg} dégâts${res ? " (résisté)" : ""}, tu draines ${heal} PV.`, "good");
      if (m.pv <= 0) killMonster(m, "sort");
    } else {
      log(`Vampirisme esquivé (${r.attRoll} vs ${r.esqRoll}).`, "combat");
    }
  } else if (t.race === "Tomawak") { // Projectile Magique : à distance, portée = Vue
    const m = nearestVisibleMonster();
    if (!m) { log("Aucun monstre en vue.", "info"); return; }
    if (!tryTalent(t.sort, 80, sort.cost, "🔮 Projectile Magique", "sort")) { cdFlush(); afterAction(); return; }
    const dist = Math.max(Math.abs(m.x - t.x), Math.abs(m.y - t.y));
    const proxBonus = Math.max(0, te.vue - dist);
    cdLine(`Vous avez attaqué <b>${m.name}</b> grâce à un sortilège (distance ${dist}, bonus de proximité +${proxBonus}D6).`);
    const pseudo = { att: te.vue + proxBonus, deg: Math.max(1, Math.floor(te.vue / 2)), degBonus: 0 };
    const r = resolveAttack(pseudo, effMonster(m), { magic: true });
    cdAttackRolls(r);
    if (r.hit) {
      let dmg = r.damage;
      const res = resistInfo(m);
      if (res) dmg = Math.max(1, Math.ceil(dmg / 2));
      m.pv -= dmg;
      cdLine(`Vous lui avez infligé <span class="cd-val">${dmg} points de dégâts</span> (armure physique ignorée${r.armorReduction ? `, armure magique −${r.armorReduction}` : ""}).`);
      log(`Projectile Magique sur ${m.name} (distance ${dist}) : ${dmg} dégâts${res ? " (résisté)" : ""}.`, "combat");
      if (m.pv <= 0) killMonster(m, "sort");
    } else {
      log(`Projectile Magique esquivé (${r.attRoll} vs ${r.esqRoll}).`, "combat");
    }
    // 25 % de la maîtrise pour conserver le camouflage
    if (t.camo && 1 + Math.floor(Math.random() * 100) > Math.floor(t.comp.pct * 0.25)) {
      t.camo = false;
      cdLine(`Votre <span class="cd-bad">camouflage se dissipe</span> dans l'éclat du projectile.`);
      log("Ton camouflage se dissipe dans l'éclat du projectile.", "info");
    }
  } else if (t.race === "Darkling") { // Siphon des Âmes : dégâts + nécrose (−ATT)
    const m = adjacentMonster();
    if (!m) { log("Aucun monstre adjacent.", "info"); return; }
    if (!tryTalent(t.sort, 80, sort.cost, "🔮 Siphon des Âmes", "sort")) { cdFlush(); afterAction(); return; }
    cdLine(`Vous avez attaqué <b>${m.name}</b> grâce à un sortilège.`);
    const pseudo = { ...te, deg: te.reg, degBonus: 0 };
    const r = resolveAttack(pseudo, effMonster(m), { ignoreArmor: true, magic: true });
    cdAttackRolls(r);
    if (r.hit) {
      let dmg = r.damage;
      const res = resistInfo(m);
      if (res) dmg = Math.max(1, Math.ceil(dmg / 2));
      m.pv -= dmg;
      const necrose = res ? Math.max(1, Math.floor(te.reg / 2)) : te.reg;
      m.attDownDice = (m.attDownDice || 0) + necrose;
      m.attDownTurns = 2;
      cdLine(`Vous lui avez infligé <span class="cd-val">${dmg} points de dégâts</span> (toute armure ignorée).`);
      cdLine(`La nécrose lui fait perdre <span class="cd-val">${necrose} dé(s) d'Attaque</span> pendant 2 tours.`);
      log(`Siphon des Âmes : ${dmg} dégâts${res ? " (résisté)" : ""}, nécrose −${necrose} dé(s) d'ATT pendant 2 tours.`, "combat");
      if (m.pv <= 0) killMonster(m, "sort");
    } else {
      log(`Siphon des Âmes esquivé (${r.attRoll} vs ${r.esqRoll}).`, "combat");
    }
  }
  cdClose();
  if (!G.over) afterAction();
}

/* Caractéristiques effectives d'un monstre, statuts compris. */
function effMonster(m) {
  return {
    ...m,
    att: Math.max(1, m.att - (m.attDownTurns > 0 ? m.attDownDice || 0 : 0)),
    esq: m.esqHalfTurns > 0 ? Math.max(1, Math.floor(m.esq / 2)) : m.esq,
    vue: Math.max(1, m.vue - (m.vueMalusTurns > 0 ? m.vueMalus || 0 : 0)),
    armorPhys: m.armor || 0,
    armorMag: m.armorMag || 0,
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
    if (!drinkPotion(t, item, rollDice, log)) return;
    t.bag.splice(idx, 1);
    if (countActiveEffects(t) > 0) switchLeftTab("effects");
    updateFov();
  } else if (item.kind === "scroll") {
    if (!spendPA(COSTS.scroll)) return;
    const res = readScroll(t, item, rollDice, log);
    if (!res) return;
    t.bag.splice(idx, 1);
    if (res.zone) applyScrollZone(res.zone);
    if (countActiveEffects(t) > 0) switchLeftTab("effects");
    updateFov();
  } else if (item.kind === "gear") {
    if (!spendPA(COSTS.equip)) return;
    t.bag.splice(t.bag.indexOf(item), 1);
    equipGear(t, item);
  }
  afterAction();
}

/* Déséquipe une pièce : elle revient dans le sac. */
function unequipSlot(slot) {
  const t = G.troll;
  if (!t.equip[slot]) return;
  if (!spendPA(COSTS.unequip)) return;
  unequipToBag(t, slot);
  t.gearMods = gearMods(t.equip);
  updateFov();
  afterAction();
}

/* « Goinfrer » une pièce d'équipement du sac : détruite, petit bonus aléatoire. */
function eatBagItem(idx) {
  const t = G.troll;
  const item = t.bag[idx];
  if (!item || item.kind !== "gear") return;
  if (!spendPA(COSTS.eat)) return;
  t.bag.splice(idx, 1);
  const r = goinfreItem(t, rollDice);
  cdStart(`🍴 Goinfre : ${item.emoji} ${item.name}`);
  cdLine(`<b>« ${r.cry} »</b> ${r.effect}.`);
  cdLine(`<i>${r.flavor}</i>`);
  cdFlush();
  log(`🍴 Tu goinfres ${item.name} : « ${r.cry} » ${r.effect}.`, "good");
  if (countActiveEffects(t) > 0) switchLeftTab("effects");
  afterAction();
}

/* Jette un objet du sac à terre (sur la case du troll). */
function dropBagItem(idx) {
  const t = G.troll;
  const item = t.bag[idx];
  if (!item) return;
  if (G.items.some(i => i.x === t.x && i.y === t.y)) {
    log("Il y a déjà quelque chose à terre ici.", "info");
    return;
  }
  if (!spendPA(COSTS.drop)) return;
  t.bag.splice(idx, 1);
  G.items.push({ ...item, x: t.x, y: t.y });
  log(`Tu jettes ${item.emoji} ${item.name} à terre.`, "info");
  afterAction();
}

/* ---------- Sac : tri par type et effets des objets ---------- */

/* Groupes d'affichage du sac, dans l'ordre : potions, parchemins, puis
 * l'équipement par emplacement. Retourne [{label, entries: [{item, idx}]}]. */
function bagGroups(bag) {
  const groups = [
    { key: "potion", label: "🧪 Potions", match: i => i.kind === "potion" },
    { key: "scroll", label: "📜 Parchemins", match: i => i.kind === "scroll" },
    ...Object.entries(GEAR_SLOTS).map(([slot, info]) => ({
      key: slot,
      label: `${info.emoji} ${info.label.endsWith("s") ? info.label : info.label + "s"}`,
      match: i => i.kind === "gear" && i.slot === slot,
    })),
  ];
  const out = [];
  for (const grp of groups) {
    const entries = bag.map((item, idx) => ({ item, idx })).filter(e => grp.match(e.item));
    if (entries.length) out.push({ label: grp.label, entries });
  }
  // sécurité : tout objet d'un type inattendu reste visible
  const known = new Set(out.flatMap(grp => grp.entries.map(e => e.idx)));
  const rest = bag.map((item, idx) => ({ item, idx })).filter(e => !known.has(e.idx));
  if (rest.length) out.push({ label: "❓ Divers", entries: rest });
  return out;
}

/* Lignes d'effets d'un objet du sac (X remplacé par le niveau du trésor). */
function itemEffectLines(item) {
  const fromTable = (table, idField) => {
    const row = (table || []).find(r => r[0] === item[idField]);
    if (!row) return [];
    const [, , duration, lines] = row;
    return [lines.map(l => l.replace(/\bX\b/g, item.power)).join(" · ") + ` (${duration})`];
  };
  if (item.kind === "potion") return fromTable(typeof TREASURE_POTIONS !== "undefined" ? TREASURE_POTIONS : null, "potionId");
  if (item.kind === "scroll") return fromTable(typeof TREASURE_SCROLLS !== "undefined" ? TREASURE_SCROLLS : null, "scrollId");
  if (item.kind === "gear") {
    const fx = formatGearMods(item.mods);
    return [(fx || "aucun bonus") + (item.twoHanded ? " · 2 mains" : "")];
  }
  return [];
}

/* Range une pièce équipée dans le sac (retire son bonus de PV max).
 * Ne recalcule PAS gearMods : l'appelant s'en charge. */
function unequipToBag(t, slot, logFn = log) {
  const old = t.equip[slot];
  if (!old) return null;
  t.equip[slot] = null;
  t.bag.push(old);
  if (old.mods.pv) {
    t.pvMax = Math.max(1, t.pvMax - old.mods.pv);
    t.pv = Math.max(1, Math.min(t.pv, t.pvMax));
  }
  logFn(`Tu ranges ${old.emoji} ${old.name} dans ton sac.`, "info");
  return old;
}

/* Équipe une pièce : range l'ancienne au sac, gère l'exclusion arme à 2 mains /
 * bouclier, applique le bonus de PV max et recalcule les modificateurs. */
function equipGear(t, item) {
  const unequipTo = (slot) => unequipToBag(t, slot);
  if (item.slot === "arme" && item.twoHanded && t.equip.bouclier) {
    unequipTo("bouclier");
    log("Une arme à deux mains ne laisse pas de place au bouclier.", "info");
  }
  if (item.slot === "bouclier" && t.equip.arme && t.equip.arme.twoHanded) {
    unequipTo("arme");
    log("Impossible de tenir un bouclier avec une arme à deux mains : tu la ranges.", "info");
  }
  unequipTo(item.slot);
  t.equip[item.slot] = item;
  if (item.mods.pv) {
    t.pvMax = Math.max(1, t.pvMax + item.mods.pv);
    t.pv = Math.max(1, Math.min(t.pv, t.pvMax));
  }
  t.gearMods = gearMods(t.equip);
  const fx = formatGearMods(item.mods);
  log(`Tu t'équipes : ${item.emoji} ${item.name}${fx ? ` (${fx})` : ""}.`, "good");
  if (G) updateFov();
}

/* Effet de zone d'un parchemin : touche tous les monstres à SCROLL_ZONE_RADIUS
 * cases ou moins du troll (le lecteur a déjà subi sa part dans readScroll). */
function applyScrollZone(zone) {
  const t = G.troll;
  const targets = G.monsters.filter(m =>
    Math.max(Math.abs(m.x - t.x), Math.abs(m.y - t.y)) <= SCROLL_ZONE_RADIUS);
  if (!targets.length) return;
  if (zone.type === "damage") {
    cdStart("💥 Effet de zone");
    for (const m of targets) {
      // dégâts magiques : seule l'armure magique du monstre les réduit
      const armMag = Math.max(0, m.armorMag || 0);
      const dmg = Math.max(1, zone.total - armMag);
      m.pv -= dmg;
      cdLine(`${m.emoji} ${m.name} subit <span class="cd-val">${dmg} points de dégâts</span> (${zone.label}${armMag ? `, armure magique −${armMag}` : ""}).`);
      log(`💥 ${m.name} est pris dans l'explosion : −${dmg} PV.`, "combat");
      if (m.pv <= 0) killMonster(m, "scroll");
    }
    cdFlush();
  } else if (zone.type === "vue") {
    for (const m of targets) {
      m.vueMalus = Math.max(m.vueMalus || 0, zone.malus);
      m.vueMalusTurns = Math.max(m.vueMalusTurns || 0, zone.turns);
      log(`🌶️ ${m.name} est aveuglé : VUE −${zone.malus} pendant ${zone.turns} tour(s).`, "good");
    }
  }
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
  const dlaBonusPA = tickPotionTurns(t, log);

  // Tour des monstres
  for (const m of G.monsters) {
    if (m.pv <= 0) continue;
    if (m.skip > 0) {
      m.skip--;
      log(`${m.emoji} ${m.name} est au sol et perd son tour.`, "good");
      continue;
    }
    const dist = Math.max(Math.abs(m.x - t.x), Math.abs(m.y - t.y));
    const seesTroll = !t.camo && dist <= effMonster(m).vue;
    if (dist <= 1 && !t.camo) {
      const eff = effMonster(m);
      // un monstre doté d'une attaque magique (attMag/degMag) alterne au hasard
      const magic = eff.attMag > 0 && eff.degMag > 0 && Math.random() < 0.5;
      const r = resolveAttack(magic ? { ...eff, att: eff.attMag, deg: eff.degMag } : eff, effTroll(t), { magic });
      cdStart(`${m.emoji} ${m.name} vous ${magic ? "frappe d'une attaque magique" : "attaque"}`);
      cdLine(`Son jet d'Attaque${magic ? " magique" : ""} est de : <span class="cd-val">${r.attRoll}</span> (${r.attDice}D6)`);
      cdLine(`Votre jet d'Esquive est de : <span class="cd-val">${r.esqRoll}</span> (${r.esqDice}D6)`);
      if (r.hit) {
        t.pv -= r.damage;
        cdLine(`Il vous a <span class="cd-bad">TOUCHÉ</span>${r.critical ? ` d'un <span class="cd-bad">coup critique</span>` : ""} et vous a infligé <span class="cd-bad">${r.damage} points de dégâts</span>${magic ? ` (seule votre armure magique compte${r.armorReduction ? ` : −${r.armorReduction}` : ""})` : r.armorReduction ? ` (votre armure a absorbé ${r.armorReduction} point(s))` : ""}.`);
        log(`${m.emoji} ${m.name} t'attaque${magic ? " (magie)" : ""} : ${r.attRoll} vs ${r.esqRoll} → ${r.damage} dégâts !`, "bad");
        if (t.pv <= 0) { cdLine(`Il vous a <span class="cd-bad">TERRASSÉ</span>…`); cdFlush(); die(m); return; }
      } else {
        cdLine(`Vous avez <span class="cd-good">ESQUIVÉ</span> son coup.`);
        log(`${m.emoji} ${m.name} t'attaque${magic ? " (magie)" : ""}… et tu esquives !`, "combat");
      }
      cdFlush();
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
    if (m.vueMalusTurns > 0 && --m.vueMalusTurns === 0) m.vueMalus = 0;
  }

  // Régénération (REG D3, comme à MountyHall) — bonus potions pris en compte
  const te = effTroll(t);
  if (t.pv < t.pvMax && t.pv > 0) {
    const r = rollDice(te.reg, 3);
    const heal = Math.max(0, r.total + (te.regFlat || 0));
    t.pv = Math.min(t.pvMax, t.pv + heal);
    const regLbl = te.regFlat ? `${te.reg}D3 ${te.regFlat > 0 ? "+" : ""}${te.regFlat}` : `${te.reg}D3`;
    log(`💤 Tour n°${t.tour} (DLA n°${t.dla}) : tu régénères ${heal} PV (${regLbl}).`, "info");
  } else {
    log(`💤 Tour n°${t.tour} (DLA n°${t.dla}).`, "info");
  }

  // bonus/malus de PA (potions, parchemins) : entre 1 et PA_PER_TURN + 3
  t.pa = Math.max(1, Math.min(PA_PER_TURN + 3, PA_PER_TURN + dlaBonusPA));
  t.compUsed = false;
  t.compPXTurn = false;
  t.sortPXTurn = false;
  t.fatigue = Math.floor(t.fatigue / 1.25); // la fatigue du Kastar retombe à chaque DLA
  refreshFov();
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
      const visible = inSightAt(x, y);
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
    if (!inSightAt(i.x, i.y)) continue;
    disc(i.x, i.y, i.kind === "gold" ? "#caa53d"
      : i.kind === "potion" || i.kind === "scroll" ? (i.color || "#5d8535") : "#7a8db0");
    ctx.fillStyle = "#1a140e";
    ctx.fillText(i.emoji, i.x * TILE + TILE / 2, i.y * TILE + TILE / 2 + 1);
  }
  for (const d of G.doors || []) {
    if (!inSightAt(d.x, d.y)) continue;
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

  const te = effTroll(t);
  const pct = Math.max(0, t.pv / t.pvMax);
  const hpClass = pct > 0.6 ? "high" : pct > 0.3 ? "mid" : "";
  $("stats").innerHTML = `
    <div><span>Tour</span><span class="stat-val">${t.tour}</span></div>
    <div><span>PV</span><span class="stat-val">${t.pv} / ${t.pvMax}</span></div>
    <div class="hp-bar-wrap"><div class="hp-bar ${hpClass}" style="width:${pct * 100}%"></div></div>
    <div><span>Attaque</span><span class="stat-val">${fmtStatLine(t.att, te.att, 6, te.attFlat, 0, { phys: te.attFlatPhys, mag: te.attFlatMag })}</span></div>
    <div><span>Esquive</span><span class="stat-val">${fmtStatLine(t.esq, te.esq, 6, te.esqFlat, 0, { phys: te.esqFlatPhys, mag: te.esqFlatMag })}</span></div>
    <div><span>Dégâts</span><span class="stat-val">${fmtStatLine(t.deg, te.deg, 3, te.degFlat, te.degBonus, { phys: te.degFlatPhys, mag: te.degFlatMag })}</span></div>
    <div><span>Régénération</span><span class="stat-val">${fmtStatLine(t.reg, te.reg, 3, te.regFlat, 0, { phys: te.regFlatPhys, mag: te.regFlatMag })}</span></div>
    <div><span>Armure</span><span class="stat-val">${fmtArmorLine(t.armorDice, te.armorPhys, te.armorMag)}</span></div>
    <div><span>Vue</span><span class="stat-val">${te.vue}</span></div>
    <div><span>${RACES[t.race].comp.name}</span><span class="stat-val">${t.comp.pct} %</span></div>
    <div><span>${RACES[t.race].sort.name}</span><span class="stat-val">${t.sort.pct} %</span></div>
    ${t.race === "Kastar" ? `<div><span>Fatigue</span><span class="stat-val">${t.fatigue}</span></div>` : ""}
    ${t.camo ? '<div><span>🌫️ Camouflé</span><span class="stat-val">oui</span></div>' : ""}
    <div><span>PI</span><span class="stat-val">${t.pi}</span></div>
    <div><span>Mountyzédons</span><span class="stat-val">${t.gold}</span></div>
    <div><span>Monstres tués</span><span class="stat-val">${t.kills}</span></div>`;

  const fxCount = countActiveEffects(t);
  const badge = $("fx-badge");
  if (badge) {
    if (fxCount > 0) {
      badge.textContent = fxCount;
      badge.classList.remove("hidden");
    } else {
      badge.classList.add("hidden");
    }
  }
  const fxPanel = $("effects-panel");
  if (fxPanel) fxPanel.innerHTML = renderEffectsPanel(t);

  const improve = $("improve");
  improve.innerHTML = "";
  const labels = { att: "Attaque +1D6", esq: "Esquive +1D6", deg: "Dégâts +1D3", reg: "Régén. +1D3", pv: "PV max +10", vue: "Vue +1", armor: "Armure phy. +1D3" };
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

  const equipEl = $("equipment");
  equipEl.innerHTML = Object.entries(GEAR_SLOTS).map(([slot, info]) => {
    const it = t.equip[slot];
    if (!it) return `<div class="eq-line"><span class="eq-slot">${info.label}</span> —</div>`;
    const fx = formatGearMods(it.mods);
    return `<div class="eq-line"><span class="eq-slot">${info.label}</span> ${it.emoji} ${esc(it.name)}` +
      `${it.twoHanded ? " <small>(2 mains)</small>" : ""}` +
      ` <button class="unequip-btn" data-slot="${slot}" title="Déséquiper (${COSTS.unequip} PA) : revient dans le sac">↩️</button>` +
      `${fx ? `<div class="eq-mods">${fx}</div>` : ""}</div>`;
  }).join("");
  for (const b of equipEl.querySelectorAll(".unequip-btn")) {
    b.disabled = G.over || t.pa < COSTS.unequip;
    b.onclick = () => unequipSlot(b.dataset.slot);
  }

  renderBag($("inventory"), t.bag, {
    disabled: G.over,
    pa: t.pa,
    onUse: useBagItem, onEat: eatBagItem, onDrop: dropBagItem,
  });
}

/* Rendu partagé du sac (solo et multi) : groupé par type, effets visibles,
 * actions utiliser / goinfrer / jeter. */
function renderBag(inv, bag, opts) {
  inv.innerHTML = "";
  if (!bag.length) { inv.innerHTML = '<div class="empty">— vide —</div>'; return; }
  for (const grp of bagGroups(bag)) {
    const head = document.createElement("div");
    head.className = "bag-group";
    head.textContent = grp.label;
    inv.appendChild(head);
    for (const { item, idx } of grp.entries) {
      const row = document.createElement("div");
      row.className = "bag-item";
      const fx = itemEffectLines(item).join(" · ");
      const useLabel = item.kind === "potion" ? `🥤 boire (${COSTS.potion} PA)`
        : item.kind === "scroll" ? `👁️ lire (${COSTS.scroll} PA)` : `🛡️ équiper (${COSTS.equip} PA)`;
      row.innerHTML = `<div class="bag-name">${item.emoji} ${esc(item.name)}</div>` +
        (fx ? `<div class="eq-mods">${esc(fx)}</div>` : "") +
        `<div class="bag-actions"></div>`;
      const actions = row.querySelector(".bag-actions");
      const addBtn = (label, title, fn, enabled) => {
        const b = document.createElement("button");
        b.textContent = label;
        b.title = title;
        b.disabled = opts.disabled || !enabled;
        b.onclick = fn;
        actions.appendChild(b);
      };
      addBtn(useLabel, "", () => opts.onUse(idx), opts.pa >= (item.kind === "gear" ? COSTS.equip : 1));
      if (item.kind === "gear") {
        addBtn(`🍴 goinfrer (${COSTS.eat} PA)`, "Dévorer l'objet (détruit) : petit bonus aléatoire MIAM / CLONK / GRRROUAR",
          () => opts.onEat(idx), opts.pa >= COSTS.eat);
      }
      addBtn(`🗑️ jeter (${COSTS.drop} PA)`, "Jeter l'objet à terre sur ta case",
        () => opts.onDrop(idx), opts.pa >= COSTS.drop);
      inv.appendChild(row);
    }
  }
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
let activeLeftTab = "stats";

// `prefix` = "" pour le solo, "mp-" pour le monde partagé : les deux modes
// partagent strictement le même panneau à onglets (Caractéristiques / Effets).
function switchLeftTab(tab, prefix = "") {
  activeLeftTab = tab;
  const statsBtn = $(prefix + "tab-stats"), fxBtn = $(prefix + "tab-effects");
  const statsPanel = $(prefix + "panel-tab-stats"), fxPanel = $(prefix + "panel-tab-effects");
  if (!statsBtn || !fxBtn) return;
  const isStats = tab === "stats";
  statsBtn.classList.toggle("active", isStats);
  fxBtn.classList.toggle("active", !isStats);
  statsBtn.setAttribute("aria-selected", isStats);
  fxBtn.setAttribute("aria-selected", !isStats);
  statsPanel.classList.toggle("hidden", !isStats);
  fxPanel.classList.toggle("hidden", isStats);
}

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
  $("combat-detail").innerHTML = '<div class="cd-header">⚔️ Détail du combat</div><div class="cd-empty">— Aucun combat pour l\'instant —</div>';
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
    const footer = $("app-footer");
    if (footer) footer.textContent = `MountyCrawl v${APP_VERSION}`;
    initCreateScreen();
    bindKeys();
    $("tab-stats")?.addEventListener("click", () => switchLeftTab("stats"));
    $("tab-effects")?.addEventListener("click", () => switchLeftTab("effects"));
    $("btn-start").onclick = () => startGame();
    // ?autostart=1&race=Durakuir&name=Grosbill : lance directement une partie
    const params = new URLSearchParams(location.search);
    if (params.get("autostart")) {
      if (RACES[params.get("race")]) selectedRace = params.get("race");
      if (params.get("name")) $("troll-name").value = params.get("name");
      startGame();
      // ?demo=combat : matérialise un gobelin adjacent et enchaîne attaque + sortilège
      // (sert aux captures d'écran et au test visuel du détail du combat)
      if (params.get("demo") === "combat") {
        const t = G.troll;
        const spot = [[1, 0], [-1, 0], [0, 1], [0, -1]]
          .map(([dx, dy]) => ({ x: t.x + dx, y: t.y + dy }))
          .find(p => G.grid[p.y] && G.grid[p.y][p.x] === T_FLOOR);
        if (spot) {
          const m = makeMonster(1, spot.x, spot.y);
          G.monsters.push(m);
          render();
          attackMonster(m);
          if (G.monsters.includes(m)) useSort();
        }
      }
      // ?demo=sac : remplit le sac et équipe deux pièces (captures du sac trié)
      if (params.get("demo") === "sac") {
        const t = G.troll;
        equipGear(t, gearItemByName("arme", "Gourdin"));
        equipGear(t, gearItemByName("armure", "Armure de cuir"));
        t.bag.push(
          makePotionItem("guerison", 3), makePotionItem("feu", 5),
          formatScrollItem("runeExplosive", 2),
          gearItemByName("arme", "Épée Courte"), gearItemByName("casque", "Casque à Cornes"),
          gearItemByName("bottes", GEAR.bottes[0].name),
        );
        render();
        renderPanels();
      }
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

/* Export pour les tests node et le moteur multijoueur (mp.js) */
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    APP_VERSION, rollDice, resolveAttack, resolveSpell, masteryRoll, improveCost, levelFromTotalPI, killPX,
    RACES, MONSTER_TYPES, BOSS, TEMPLATES, applyTemplate, makeMonster, monsterFromSpec, itemFromSpec, equipGear, unequipToBag,
    generateCavern, largestRegion,
    MAP_W, MAP_H, T_WALL, T_FLOOR, T_STAIRS,
    COSTS, PA_PER_TURN, START_COMP_PCT, START_SORT_PCT,
    newGame, refreshFov, inSightAt,
    get state() { return G; },
  };
}
