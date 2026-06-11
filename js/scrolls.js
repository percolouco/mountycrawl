/* Parchemins MountyHall — trésors à lire, effets et durée en tours (1 tour = 1 DLA).
 * Source : https://mountypedia.mountyhall.com/Mountyhall/Parchemins
 * Convention temps → PA : −30 min de TOUR = +1 PA au début du tour (comme le
 * Jus de Chronomètre) ; −15 min = +1 PA par tranche de 2 niveaux (arrondi sup.).
 * Les effets de zone touchent le lecteur et tout monstre dans un rayon de
 * SCROLL_ZONE_RADIUS cases. */

"use strict";

/* potions.js est chargé avant ce fichier dans le navigateur ; en node, require explicite. */
if (typeof module !== "undefined" && module.exports && typeof sharedMod === "undefined") {
  Object.assign(globalThis, require("./potions.js"));
}

const SCROLL_ZONE_RADIUS = 3;

const SCROLL_IDS = [
  "runeCyclopes", "clairvoyance", "ideesConfuses", "runeExplosive",
  "planGenial", "yeuKiPic", "runeFoins",
];

function scrollRand(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

const SCROLL_DEFS = {
  runeCyclopes: {
    name: "Rune des Cyclopes", emoji: "👁️", color: "#c89048",
    duration: 4,
    build(_t, p, rollDice) {
      const attR = sharedMod(rollDice(p, 3).total, p, 3, false);
      const lines = [`ATT ${attR.line}`, `DEG +${p}`, `VUE −${p}`];
      return {
        log: `Rune des Cyclopes : ${lines.join(", ")} pendant 4 tours.`,
        effects: [makeEffect("Rune des Cyclopes", "👁️", 4, {
          attFlat: attR.value, degFlat: p, vue: -p,
        }, lines)],
      };
    },
  },
  clairvoyance: {
    name: "Traité de Clairvoyance", emoji: "🔮", color: "#88a8e0",
    duration: 4,
    build(_t, p) {
      const lines = [`VUE +${p}`, `DLA +${p} PA/tour`];
      return {
        log: `Traité de Clairvoyance : VUE +${p}, TOUR accéléré (+${p} PA) pendant 4 tours.`,
        effects: [makeEffect("Traité de Clairvoyance", "🔮", 4, {
          vue: p, dlaBonusPA: p,
        }, lines)],
      };
    },
  },
  ideesConfuses: {
    name: "Idées Confuses", emoji: "💫", color: "#b078b0",
    duration: 3,
    build(_t, p, rollDice) {
      const attR = sharedMod(rollDice(p, 3).total, p, 3, true);
      const lines = [`ATT ${attR.line}`, `DLA −${p} PA/tour`];
      return {
        log: `Idées Confuses : ATT ${attR.line}, TOUR ralenti (−${p} PA) pendant 3 tours.`,
        effects: [makeEffect("Idées Confuses", "💫", 3, {
          attFlat: attR.value, dlaBonusPA: -p,
        }, lines)],
      };
    },
  },
  runeExplosive: {
    name: "Rune Explosive", emoji: "💥", color: "#e06030",
    duration: 0, zone: true,
    build(troll, p, rollDice) {
      const dmg = rollDice(2 * p, 3).total;
      troll.pv = Math.max(1, troll.pv - dmg);
      return {
        log: `Rune Explosive : −${dmg} PV (${2 * p}D3), l'explosion ravage la zone !`,
        effects: [],
        zone: { type: "damage", total: dmg, label: `${2 * p}D3` },
      };
    },
  },
  planGenial: {
    name: "Plan Génial", emoji: "💡", color: "#e0c048",
    duration: 3,
    build(_t, p, rollDice) {
      const pa = Math.ceil(p / 2);
      const attR = sharedMod(rollDice(p, 3).total, p, 3, false);
      const lines = [`ATT ${attR.line}`, `DEG +${p}`, `DLA +${pa} PA/tour`];
      return {
        log: `Plan Génial : ${lines.join(", ")} pendant 3 tours.`,
        effects: [makeEffect("Plan Génial", "💡", 3, {
          attFlat: attR.value, degFlat: p, dlaBonusPA: pa,
        }, lines)],
      };
    },
  },
  yeuKiPic: {
    name: "Yeu'Ki'Pic", emoji: "🌶️", color: "#c04040",
    duration: 2, zone: true,
    build(_t, p) {
      const malus = 3 * p;
      return {
        log: `Yeu'Ki'Pic : un nuage piquant ! VUE −${malus} pour toute la zone pendant 2 tours.`,
        effects: [makeEffect("Yeu'Ki'Pic", "🌶️", 2, { vue: -malus })],
        zone: { type: "vue", malus, turns: 2 },
      };
    },
  },
  runeFoins: {
    name: "Rune des Foins", emoji: "🌾", color: "#a8a048",
    duration: 3,
    build(troll, p, rollDice) {
      // « PV : -2/4 D3 » (Mountypedia) : interprété comme 2D3 ou 4D3 au hasard
      const dice = Math.random() < 0.5 ? 2 : 4;
      const dmg = rollDice(dice, 3).total;
      troll.pv = Math.max(1, troll.pv - dmg);
      const lines = [`DEG −${p}`, "VUE −1"];
      return {
        log: `Rune des Foins : atchoum ! −${dmg} PV (${dice}D3), ${lines.join(", ")} pendant 3 tours.`,
        effects: [makeEffect("Rune des Foins", "🌾", 3, { degFlat: -p, vue: -1 }, lines)],
      };
    },
  },
};

function formatScrollItem(scrollId, power) {
  const def = SCROLL_DEFS[scrollId];
  if (!def) return null;
  return {
    kind: "scroll",
    scrollId,
    power,
    name: `${def.name} (niv. ${power})`,
    emoji: def.emoji,
    color: def.color,
  };
}

function makeRandomScroll() {
  const id = SCROLL_IDS[Math.floor(Math.random() * SCROLL_IDS.length)];
  return formatScrollItem(id, scrollRand(1, 5));
}

function makeScrollItem(scrollId, power) {
  if (!SCROLL_DEFS[scrollId]) return makeRandomScroll();
  return formatScrollItem(scrollId, power != null ? power : scrollRand(1, 5));
}

/* Lit un parchemin. Retourne null si inconnu, sinon { zone } — game.js applique
 * l'éventuel effet de zone aux monstres alentour. */
function readScroll(troll, item, rollDice, logFn) {
  const def = SCROLL_DEFS[item.scrollId];
  if (!def) {
    logFn("Ce parchemin est illisible.", "info");
    return null;
  }
  const p = item.power != null ? item.power : scrollRand(1, 5);
  const result = def.build(troll, p, rollDice);
  if (result.effects.length) {
    troll.potionEffects = troll.potionEffects || [];
    troll.potionEffects.push(...result.effects);
  }
  logFn(`📜 ${result.log}`, "good");
  return { zone: result.zone || null };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    SCROLL_IDS, SCROLL_DEFS, SCROLL_ZONE_RADIUS,
    formatScrollItem, makeRandomScroll, makeScrollItem, readScroll,
  };
}
