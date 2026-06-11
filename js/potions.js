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

/* Fabrique un effet actif (durée en tours restants). */
function makeEffect(name, emoji, turnsLeft, mods = {}) {
  return { name, emoji, turnsLeft, ...mods };
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
        effects: [makeEffect("Biskot", "🍪", 2, { reg: 2, biskot: true })],
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
      return {
        log: `Elixir de Bonne Bouffe : DEG +${p}, REG +${p} pendant 5 tours.`,
        effects: [makeEffect("Elixir de Bonne Bouffe", "🍖", 5, { deg: p, reg: p })],
      };
    },
  },
  corruption: {
    name: "Elixir de Corruption", emoji: "☠️", color: "#4a2858",
    duration: 5,
    rollPower: () => potRand(3, 7),
    build(_t, p) {
      const { y, z } = corruptionYZ(p);
      return {
        log: `Elixir de Corruption : malus multiples (X=${p}, RM −${y} %, MM −${z} %) pendant 5 tours.`,
        effects: [makeEffect("Elixir de Corruption", "☠️", 5, {
          att: p, esq: -p, deg: p, reg: -p, vue: -p, armor: p, rmPct: -y, mmPct: -z,
        })],
      };
    },
  },
  fertilite: {
    name: "Elixir de Fertilité", emoji: "🌱", color: "#5d9a48",
    duration: 5,
    rollPower: () => potRand(3, 7),
    build(_t, p) {
      return {
        log: `Elixir de Fertilité : ATT +${p}D6, DEG +${p} pendant 5 tours.`,
        effects: [makeEffect("Elixir de Fertilité", "🌱", 5, { att: p, deg: p })],
      };
    },
  },
  feu: {
    name: "Elixir de Feu", emoji: "🔥", color: "#e85830",
    duration: 5,
    rollPower: () => potRand(3, 7),
    build(_t, p) {
      return {
        log: `Elixir de Feu : ESQ +${p}D6, VUE +${p} pendant 5 tours.`,
        effects: [makeEffect("Elixir de Feu", "🔥", 5, { esq: p, vue: p })],
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
        effects: [makeEffect("Essence de KouleMann", "🎵", 4, { reg: p, vue: p })],
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
      return {
        log: `Extrait de DjhinTonik : DEG +${p}, REG +${p}, +${heal} PV (2D3) pendant 4 tours.`,
        effects: [makeEffect("Extrait de DjhinTonik", "🧞", 4, { deg: p, reg: p })],
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
        effects: [makeEffect("Extrait du Glacier", "🧊", 5, { reg: p, armor: p })],
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
    build(_t, p) {
      return {
        log: `Rhume en Conserve : ATT/ESQ/DEG/REG −${p} pendant 3 tours.`,
        effects: [makeEffect("Rhume en Conserve", "🤧", 3, { att: -p, esq: -p, deg: -p, reg: -p })],
      };
    },
  },
  grippe: {
    name: "Grippe en Conserve", emoji: "🤒", color: "#d8a848",
    duration: 3,
    rollPower: () => potRand(3, 4),
    build(_t, p) {
      return {
        log: `Grippe en Conserve : ATT/ESQ/DEG/REG −${p} pendant 3 tours.`,
        effects: [makeEffect("Grippe en Conserve", "🤒", 3, { att: -p, esq: -p, deg: -p, reg: -p })],
      };
    },
  },
  pneumonie: {
    name: "Pneumonie en Conserve", emoji: "😷", color: "#a87878",
    duration: 3,
    rollPower: () => 5,
    build(_t, _p) {
      return {
        log: "Pneumonie en Conserve : ATT/ESQ/DEG/REG −5 pendant 3 tours.",
        effects: [makeEffect("Pneumonie en Conserve", "😷", 3, { att: -5, esq: -5, deg: -5, reg: -5 })],
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
      const y = p >= 2 ? rollDice(2, 3).total : 0;
      if (y > 0) troll.pv = Math.max(1, troll.pv - y);
      return {
        log: `PufPuff : ATT/ESQ −${p}D6, VUE −${p + 1}${y ? `, −${y} PV` : ""} pendant 3 tours.`,
        effects: [makeEffect("PufPuff", "💨", 3, { att: -p, esq: -p, vue: -(p + 1) })],
      };
    },
  },
  sangToh: {
    name: "Sang de Toh Réroh", emoji: "🩸", color: "#a83030",
    duration: 4,
    rollPower: () => potRand(1, 5),
    build(_t, p) {
      return {
        log: `Sang de Toh Réroh : ATT +${p}D6, ESQ +${p}D6, VUE +${p} pendant 4 tours.`,
        effects: [makeEffect("Sang de Toh Réroh", "🩸", 4, { att: p, esq: p, vue: p })],
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
      const heal = rollDice(p, 3).total;
      troll.pv = Math.min(troll.pvMax, troll.pv + heal);
      return {
        log: `Zet Crakdedand : ATT/ESQ/VUE −${p}, +${heal} PV (${p}D3) pendant 3 tours.`,
        effects: [makeEffect("Zet Crakdedand", "🦷", 3, { att: -p, esq: -p, vue: -p })],
      };
    },
  },
};

function sumPotionMods(effects) {
  const m = {
    att: 0, esq: 0, deg: 0, reg: 0, vue: 0, armor: 0,
    mmPct: 0, rmPct: 0, concentrationPct: 0, dlaBonusPA: 0,
  };
  for (const e of effects || []) {
    for (const k of Object.keys(m)) {
      if (e[k]) m[k] += e[k];
    }
  }
  return m;
}

function effTroll(troll) {
  const m = sumPotionMods(troll.potionEffects);
  return {
    att: Math.max(1, troll.att + m.att),
    esq: Math.max(1, troll.esq + m.esq),
    deg: Math.max(1, troll.deg + m.deg),
    reg: Math.max(1, troll.reg + m.reg),
    vue: Math.max(1, troll.vue + m.vue),
    armor: Math.max(0, troll.armor + m.armor),
    armorDice: troll.armorDice,
    degBonus: troll.degBonus,
    pvMax: troll.pvMax,
    mmPct: m.mmPct,
    rmPct: m.rmPct,
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

function talentPctWithPotions(troll, talent, cap) {
  const eff = effTroll(troll);
  return Math.max(0, Math.min(cap, talent.pct + eff.concentrationPct));
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    POTION_IDS, POTION_DEFS, sumPotionMods, effTroll, formatPotionItem,
    makeRandomPotion, makePotionItem, drinkPotion, tickPotionTurns,
    describeActiveEffects, talentPctWithPotions, corruptionYZ,
  };
}
