/* Équipement MountyHall — 6 emplacements, objets dropables actuels de la Mountypedia :
 * https://mountypedia.mountyhall.com/Mountyhall/{Arme,Armure,Casque,Bouclier,Talisman,Bottes}
 * Valeurs de base (sans templates) : TOUS les bonus sont fixes — ATT/ESQ/DEG/REG
 * s'ajoutent aux jets (jamais en dés), ARM/VUE/PV sont fixes, RM/MM en %.
 * Les bonus/malus d'équipement sont PHYSIQUES (dont l'armure, sauf exceptions
 * à venir) — les bonus magiques viennent des potions et parchemins.
 * `tier` (1-5) borne la profondeur de drop.
 * Les armes à deux mains (twoHanded) sont incompatibles avec un bouclier. */

"use strict";

const GEAR_SLOTS = {
  arme:     { label: "Arme",     emoji: "🗡️" },
  armure:   { label: "Armure",   emoji: "🦺" },
  casque:   { label: "Casque",   emoji: "🪖" },
  bouclier: { label: "Bouclier", emoji: "🛡️" },
  talisman: { label: "Talisman", emoji: "📿" },
  bottes:   { label: "Bottes",   emoji: "🥾" },
};

const GEAR = {
  arme: [
    { name: "Torche",                 emoji: "🔥", tier: 1, mods: { vue: 1 } },
    { name: "Lame en os",             emoji: "🦴", tier: 1, mods: { mmPct: 5 } },
    { name: "Épée Courte",            emoji: "🗡️", tier: 1, mods: { deg: 2, esq: 2 } },
    { name: "Gantelet",               emoji: "🥊", tier: 1, mods: { att: -1, esq: 1, deg: 1, arm: 2 } },
    { name: "Lame en pierre",         emoji: "🪨", tier: 2, mods: { att: -1, deg: 4, reg: 2 } },
    { name: "Épée Longue",            emoji: "⚔️", tier: 2, mods: { att: -1, deg: 4, esq: 1 } },
    { name: "Gourdin",                emoji: "🏏", tier: 2, mods: { att: 2, esq: -2, deg: 5 } },
    { name: "Boulet et chaîne",       emoji: "⛓️", tier: 2, mods: { att: -1, deg: 5 } },
    { name: "Grosse racine",          emoji: "🌿", tier: 2, mods: { esq: -1, arm: 2, pv: 5, rmPct: 5 } },
    { name: "Coutelas d'obsidienne",  emoji: "🔪", tier: 3, mods: { att: 2, deg: 3, esq: 2, reg: -2, rmPct: -5, mmPct: -15 } },
    { name: "Fouet",                  emoji: "🪢", tier: 4, mods: { att: 7, deg: -1 } },
    { name: "Lame d'obsidienne",      emoji: "🖤", tier: 4, mods: { att: 3, deg: 7, reg: -3, rmPct: -30, mmPct: -10 } },
    { name: "Bâton de mage",          emoji: "🪄", tier: 3, twoHanded: true, mods: { mmPct: 15 } },
    { name: "Hallebarde",             emoji: "🪓", tier: 4, twoHanded: true, mods: { att: -5, deg: 12 } },
    { name: "Hache à deux mains d'Obsidienne", emoji: "⚒️", tier: 5, twoHanded: true, mods: { att: -8, deg: 16, reg: -4, rmPct: -45, mmPct: -15 } },
  ],
  armure: [
    { name: "Culotte en Cuir",        emoji: "🩲", tier: 1, mods: { esq: 5, rmPct: 60 } },
    { name: "Pagne en Cuir",          emoji: "🧵", tier: 1, mods: { esq: 4, arm: 2, rmPct: 50 } },
    { name: "Armure de cuir",         emoji: "🦺", tier: 2, mods: { esq: 3, arm: 4, rmPct: 40 } },
    { name: "Robe de mage",           emoji: "🥻", tier: 2, mods: { esq: 2, arm: 1, rmPct: 10, mmPct: 10 } },
    { name: "Fourrures",              emoji: "🐻", tier: 2, mods: { esq: 2, arm: 6, rmPct: 30 } },
    { name: "Cuir bouilli",           emoji: "🟤", tier: 3, mods: { esq: 1, arm: 8, rmPct: 20 } },
    { name: "Armure de peaux",        emoji: "🐗", tier: 3, mods: { esq: -3, arm: 9, rmPct: 70 } },
    { name: "Armure de bois",         emoji: "🪵", tier: 3, mods: { esq: -3, arm: 6, pv: 15, rmPct: 50 } },
    { name: "Cuirasse d'Ossements",   emoji: "💀", tier: 4, mods: { esq: -3, arm: 6, rmPct: 50, mmPct: 20 } },
    { name: "Armure d'Anneaux",       emoji: "⭕", tier: 4, mods: { esq: -4, arm: 8, rmPct: 90 } },
    { name: "Haubert de mailles",     emoji: "🥋", tier: 4, mods: { esq: -3, arm: 9, rmPct: 70 } },
    { name: "Armure de plates",       emoji: "🛡️", tier: 5, mods: { esq: -2, arm: 10, rmPct: 50 } },
    { name: "Armure de pierre",       emoji: "🗿", tier: 5, mods: { esq: -6, arm: 12, reg: 3, rmPct: 75 } },
  ],
  casque: [
    { name: "Chapeau pointu",         emoji: "🎩", tier: 1, mods: { esq: 3, mmPct: 5 } },
    { name: "Lorgnons",               emoji: "👓", tier: 1, mods: { vue: 1, mmPct: 5 } },
    { name: "Couronne de ronces",     emoji: "🌹", tier: 2, mods: { deg: 3, pv: -5 } },
    { name: "Couronne d'obsidienne",  emoji: "👑", tier: 2, mods: { reg: -1, arm: 1, rmPct: 5 } },
    { name: "Casque à Cornes",        emoji: "🐮", tier: 3, mods: { deg: 1, arm: 3, vue: -1, rmPct: 5 } },
    { name: "Casque à Pointes",       emoji: "🦔", tier: 3, mods: { att: 1, deg: 1, arm: 3, vue: -1 } },
    { name: "Couronne de Cristal",    emoji: "💎", tier: 3, mods: { vue: 3, mmPct: 5 } },
    { name: "Heaume",                 emoji: "🪖", tier: 4, mods: { att: -1, arm: 4, vue: -2, rmPct: 10 } },
    { name: "Turban",                 emoji: "👳", tier: 4, mods: { rmPct: 15, mmPct: 15 } },
  ],
  bouclier: [
    { name: "Targe",                  emoji: "🎯", tier: 1, mods: { esq: 3, att: 1 } },
    { name: "Grimoire",               emoji: "📖", tier: 2, mods: { mmPct: 5 }, note: "DLA +15 mn (non simulé)" },
    { name: "Rondache en Bois",       emoji: "🪵", tier: 2, mods: { esq: 1, arm: 3, pv: 5 } },
    { name: "Bouclier à Pointes",     emoji: "🛡️", tier: 3, mods: { att: 1, deg: 1, arm: 4 } },
    { name: "Gros'Porte",             emoji: "🚪", tier: 4, mods: { arm: 5, rmPct: 10 } },
  ],
  talisman: [
    { name: "Collier à Pointes",      emoji: "📿", tier: 1, mods: { deg: 2, arm: 1 } },
    { name: "Talisman de pierre",     emoji: "🪨", tier: 2, mods: { reg: 2, rmPct: 10, mmPct: 10 } },
    { name: "Gorgeron en métal",      emoji: "⚙️", tier: 2, mods: { reg: -1, arm: 3, rmPct: 10 } },
    { name: "Œil de sang",            emoji: "🩸", tier: 3, mods: { pv: -5, mmPct: 10 } },
    { name: "Pendentif Incandescent", emoji: "🔥", tier: 3, mods: { esq: 3, rmPct: 10, mmPct: 10 } },
    { name: "Torque en pierre",       emoji: "🌀", tier: 4, mods: { reg: -2, rmPct: 20, mmPct: 20 } },
    { name: "Talisman d'Obsidienne",  emoji: "🖤", tier: 5, mods: { att: 1, deg: 2, reg: -4, rmPct: 22, mmPct: 22 } },
  ],
  bottes: [
    { name: "Bottes",                 emoji: "🥾", tier: 1, mods: { esq: 3 } },
    { name: "Jambière en cuir",       emoji: "🦵", tier: 2, mods: { esq: 1, arm: 2, rmPct: 5 } },
    { name: "Jambière en os",         emoji: "🦴", tier: 2, mods: { esq: -1, arm: 2, rmPct: 5, mmPct: 5 } },
    { name: "Souliers dorés",         emoji: "👞", tier: 3, mods: { esq: -1, arm: 1 } },
    { name: "Jambière en mailles",    emoji: "⛓️", tier: 3, mods: { arm: 3, rmPct: 5 } },
    { name: "Jambière en métal",      emoji: "🦿", tier: 4, mods: { esq: -1, arm: 4, rmPct: 5 } },
  ],
};

/* Anciennes listes (v1 « bonus simple ») : mapping pour les niveaux déjà publiés. */
const LEGACY_WEAPON_NAMES = ["Épée Courte", "Gourdin", "Épée Longue", "Lame d'obsidienne"];
const LEGACY_ARMOR_NAMES = ["Armure de cuir", "Haubert de mailles", "Armure de plates"];

const GEAR_MOD_LABELS = [
  ["att", "ATT", ""], ["esq", "ESQ", ""], ["deg", "DEG", ""],
  ["reg", "REG", ""], ["arm", "Armure phy.", ""], ["vue", "VUE", ""], ["pv", "PV", ""],
  ["rmPct", "RM", " %"], ["mmPct", "MM", " %"],
];

function formatGearMods(mods, sep = " · ") {
  const parts = [];
  for (const [key, label, unit] of GEAR_MOD_LABELS) {
    const v = mods[key];
    if (!v) continue;
    parts.push(`${label} ${v > 0 ? "+" : "−"}${Math.abs(v)}${unit}`);
  }
  return parts.join(sep);
}

function makeGearItem(slot, idx) {
  const list = GEAR[slot];
  if (!list) return null;
  const def = list[((idx % list.length) + list.length) % list.length];
  return {
    kind: "gear", slot, gearIdx: list.indexOf(def),
    name: def.name, emoji: def.emoji,
    mods: { ...def.mods }, twoHanded: !!def.twoHanded, note: def.note,
  };
}

function gearItemByName(slot, name) {
  const idx = (GEAR[slot] || []).findIndex(g => g.name === name);
  return idx >= 0 ? makeGearItem(slot, idx) : null;
}

/* Tire une pièce d'équipement adaptée à la profondeur (tier ≤ depth + 1). */
function makeRandomGear(depth, slot = null) {
  const slots = Object.keys(GEAR);
  const s = slot && GEAR[slot] ? slot : slots[Math.floor(Math.random() * slots.length)];
  const pool = GEAR[s].filter(g => g.tier <= (depth || 1) + 1);
  const list = pool.length ? pool : GEAR[s];
  const def = list[Math.floor(Math.random() * list.length)];
  return makeGearItem(s, GEAR[s].indexOf(def));
}

/* Somme des modificateurs de l'équipement porté ({ arme: item|null, … }). */
function gearMods(equip) {
  const total = { att: 0, esq: 0, deg: 0, reg: 0, arm: 0, vue: 0, pv: 0, rmPct: 0, mmPct: 0 };
  for (const item of Object.values(equip || {})) {
    if (!item || !item.mods) continue;
    for (const k of Object.keys(total)) total[k] += item.mods[k] || 0;
  }
  return total;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    GEAR, GEAR_SLOTS, GEAR_MOD_LABELS, LEGACY_WEAPON_NAMES, LEGACY_ARMOR_NAMES,
    makeGearItem, gearItemByName, makeRandomGear, gearMods, formatGearMods,
  };
}
