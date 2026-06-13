/* Potions MountyHall — effets et durée en tours (1 tour = 1 DLA passée).
 * Source : https://mountypedia.mountyhall.com/Mountyhall/Potion */

"use strict";

const POTION_IDS = [
  "biskot", "doverPowa", "bonneBouffe", "corruption", "fertilite", "feu", "longueVue",
  "kouleMann", "djhinTonik", "glacier", "calvok", "rhume", "grippe", "pneumonie",
  "cervelle", "chronometre", "metomol", "guerison", "painture", "pufPuff", "sangToh",
  "sinneKhole", "toxine", "voiputrin", "zetCrak",
];

function potRand(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function potPick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function corruptionYZ(x) {
  if (x <= 3) return { y: 0, z: 0 };
  if (x <= 5) return { y: potRand(5, 10), z: potRand(5, 10) };
  if (x === 6) return { y: potRand(11, 20), z: potRand(11, 20) };
  return { y: potRand(16, 30), z: potRand(16, 30) };
}

/* Modificateur de potion : un seul jet de X D3 par fiole, le même total
 * s'applique à toutes les caracs concernées (ATT, ESQ…). */
function sharedMod(total, count, faces, negative = false) {
  const value = negative ? -total : total;
  const sign = negative ? "−" : "+";
  return {
    value,
    line: `${sign}${count}D${faces} → ${value >= 0 ? "+" : ""}${value}`,
  };
}

/* Fabrique un effet actif (durée en tours restants). */
function makeEffect(name, emoji, turnsLeft, mods = {}, modLines = []) {
  return { name, emoji, turnsLeft, modLines, ...mods };
}

const POTION_DEFS = {
  biskot: {
    name: "Biskot", emoji: "🍪", color: "#c4a574",
    duration: 2,
    rollPower: () => 0,
    build(troll, _p, rollDice) {
      const heal = rollDice(2, 3).total;
      troll.pv = Math.min(troll.pvMax, troll.pv + heal);
      return {
        log: `Biskot : +2 REG et +${heal} PV (${heal} = 2D3) pendant 2 tours.`,
        effects: [makeEffect("Biskot", "🍪", 2, { regFlat: 2, biskot: true })],
      };
    },
  },
  doverPowa: {
    name: "Dover Powa", emoji: "⚡", color: "#6eb5ff",
    duration: 2,
    rollPower: () => potRand(11, 100),
    build(troll, p) {
      const yy = potRand(11, 100);
      return {
        log: `Dover Powa : MM +${yy} %, RM −${p} % pendant 2 tours.`,
        effects: [makeEffect("Dover Powa", "⚡", 2, { mmPct: yy, rmPct: -p })],
      };
    },
  },
  bonneBouffe: {
    name: "Elixir de Bonne Bouffe", emoji: "🍖", color: "#d47848",
    duration: 5,
    rollPower: () => potRand(3, 7),
    build(_t, p) {
      const lines = [`DEG +${p}`, `REG +${p}`];
      return {
        log: `Elixir de Bonne Bouffe : ${lines.join(", ")} pendant 5 tours.`,
        effects: [makeEffect("Elixir de Bonne Bouffe", "🍖", 5, { degFlat: p, regFlat: p }, lines)],
      };
    },
  },
  corruption: {
    name: "Elixir de Corruption", emoji: "☠️", color: "#4a2858",
    duration: 5,
    rollPower: () => potRand(3, 7),
    build(_t, p, rollDice) {
      const { y, z } = corruptionYZ(p);
      const jet = rollDice(p, 3).total;
      const attR = sharedMod(jet, p, 3, false);
      const esqR = sharedMod(jet, p, 3, true);
      const lines = [`ATT ${attR.line}`, `ESQ ${esqR.line}`, `DEG +${p}`, `REG −${p}`, `VUE −${p}`, `Armure +${p}`];
      return {
        log: `Elixir de Corruption : ${lines.join(", ")} ; RM −${y} %, MM −${z} % (5 tours).`,
        effects: [makeEffect("Elixir de Corruption", "☠️", 5, {
          attFlat: attR.value, esqFlat: esqR.value, degFlat: p, regFlat: -p, vue: -p, armor: p, rmPct: -y, mmPct: -z,
        }, lines)],
      };
    },
  },
  fertilite: {
    name: "Elixir de Fertilité", emoji: "🌱", color: "#5d9a48",
    duration: 5,
    rollPower: () => potRand(3, 7),
    build(_t, p, rollDice) {
      const attR = sharedMod(rollDice(p, 3).total, p, 3, false);
      const lines = [`ATT ${attR.line}`, `DEG +${p}`];
      return {
        log: `Elixir de Fertilité : ${lines.join(", ")} pendant 5 tours.`,
        effects: [makeEffect("Elixir de Fertilité", "🌱", 5, { attFlat: attR.value, degFlat: p }, lines)],
      };
    },
  },
  feu: {
    name: "Elixir de Feu", emoji: "🔥", color: "#e85830",
    duration: 5,
    rollPower: () => potRand(3, 7),
    build(_t, p, rollDice) {
      const esqR = sharedMod(rollDice(p, 3).total, p, 3, false);
      const lines = [`ESQ ${esqR.line}`, `VUE +${p}`];
      return {
        log: `Elixir de Feu : ${lines.join(", ")} pendant 5 tours.`,
        effects: [makeEffect("Elixir de Feu", "🔥", 5, { esqFlat: esqR.value, vue: p }, lines)],
      };
    },
  },
  longueVue: {
    name: "Elixir de Longue-Vue", emoji: "🔭", color: "#88a8c8",
    duration: 3,
    rollPower: () => potPick([1, 2, 3, 5, 8]),
    build(_t, p) {
      return {
        log: `Elixir de Longue-Vue : VUE +${p} pendant 3 tours.`,
        effects: [makeEffect("Elixir de Longue-Vue", "🔭", 3, { vue: p })],
      };
    },
  },
  kouleMann: {
    name: "Essence de KouleMann", emoji: "🎵", color: "#9a78c8",
    duration: 4,
    rollPower: () => potRand(1, 5),
    build(troll, p, rollDice) {
      const dice = Math.max(1, Math.floor(p / 2));
      const heal = rollDice(dice, 3).total;
      troll.pv = Math.min(troll.pvMax, troll.pv + heal);
      return {
        log: `Essence de KouleMann : REG +${p}, VUE +${p}, +${heal} PV (${dice}D3) pendant 4 tours.`,
        effects: [makeEffect("Essence de KouleMann", "🎵", 4, { regFlat: p, vue: p })],
      };
    },
  },
  djhinTonik: {
    name: "Extrait de DjhinTonik", emoji: "🧞", color: "#48a8a8",
    duration: 4,
    rollPower: () => potRand(1, 5),
    build(troll, p, rollDice) {
      const heal = rollDice(2, 3).total;
      troll.pv = Math.min(troll.pvMax, troll.pv + heal);
      const lines = [`DEG +${p}`, `REG +${p}`, `PV +${heal} (2D3)`];
      return {
        log: `Extrait de DjhinTonik : ${lines.join(", ")} pendant 4 tours.`,
        effects: [makeEffect("Extrait de DjhinTonik", "🧞", 4, { degFlat: p, regFlat: p }, lines)],
      };
    },
  },
  glacier: {
    name: "Extrait du Glacier", emoji: "🧊", color: "#a8d8f0",
    duration: 5,
    rollPower: () => potRand(3, 7),
    build(_t, p) {
      return {
        log: `Extrait du Glacier : REG +${p}, Armure +${p} pendant 5 tours.`,
        effects: [makeEffect("Extrait du Glacier", "🧊", 5, { regFlat: p, armor: p })],
      };
    },
  },
  calvok: {
    name: "Fiole de Calvok", emoji: "🥃", color: "#d8c090",
    duration: 1,
    rollPower: () => potRand(2, 6),
    build(_t, p) {
      const malus = p * 5;
      return {
        log: `Fiole de Calvok : Concentration −${malus} % pendant 1 tour.`,
        effects: [makeEffect("Fiole de Calvok", "🥃", 1, { concentrationPct: -malus })],
      };
    },
  },
  rhume: {
    name: "Rhume en Conserve", emoji: "🤧", color: "#c8d8a8",
    duration: 3,
    rollPower: () => potRand(1, 2),
    build(_t, p, rollDice) {
      const jet = rollDice(p, 3).total;
      const attR = sharedMod(jet, p, 3, true);
      const esqR = sharedMod(jet, p, 3, true);
      const lines = [`ATT ${attR.line}`, `ESQ ${esqR.line}`, `DEG −${p}`, `REG −${p}`];
      return {
        log: `Rhume en Conserve : ${lines.join(", ")} pendant 3 tours.`,
        effects: [makeEffect("Rhume en Conserve", "🤧", 3, {
          attFlat: attR.value, esqFlat: esqR.value, degFlat: -p, regFlat: -p,
        }, lines)],
      };
    },
  },
  grippe: {
    name: "Grippe en Conserve", emoji: "🤒", color: "#d8a848",
    duration: 3,
    rollPower: () => potRand(3, 4),
    build(_t, p, rollDice) {
      const jet = rollDice(p, 3).total;
      const attR = sharedMod(jet, p, 3, true);
      const esqR = sharedMod(jet, p, 3, true);
      const lines = [`ATT ${attR.line}`, `ESQ ${esqR.line}`, `DEG −${p}`, `REG −${p}`];
      return {
        log: `Grippe en Conserve : ${lines.join(", ")} pendant 3 tours.`,
        effects: [makeEffect("Grippe en Conserve", "🤒", 3, {
          attFlat: attR.value, esqFlat: esqR.value, degFlat: -p, regFlat: -p,
        }, lines)],
      };
    },
  },
  pneumonie: {
    name: "Pneumonie en Conserve", emoji: "😷", color: "#a87878",
    duration: 3,
    rollPower: () => 5,
    build(_t, _p, rollDice) {
      const jet = rollDice(5, 3).total;
      const attR = sharedMod(jet, 5, 3, true);
      const esqR = sharedMod(jet, 5, 3, true);
      const lines = [`ATT ${attR.line}`, `ESQ ${esqR.line}`, "DEG −5", "REG −5"];
      return {
        log: `Pneumonie en Conserve : ${lines.join(", ")} pendant 3 tours.`,
        effects: [makeEffect("Pneumonie en Conserve", "😷", 3, {
          attFlat: attR.value, esqFlat: esqR.value, degFlat: -5, regFlat: -5,
        }, lines)],
      };
    },
  },
  cervelle: {
    name: "Jus de Cervelle", emoji: "🧠", color: "#e8a8c8",
    duration: 1,
    rollPower: () => potRand(2, 6),
    build(_t, p) {
      const bonus = p * 5;
      return {
        log: `Jus de Cervelle : Concentration +${bonus} % pendant 1 tour.`,
        effects: [makeEffect("Jus de Cervelle", "🧠", 1, { concentrationPct: bonus })],
      };
    },
  },
  chronometre: {
    name: "Jus de Chronomètre", emoji: "⏱️", color: "#c8c848",
    duration: 3,
    rollPower: () => potRand(1, 5),
    build(_t, p) {
      return {
        log: `Jus de Chronomètre : DLA accélérée (+${p} PA en début de tour) pendant 3 tours.`,
        effects: [makeEffect("Jus de Chronomètre", "⏱️", 3, { dlaBonusPA: p })],
      };
    },
  },
  metomol: {
    name: "Métomol", emoji: "💊", color: "#a8a8d8",
    duration: 2,
    rollPower: () => potRand(1, 5),
    build(_t, p) {
      return {
        log: `Métomol : DLA accélérée (+${p} PA) et Armure −${2 * p} pendant 2 tours.`,
        effects: [makeEffect("Métomol", "💊", 2, { dlaBonusPA: p, armor: -2 * p })],
      };
    },
  },
  guerison: {
    name: "Potion de Guérison", emoji: "🧪", color: "#5d8535",
    duration: 0,
    rollPower: () => potRand(1, 5),
    build(troll, p, rollDice) {
      const heal = rollDice(2 * p, 3).total;
      troll.pv = Math.min(troll.pvMax, troll.pv + heal);
      return { log: `Potion de Guérison : +${heal} PV (${2 * p}D3).`, effects: [] };
    },
  },
  painture: {
    name: "Potion de Pàïntûré", emoji: "🎨", color: "#e878a8",
    duration: 0,
    rollPower: () => potRand(1, 5),
    build(troll, p) {
      troll.camo = false;
      troll.blockCamoTurns = Math.max(troll.blockCamoTurns || 0, p);
      return {
        log: `Potion de Pàïntûré : visible et impossible de se camoufler pendant ${p} tour(s).`,
        effects: [makeEffect("Potion de Pàïntûré", "🎨", p, { blockCamo: true })],
      };
    },
  },
  pufPuff: {
    name: "PufPuff", emoji: "💨", color: "#b8b8b8",
    duration: 3,
    rollPower: () => potRand(0, 2),
    build(troll, p, rollDice) {
      const jet = p > 0 ? rollDice(p, 3).total : 0;
      const attR = p > 0 ? sharedMod(jet, p, 3, true) : { value: 0, line: "±0" };
      const esqR = p > 0 ? sharedMod(jet, p, 3, true) : { value: 0, line: "±0" };
      const y = p >= 2 ? rollDice(2, 3).total : 0;
      if (y > 0) troll.pv = Math.max(1, troll.pv - y);
      const lines = [`ATT ${attR.line}`, `ESQ ${esqR.line}`, `VUE −${p + 1}`];
      if (y) lines.push(`PV −${y} (${y} = 2D3)`);
      return {
        log: `PufPuff : ${lines.join(", ")} pendant 3 tours.`,
        effects: [makeEffect("PufPuff", "💨", 3, {
          attFlat: attR.value, esqFlat: esqR.value, vue: -(p + 1),
        }, lines)],
      };
    },
  },
  sangToh: {
    name: "Sang de Toh Réroh", emoji: "🩸", color: "#a83030",
    duration: 4,
    rollPower: () => potRand(1, 5),
    build(_t, p, rollDice) {
      const jet = rollDice(p, 3).total;
      const attR = sharedMod(jet, p, 3, false);
      const esqR = sharedMod(jet, p, 3, false);
      const lines = [`ATT ${attR.line}`, `ESQ ${esqR.line}`, `VUE +${p}`];
      return {
        log: `Sang de Toh Réroh : ${lines.join(", ")} pendant 4 tours.`,
        effects: [makeEffect("Sang de Toh Réroh", "🩸", 4, {
          attFlat: attR.value, esqFlat: esqR.value, vue: p,
        }, lines)],
      };
    },
  },
  sinneKhole: {
    name: "Sinne Khole", emoji: "🕳️", color: "#383838",
    duration: 2,
    rollPower: () => potRand(11, 100),
    build(_t, p) {
      const yy = potRand(11, 100);
      return {
        log: `Sinne Khole : RM +${p} %, MM −${yy} % pendant 2 tours.`,
        effects: [makeEffect("Sinne Khole", "🕳️", 2, { rmPct: p, mmPct: -yy })],
      };
    },
  },
  toxine: {
    name: "Toxine Violente", emoji: "☣️", color: "#78c848",
    duration: 0,
    rollPower: () => potRand(1, 5),
    build(troll, p, rollDice) {
      const dmg = rollDice(2 * p, 3).total;
      troll.pv = Math.max(1, troll.pv - dmg);
      return { log: `Toxine Violente : −${dmg} PV (${2 * p}D3).`, effects: [] };
    },
  },
  voiputrin: {
    name: "Voï'Pu'Rin", emoji: "🌫️", color: "#686868",
    duration: 2,
    rollPower: () => potRand(1, 5),
    build(_t, p) {
      const malus = 10 * p;
      return {
        log: `Voï'Pu'Rin : VUE −${malus} pendant 2 tours.`,
        effects: [makeEffect("Voï'Pu'Rin", "🌫️", 2, { vue: -malus })],
      };
    },
  },
  zetCrak: {
    name: "Zet Crakdedand", emoji: "🦷", color: "#d8d0a0",
    duration: 3,
    rollPower: () => potRand(1, 5),
    build(troll, p, rollDice) {
      const jet = rollDice(p, 3).total;
      const attR = sharedMod(jet, p, 3, true);
      const esqR = sharedMod(jet, p, 3, true);
      const heal = rollDice(p, 3).total;
      troll.pv = Math.min(troll.pvMax, troll.pv + heal);
      const lines = [`ATT ${attR.line}`, `ESQ ${esqR.line}`, `VUE −${p}`, `PV +${heal} (${p}D3)`];
      return {
        log: `Zet Crakdedand : ${lines.join(", ")} pendant 3 tours.`,
        effects: [makeEffect("Zet Crakdedand", "🦷", 3, {
          attFlat: attR.value, esqFlat: esqR.value, vue: -p,
        }, lines)],
      };
    },
  },
};

function sumPotionMods(effects) {
  const m = {
    att: 0, esq: 0, deg: 0, reg: 0, vue: 0, armor: 0,
    attFlat: 0, esqFlat: 0, degFlat: 0, regFlat: 0,
    mmPct: 0, rmPct: 0, concentrationPct: 0, dlaBonusPA: 0,
  };
  for (const e of effects || []) {
    if (e.blockCamo) continue;
    for (const k of Object.keys(m)) {
      if (typeof e[k] === "number") m[k] += e[k];
    }
  }
  return m;
}

/* Affichage caractéristique : valeur effective + rappel de la base si modifiée.
 * `split` ({ phys, mag }) détaille l'origine du bonus fixe : P = physique
 * (équipement), M = magique (potions, parchemins). */
function fmtStatLine(base, eff, faces, flat = 0, extra = 0, split = null) {
  const diceDelta = eff - base;
  const jetBonus = (flat || 0) + (extra || 0);
  let main = `${eff}D${faces}`;
  if (jetBonus) main += jetBonus > 0 ? ` +${jetBonus}` : ` ${jetBonus}`;
  const hints = [];
  if (split && (split.phys || split.mag)) {
    const f = v => `${(v || 0) > 0 ? "+" : ""}${v || 0}`;
    hints.push(`phy ${f(split.phys)} · mag ${f(split.mag)}`);
  }
  if (diceDelta !== 0) {
    const sign = diceDelta > 0 ? "+" : "";
    hints.push(`${base}D${faces} ${sign}${diceDelta}`);
  }
  if (hints.length) return `${main} <small class="stat-hint">(${hints.join(" · ")})</small>`;
  return main;
}

/* Caractéristiques effectives : base + effets magiques (potions, parchemins)
 * + équipement (troll.gearMods, recalculé par game.js à chaque équipement).
 * Les bonus ATT/ESQ/DEG/REG de l'équipement sont des bonus FIXES sur les jets,
 * jamais des dés supplémentaires.
 * Comme l'armure, ATT et DEG existent en deux saveurs : xxxFlatPhys s'applique
 * aux attaques PHYSIQUES, xxxFlatMag aux attaques MAGIQUES (sortilèges). Les
 * potions/parchemins modifient le troll lui-même : leurs bonus comptent dans
 * les deux ; l'équipement compte selon la saveur de chaque bonus (att/deg/arm
 * physiques, attMag/degMag/armMag magiques). Armure :
 * armorPhys = base + naturelle + équipement phys, armorMag = effets magiques
 * + équipement mag. Les dégâts physiques sont réduits par l'armure totale,
 * les dégâts magiques par la seule armure magique. */
function effTroll(troll) {
  const m = sumPotionMods(troll.potionEffects); // magique (modifie le troll)
  const g = troll.gearMods || {};               // équipement (phys + mag)
  return {
    att: Math.max(1, troll.att + m.att),
    attFlat: m.attFlat + (g.att || 0),
    attFlatPhys: m.attFlat + (g.att || 0), attFlatMag: m.attFlat + (g.attMag || 0),
    esq: Math.max(1, troll.esq + m.esq),
    esqFlat: m.esqFlat + (g.esq || 0), esqFlatPhys: g.esq || 0, esqFlatMag: m.esqFlat,
    deg: Math.max(1, troll.deg + m.deg),
    degFlat: m.degFlat + (g.deg || 0),
    degFlatPhys: m.degFlat + (g.deg || 0), degFlatMag: m.degFlat + (g.degMag || 0),
    reg: Math.max(1, troll.reg + m.reg),
    regFlat: m.regFlat + (g.reg || 0), regFlatPhys: g.reg || 0, regFlatMag: m.regFlat,
    vue: Math.max(1, troll.vue + m.vue + (g.vue || 0)),
    armor: Math.max(0, troll.armor + m.armor + (g.arm || 0) + (g.armMag || 0)),
    armorPhys: Math.max(0, troll.armor + (g.arm || 0)),
    armorMag: m.armor + (g.armMag || 0),
    armorDice: troll.armorDice,
    degBonus: troll.degBonus || 0,
    pvMax: troll.pvMax,
    mmPct: m.mmPct + (g.mmPct || 0),
    rmPct: m.rmPct + (g.rmPct || 0),
    concentrationPct: m.concentrationPct,
    dlaBonusPA: m.dlaBonusPA,
  };
}

function formatPotionItem(potionId, power) {
  const def = POTION_DEFS[potionId];
  if (!def) return null;
  const suffix = def.duration === 0 && (potionId === "guerison" || potionId === "toxine")
    ? ` (${2 * power}D3)` : ` (niv. ${power})`;
  return {
    kind: "potion",
    potionId,
    power,
    name: def.name + suffix,
    emoji: def.emoji,
    color: def.color,
  };
}

function makeRandomPotion() {
  const id = POTION_IDS[Math.floor(Math.random() * POTION_IDS.length)];
  const def = POTION_DEFS[id];
  return formatPotionItem(id, def.rollPower());
}

function makePotionItem(potionId, power) {
  const def = POTION_DEFS[potionId];
  if (!def) return makeRandomPotion();
  return formatPotionItem(potionId, power != null ? power : def.rollPower());
}

/* « Goinfrer » : le troll dévore une pièce d'équipement (détruite) et en tire
 * un petit bénéfice aléatoire, X = 1 à 3 :
 *   « MIAM »     +X D3 PV immédiats
 *   « CLONK »    +X en armure pendant X tours
 *   « GRRROUAR » +X en dégâts pendant X tours */
function goinfreItem(troll, rollDice) {
  const x = 1 + Math.floor(Math.random() * 3);
  const r = Math.random();
  troll.potionEffects = troll.potionEffects || [];
  if (r < 1 / 3) {
    const heal = rollDice(x, 3).total;
    troll.pv = Math.min(troll.pvMax, troll.pv + heal);
    return {
      cry: "MIAM", effect: `+${x}D3 points de vie (+${heal} PV)`,
      flavor: "Excellent ce petit en-cas. Foi de Troll, il y avait longtemps que je n'avais aussi bien mangé.",
    };
  }
  if (r < 2 / 3) {
    troll.potionEffects.push(makeEffect("Goinfre « CLONK »", "🦷", x, { armor: x }, [`Armure +${x}`]));
    return {
      cry: "CLONK", effect: `+${x} en armure pendant ${x} tour(s)`,
      flavor: "Un peu dur mais cela renforce les dents. Ce qui ne nous tue pas nous rend plus fort.",
    };
  }
  troll.potionEffects.push(makeEffect("Goinfre « GRRROUAR »", "🍴", x, { degFlat: x }, [`DEG +${x}`]));
  return {
    cry: "GRRROUAR", effect: `+${x} en dégâts pendant ${x} tour(s)`,
    flavor: "Il faut que je mange encore quelque chose, ce petit en-cas m'a mis en appétit.",
  };
}

function drinkPotion(troll, item, rollDice, logFn) {
  const def = POTION_DEFS[item.potionId];
  if (!def) {
    logFn("Cette fiole est vide ou inconnue.", "info");
    return false;
  }
  const p = item.power != null ? item.power : def.rollPower();
  const result = def.build(troll, p, rollDice);
  if (result.effects.length) {
    troll.potionEffects = troll.potionEffects || [];
    troll.potionEffects.push(...result.effects);
  }
  logFn(result.log, result.effects.length ? "good" : "good");
  return true;
}

/* Fin de tour (DLA passée) : décrémente les effets, retire les expirés. */
function tickPotionTurns(troll, logFn) {
  troll.tour = (troll.tour || 1) + 1;
  if (troll.blockCamoTurns > 0) troll.blockCamoTurns--;
  const expired = [];
  troll.potionEffects = (troll.potionEffects || []).filter(e => {
    if (e.blockCamo) return troll.blockCamoTurns > 0;
    e.turnsLeft -= 1;
    if (e.turnsLeft <= 0) {
      expired.push(e.name);
      return false;
    }
    return true;
  });
  for (const name of expired) {
    logFn(`L'effet de ${name} s'est dissipé.`, "info");
  }
  return sumPotionMods(troll.potionEffects).dlaBonusPA;
}

/* Les effets de potions/parchemins sont MAGIQUES : leur armure est de
 * l'armure magique (seule à réduire les dégâts magiques). */
const EFFECT_MOD_LABELS = {
  att: "ATT", esq: "ESQ", deg: "DEG", reg: "REG", vue: "VUE", armor: "Armure mag.",
};

function formatEffectMods(effect) {
  if (effect.modLines?.length) return [...effect.modLines];
  const parts = [];
  if (effect.attFlat) parts.push(`ATT ${effect.attFlat > 0 ? "+" : ""}${effect.attFlat}`);
  if (effect.esqFlat) parts.push(`ESQ ${effect.esqFlat > 0 ? "+" : ""}${effect.esqFlat}`);
  if (effect.degFlat) parts.push(`DEG ${effect.degFlat > 0 ? "+" : ""}${effect.degFlat}`);
  if (effect.regFlat) parts.push(`REG ${effect.regFlat > 0 ? "+" : ""}${effect.regFlat}`);
  for (const [key, label] of Object.entries(EFFECT_MOD_LABELS)) {
    const v = effect[key];
    if (typeof v !== "number" || !v) continue;
    parts.push(`${label} ${v > 0 ? "+" : ""}${v}${["att", "esq", "deg", "reg"].includes(key) ? " dés" : ""}`);
  }
  if (effect.mmPct) parts.push(`MM ${effect.mmPct > 0 ? "+" : ""}${effect.mmPct} %`);
  if (effect.rmPct) parts.push(`RM ${effect.rmPct > 0 ? "+" : ""}${effect.rmPct} %`);
  if (effect.concentrationPct) parts.push(`Concentration ${effect.concentrationPct > 0 ? "+" : ""}${effect.concentrationPct} %`);
  if (effect.dlaBonusPA) parts.push(`DLA ${effect.dlaBonusPA > 0 ? "+" : ""}${effect.dlaBonusPA} PA/tour`);
  if (effect.blockCamo) parts.push("Visible — camouflage impossible");
  return parts;
}

function countActiveEffects(troll) {
  let n = (troll.potionEffects || []).length;
  if (troll.blockCamoTurns > 0 && !(troll.potionEffects || []).some(e => e.blockCamo)) n += 1;
  return n;
}

function describeActiveEffects(troll) {
  const lines = [];
  if (troll.blockCamoTurns > 0) {
    lines.push(`🎨 Pàïntûré (${troll.blockCamoTurns} tour(s))`);
  }
  for (const e of troll.potionEffects || []) {
    if (e.blockCamo) continue;
    lines.push(`${e.emoji} ${e.name} (${e.turnsLeft} tour(s))`);
  }
  return lines;
}

function renderEffectsPanel(troll) {
  const effects = [...(troll.potionEffects || [])];
  const cards = [];

  if (troll.blockCamoTurns > 0 && !effects.some(e => e.blockCamo)) {
    cards.push({
      emoji: "🎨", name: "Pàïntûré", turnsLeft: troll.blockCamoTurns,
      mods: ["Visible — camouflage impossible"],
      positive: false,
    });
  }

  for (const e of effects) {
    const mods = formatEffectMods(e);
    const positive = mods.some(m => m.includes("+") && !m.includes("−"));
    cards.push({
      emoji: e.emoji, name: e.name,
      turnsLeft: e.blockCamo ? troll.blockCamoTurns : e.turnsLeft,
      mods, positive: mods.length ? positive : null,
    });
  }

  if (!cards.length) {
    return '<p class="fx-empty">Aucun bonus ni malus magique actif.</p>';
  }

  const total = sumPotionMods(troll.potionEffects);
  const totalLines = [];
  if (total.attFlat) totalLines.push(`ATT ${total.attFlat > 0 ? "+" : ""}${total.attFlat}`);
  if (total.esqFlat) totalLines.push(`ESQ ${total.esqFlat > 0 ? "+" : ""}${total.esqFlat}`);
  if (total.degFlat) totalLines.push(`DEG ${total.degFlat > 0 ? "+" : ""}${total.degFlat}`);
  if (total.regFlat) totalLines.push(`REG ${total.regFlat > 0 ? "+" : ""}${total.regFlat}`);
  for (const [key, label] of Object.entries(EFFECT_MOD_LABELS)) {
    const v = total[key];
    if (typeof v !== "number" || !v) continue;
    totalLines.push(`${label} ${v > 0 ? "+" : ""}${v}${["att", "esq", "deg", "reg"].includes(key) ? " dés" : ""}`);
  }
  if (total.mmPct) totalLines.push(`MM ${total.mmPct > 0 ? "+" : ""}${total.mmPct} %`);
  if (total.rmPct) totalLines.push(`RM ${total.rmPct > 0 ? "+" : ""}${total.rmPct} %`);
  if (total.concentrationPct) totalLines.push(`Concentration ${total.concentrationPct > 0 ? "+" : ""}${total.concentrationPct} %`);
  if (total.dlaBonusPA) totalLines.push(`DLA ${total.dlaBonusPA > 0 ? "+" : ""}${total.dlaBonusPA} PA/tour`);
  if (troll.blockCamoTurns > 0) totalLines.push("Camouflage bloqué");

  let html = "";
  if (totalLines.length) {
    html += `<div class="fx-total"><div class="fx-total-title">Total des modificateurs</div>`;
    html += totalLines.map(m => `<span class="fx-mod">${m}</span>`).join("");
    html += "</div>";
  }

  for (const c of cards) {
    const cls = c.positive === true ? "fx-card-buff" : c.positive === false ? "fx-card-debuff" : "fx-card";
    html += `<div class="fx-card ${cls}">`;
    html += `<div class="fx-card-head"><span>${c.emoji} ${c.name}</span><span class="fx-turns">${c.turnsLeft} tour(s)</span></div>`;
    if (c.mods.length) {
      html += `<div class="fx-card-mods">${c.mods.map(m => `<span class="fx-mod">${m}</span>`).join("")}</div>`;
    }
    html += "</div>";
  }
  return html;
}

function talentPctWithPotions(troll, talent, cap) {
  const eff = effTroll(troll);
  return Math.max(0, Math.min(cap, talent.pct + eff.concentrationPct));
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    POTION_IDS, POTION_DEFS, sumPotionMods, effTroll, formatPotionItem,
    makeRandomPotion, makePotionItem, drinkPotion, goinfreItem, tickPotionTurns,
    describeActiveEffects, renderEffectsPanel, countActiveEffects, formatEffectMods,
    sharedMod, makeEffect, fmtStatLine, talentPctWithPotions, corruptionYZ,
  };
}
