/* Client multijoueur MountyCrawl — polling de l'état serveur (/api/mp/*),
 * rendu canvas et actions. L'identité du troll (id + secret) est gardée en
 * localStorage : on retrouve son troll d'une session à l'autre.
 * Partage les globales de game.js (RACES, GEAR_SLOTS, fmtStatLine…). */

"use strict";

const MP_TILE = 48;
const MP_KEY = "mc_mp_identity";

let MP = {
  id: null, secret: null,
  state: null,
  timer: null,
  seen: new Set(),     // brouillard : cases déjà vues (mémoire locale)
  lastLogT: 0,
  pending: false,
};

/* ---------- Identité ---------- */

function mpLoadIdentity() {
  try { return JSON.parse(localStorage.getItem(MP_KEY)); } catch { return null; }
}

function mpSaveIdentity(id, secret) {
  localStorage.setItem(MP_KEY, JSON.stringify({ id, secret }));
}

/* ---------- Réseau ---------- */

async function mpJoin(name, password) {
  const res = await fetch("api/mp/join", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, race: selectedRace, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "connexion refusée");
  MP.id = data.id; MP.secret = data.secret;
  mpSaveIdentity(data.id, data.secret);
  return data.state;
}

async function mpLogin(name, password) {
  const res = await fetch("api/mp/login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "connexion refusée");
  MP.id = data.id; MP.secret = data.secret;
  mpSaveIdentity(data.id, data.secret);
  return data.state;
}

async function mpFetchState() {
  const res = await fetch(`api/mp/state?id=${MP.id}&secret=${MP.secret}`);
  if (res.status === 403) return null; // identité périmée (reset serveur ?)
  if (!res.ok) throw new Error("état indisponible");
  return res.json();
}

async function mpAction(action) {
  if (MP.pending) return;
  MP.pending = true;
  try {
    const res = await fetch("api/mp/action", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: MP.id, secret: MP.secret, action }),
    });
    const data = await res.json();
    if (data.error) mpToast(data.error);
    if (data.state) { MP.state = data.state; mpRender(); }
  } catch { mpToast("le serveur ne répond pas"); }
  MP.pending = false;
}

function mpToast(msg) {
  const el = document.getElementById("mp-status");
  if (el) {
    el.textContent = `⚠️ ${msg}`;
    setTimeout(() => mpRenderStatus(), 2500);
  }
}

/* ---------- Entrée / sortie de l'écran ---------- */

function mpShowJoin(show) {
  document.getElementById("mp-join").classList.toggle("hidden", !show);
  // #layout et #bottom-row existent aussi dans l'écran solo : on scope au multi
  document.querySelector("#screen-mp #layout").classList.toggle("hidden", show);
  document.querySelector("#screen-mp #bottom-row").classList.toggle("hidden", show);
  if (show) {
    document.getElementById("mp-join-name").value = document.getElementById("troll-name").value.trim() || "Trõllinet";
    document.getElementById("mp-join-race").textContent = `${RACES[selectedRace].emoji} ${selectedRace}`;
    document.getElementById("mp-join-msg").textContent = "";
  }
}

async function mpEnter() {
  document.getElementById("screen-create").classList.add("hidden");
  document.getElementById("screen-mp").classList.remove("hidden");
  switchLeftTab("stats", "mp-"); // ouvrir sur les caractéristiques
  MP.seen = new Set();
  try {
    const saved = mpLoadIdentity();
    if (saved && saved.id) {
      MP.id = saved.id; MP.secret = saved.secret;
      MP.state = await mpFetchState();
    }
    if (!MP.state) { mpShowJoin(true); return; } // pas d'identité valable : créer ou retrouver
    mpShowJoin(false);
    mpRender();
    mpSchedule();
  } catch (e) {
    mpToast(e.message || "connexion impossible");
    setTimeout(mpLeave, 2500);
  }
}

/* Création ou reconnexion depuis le panneau « Rejoindre ». */
async function mpJoinSubmit(isLogin) {
  const name = document.getElementById("mp-join-name").value.trim() || "Trõllinet";
  const password = document.getElementById("mp-join-pass").value;
  const msg = document.getElementById("mp-join-msg");
  try {
    MP.state = isLogin ? await mpLogin(name, password) : await mpJoin(name, password);
    MP.seen = new Set();
    mpShowJoin(false);
    mpRender();
    mpSchedule();
  } catch (e) {
    msg.textContent = `⚠️ ${e.message}`;
  }
}

function mpLeave() {
  if (MP.timer) { clearTimeout(MP.timer); MP.timer = null; }
  document.getElementById("screen-mp").classList.add("hidden");
  document.getElementById("screen-create").classList.remove("hidden");
}

function mpSchedule() {
  if (MP.timer) clearTimeout(MP.timer);
  const sec = MP.state?.config?.pollSec || 5;
  MP.timer = setTimeout(async () => {
    if (document.getElementById("screen-mp").classList.contains("hidden")) return;
    try {
      const st = await mpFetchState();
      if (!st) { // identité refusée (reset serveur ?) : repasser par le panneau
        localStorage.removeItem(MP_KEY);
        MP.state = null;
        mpShowJoin(true);
        return;
      }
      MP.state = st;
      mpRender();
    } catch { /* on retentera au prochain tour */ }
    mpSchedule();
  }, sec * 1000);
}

/* ---------- Rendu ---------- */

function mpFmtDelay(ms) {
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s} s`;
  return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s`;
}

function mpRenderStatus() {
  const st = MP.state;
  const el = document.getElementById("mp-status");
  if (!st || !el) return;
  el.textContent = st.you.dead
    ? `☠️ Terrassé — retour dans ${mpFmtDelay(st.you.respawnIn)}`
    : `DLA n°${st.you.dla} · PA dans ${mpFmtDelay(st.you.nextDlaIn)} · 🔄 ${st.config.pollSec} s`;
}

function mpRender() {
  const st = MP.state;
  if (!st) return;
  mpRenderStatus();
  mpRenderMap(st);
  mpRenderPanels(st);
  mpRenderLogs(st);
}

function mpRenderMap(st) {
  const canvas = document.getElementById("mp-map");
  const w = st.config.mapW, h = st.config.mapH;
  canvas.width = w * MP_TILE;
  canvas.height = h * MP_TILE;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = "18px serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const you = st.you;
  const vue = you.eff.vue;
  const visible = (x, y) => Math.max(Math.abs(x - you.x), Math.abs(y - you.y)) <= vue;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (visible(x, y)) MP.seen.add(y * w + x);
      const px = x * MP_TILE, py = y * MP_TILE;
      if (!MP.seen.has(y * w + x)) { ctx.fillStyle = "#0d0a06"; ctx.fillRect(px, py, MP_TILE, MP_TILE); continue; }
      const vis = visible(x, y);
      const wall = st.map[y][x] === "#";
      ctx.fillStyle = wall ? (vis ? "#4a3a22" : "#2c2315") : (vis ? "#7a6a45" : "#3d3522");
      ctx.fillRect(px, py, MP_TILE - 1, MP_TILE - 1);
    }
  }

  // Empilement : une case peut contenir plusieurs trolls/monstres/trésors et un
  // lieu. On regroupe par case et on dessine chaque TYPE dans un coin —
  // troll ↖, monstre ↗, trésor ↙, lieu ↘ — avec un « ×N » si plusieurs.
  const cells = {};
  const cell = (x, y) => (cells[x + "," + y] = cells[x + "," + y] || { x, y, trolls: [], monsters: [], items: [], place: null, youHere: false });
  for (const i of st.items) cell(i.x, i.y).items.push(i);
  for (const m of st.monsters) cell(m.x, m.y).monsters.push(m);
  for (const o of st.trolls) cell(o.x, o.y).trolls.push(o);
  for (const pl of (st.places || [])) cell(pl.x, pl.y).place = pl;
  if (!you.dead) cell(you.x, you.y).youHere = true;

  const Q = MP_TILE / 4; // centre d'un coin
  const EMOJI_FONT = Math.round(MP_TILE / 3) + "px serif";
  const COUNT_FONT = "bold " + Math.round(MP_TILE / 4.5) + "px sans-serif";
  const corner = (c, qx, qy, color, emoji, count, mine) => {
    const cx = c.x * MP_TILE + qx, cy = c.y * MP_TILE + qy;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, Q, 0, Math.PI * 2);
    ctx.fill();
    if (mine) { ctx.strokeStyle = "#eaffdc"; ctx.lineWidth = 2; ctx.stroke(); }
    ctx.fillStyle = "#1a140e";
    ctx.font = EMOJI_FONT;
    ctx.fillText(emoji, cx, cy + 1);
    if (count > 1) {
      ctx.font = COUNT_FONT;
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#1a140e";
      ctx.strokeText("×" + count, cx + Q * 0.9, cy + Q * 0.9);
      ctx.fillStyle = "#ffe";
      ctx.fillText("×" + count, cx + Q * 0.9, cy + Q * 0.9);
    }
  };

  for (const c of Object.values(cells)) {
    const nTrolls = c.trolls.length + (c.youHere ? 1 : 0);
    if (nTrolls) corner(c, Q, Q, c.youHere ? "#8fbf5a" : "#5a7abf", "🧌", nTrolls, c.youHere); // ↖
    if (c.monsters.length) {
      corner(c, MP_TILE - Q, Q, "#8a3030", c.monsters[0].emoji, c.monsters.length); // ↗
      const low = c.monsters.reduce((a, b) => (b.pvPct < a.pvPct ? b : a));
      const bw = Math.max(3, Math.round((MP_TILE - 6) * low.pvPct));
      ctx.fillStyle = "#b03030";
      ctx.fillRect(c.x * MP_TILE + 3, c.y * MP_TILE + 2, bw, 3);
    }
    if (c.items.length) {
      const it = c.items[0];
      const col = it.kind === "gold" ? "#caa53d" : (it.kind === "potion" || it.kind === "scroll") ? (it.color || "#5d8535") : "#7a8db0";
      corner(c, Q, MP_TILE - Q, col, it.emoji, c.items.length); // ↙
    }
    if (c.place) corner(c, MP_TILE - Q, MP_TILE - Q, "#6a5a8a", c.place.emoji, 1); // ↘
    // nom d'un autre troll seul sur sa case (au-dessus) ; masqué si empilement
    if (c.trolls.length === 1 && !c.youHere) {
      ctx.fillStyle = "#dfe8ff";
      ctx.font = Math.round(MP_TILE / 2.6) + "px sans-serif";
      ctx.fillText(c.trolls[0].name, c.x * MP_TILE + MP_TILE / 2, c.y * MP_TILE - MP_TILE / 8);
    }
  }
  ctx.font = "18px serif";
  if (!you.dead && you.camo) {
    ctx.strokeStyle = "#8fbf5a";
    ctx.strokeRect(you.x * MP_TILE + 1, you.y * MP_TILE + 1, MP_TILE - 2, MP_TILE - 2);
  }
  keepInView(canvas, you.x, you.y, MP_TILE);
}

function mpRenderPanels(st) {
  const you = st.you;
  const e = you.eff;
  document.getElementById("mp-troll-title").textContent =
    `${RACES[you.race].emoji} ${you.name}, ${you.race} niv. ${you.level}`;

  const pct = Math.max(0, you.pv / you.pvMax);
  const hpClass = pct > 0.6 ? "high" : pct > 0.3 ? "mid" : "";
  document.getElementById("mp-stats").innerHTML = `
    <div><span>PV</span><span class="stat-val">${you.pv} / ${you.pvMax}</span></div>
    <div class="hp-bar-wrap"><div class="hp-bar ${hpClass}" style="width:${pct * 100}%"></div></div>
    <div><span>Attaque</span><span class="stat-val">${fmtStatLine(you.att, e.att, 6, e.attFlat, 0, { phys: e.attFlatPhys, mag: e.attFlatMag })}</span></div>
    <div><span>Esquive</span><span class="stat-val">${fmtStatLine(you.esq, e.esq, 6, e.esqFlat, 0, { phys: e.esqFlatPhys, mag: e.esqFlatMag })}</span></div>
    <div><span>Dégâts</span><span class="stat-val">${fmtStatLine(you.deg, e.deg, 3, e.degFlat, e.degBonus, { phys: e.degFlatPhys, mag: e.degFlatMag })}</span></div>
    <div><span>Régénération</span><span class="stat-val">${fmtStatLine(you.reg, e.reg, 3, e.regFlat, 0, { phys: e.regFlatPhys, mag: e.regFlatMag })}</span></div>
    <div><span>Armure</span><span class="stat-val">${fmtArmorLine(you.armorDice, e.armorPhys, e.armorMag)}</span></div>
    <div><span>Vue</span><span class="stat-val">${e.vue}</span></div>
    <div><span>${RACES[you.race].comp.name}</span><span class="stat-val">${you.comp.pct} %</span></div>
    <div><span>${RACES[you.race].sort.name}</span><span class="stat-val">${you.sort.pct} %</span></div>
    ${you.race === "Kastar" ? `<div><span>Fatigue</span><span class="stat-val">${you.fatigue}</span></div>` : ""}
    ${you.camo ? '<div><span>🌫️ Camouflé</span><span class="stat-val">oui</span></div>' : ""}
    <div><span>PI</span><span class="stat-val">${you.pi}</span></div>
    <div><span>Mountyzédons</span><span class="stat-val">${you.gold}</span></div>
    <div><span>Monstres tués</span><span class="stat-val">${you.kills}</span></div>`;

  const improve = document.getElementById("mp-improve");
  improve.innerHTML = "";
  const labels = { att: "Attaque +1D6", esq: "Esquive +1D6", deg: "Dégâts +1D3", reg: "Régén. +1D3", pv: "PV max +10", vue: "Vue +1", armor: "Armure phy. +1D3" };
  for (const stat of Object.keys(labels)) {
    const cost = improveCost(stat, you.bought[stat], you.race);
    const btn = document.createElement("button");
    const fav = RACES[you.race].favored === stat ? " ★" : "";
    btn.textContent = `${labels[stat]} — ${cost} PI${fav}`;
    btn.disabled = you.pi < cost || you.dead;
    btn.onclick = () => mpAction({ type: "train", stat });
    improve.appendChild(btn);
  }

  // Effets : on réutilise tel quel le panneau du solo (renderEffectsPanel +
  // badge), pour que les deux modes soient strictement identiques.
  const fxTroll = { potionEffects: you.potionEffects || [], blockCamoTurns: you.blockCamoTurns || 0 };
  document.getElementById("mp-effects").innerHTML = renderEffectsPanel(fxTroll);
  const fxBadge = document.getElementById("mp-fx-badge");
  if (fxBadge) {
    const n = countActiveEffects(fxTroll);
    fxBadge.textContent = n;
    fxBadge.classList.toggle("hidden", n === 0);
  }

  document.getElementById("mp-pa-bar").textContent = "⚡".repeat(you.pa) + "▫️".repeat(Math.max(0, 6 - you.pa));

  const actions = document.getElementById("mp-actions");
  actions.innerHTML = "";
  const addBtn = (label, fn, enabled) => {
    const b = document.createElement("button");
    b.textContent = label;
    b.disabled = !enabled || you.dead;
    b.onclick = fn;
    actions.appendChild(b);
  };
  // Cibles : monstres ET autres trolls (PvP) sur TA case (même case). S'il y en
  // a plusieurs, menu déroulant pour choisir lequel frapper.
  const onCell = e => e.x === you.x && e.y === you.y;
  const attackable = [
    ...st.monsters.filter(onCell).map(m => ({ id: m.id, label: `${m.emoji} ${m.name} (niv. ${m.level} · ${Math.round(m.pvPct * 100)} % PV)` })),
    ...st.trolls.filter(onCell).map(o => ({ id: o.id, label: `🧌 ${o.name} (troll niv. ${o.level} · ${Math.round(o.pvPct * 100)} % PV)` })),
  ];
  const canAttack = attackable.length > 0 && you.pa >= 3 && !you.dead;
  if (attackable.length >= 1) {
    // toujours un menu déroulant dès qu'il y a une cible (même une seule)
    const wrap = document.createElement("div");
    wrap.className = "mp-attack-sel";
    const sel = document.createElement("select");
    for (const a of attackable) {
      const opt = document.createElement("option");
      opt.textContent = a.label;
      sel.appendChild(opt);
    }
    const b = document.createElement("button");
    b.textContent = "⚔️ Attaquer (3 PA)";
    b.disabled = !canAttack;
    b.onclick = () => { const a = attackable[sel.selectedIndex]; if (a) mpAction({ type: "attack", target: a.id }); };
    wrap.appendChild(sel);
    wrap.appendChild(b);
    actions.appendChild(wrap);
  } else {
    addBtn("⚔️ Attaquer (3 PA)", () => {}, false); // aucune cible : bouton désactivé
  }
  const comp = RACES[you.race].comp, sort = RACES[you.race].sort;
  addBtn(`🥋 ${comp.name} (${comp.cost} PA · ${you.comp.pct} %)`, () => mpAction({ type: "comp" }), you.pa >= comp.cost);
  addBtn(`🔮 ${sort.name} (${sort.cost} PA · ${you.sort.pct} %)`, () => mpAction({ type: "sort" }), you.pa >= sort.cost);
  const onItem = st.items.some(i => i.x === you.x && i.y === you.y);
  addBtn(`🖐️ Ramasser (1 PA)`, () => mpAction({ type: "pickup" }), onItem && you.pa >= 1);

  const equipEl = document.getElementById("mp-equipment");
  equipEl.innerHTML = Object.entries(GEAR_SLOTS).map(([slot, info]) => {
    const it = you.equip[slot];
    if (!it) return `<div class="eq-line"><span class="eq-slot">${info.label}</span> —</div>`;
    const fxs = formatGearMods(it.mods);
    return `<div class="eq-line"><span class="eq-slot">${info.label}</span> ${it.emoji} ${esc(it.name)}` +
      `${it.twoHanded ? " <small>(2 mains)</small>" : ""}` +
      ` <button class="unequip-btn" data-slot="${slot}" title="Déséquiper (${COSTS.unequip} PA) : revient dans le sac">↩️</button>` +
      `${fxs ? `<div class="eq-mods">${fxs}</div>` : ""}</div>`;
  }).join("");
  for (const b of equipEl.querySelectorAll(".unequip-btn")) {
    b.disabled = you.dead || you.pa < COSTS.unequip;
    b.onclick = () => mpAction({ type: "unequip", slot: b.dataset.slot });
  }

  renderBag(document.getElementById("mp-inventory"), you.bag, {
    disabled: you.dead,
    pa: you.pa,
    onUse: idx => mpAction({ type: "use", idx }),
    onEat: idx => mpAction({ type: "eat", idx }),
    onDrop: idx => mpAction({ type: "drop", idx }),
  });
}

function mpRenderLogs(st) {
  const logEl = document.getElementById("mp-log");
  logEl.innerHTML = st.privLog.map(l =>
    `<div class="l-${l.cls}">${new Date(l.t).toLocaleTimeString("fr-FR")} — ${l.msg}</div>`).join("");
  logEl.scrollTop = logEl.scrollHeight;

  const wl = document.getElementById("mp-world-log");
  wl.innerHTML = '<div class="cd-header">🌍 Échos du Monde Souterrain</div>' + st.log.map(l =>
    `<div class="l-${l.cls}">${new Date(l.t).toLocaleTimeString("fr-FR")} — ${l.msg}</div>`).join("");
  wl.scrollTop = wl.scrollHeight;
}

/* ---------- Clavier & branchement ---------- */

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("btn-mp");
    if (btn) btn.onclick = mpEnter;
    document.getElementById("mp-leave").onclick = mpLeave;
    document.getElementById("mp-join-create").onclick = () => mpJoinSubmit(false);
    document.getElementById("mp-join-login").onclick = () => mpJoinSubmit(true);

    // Onglets « Caractéristiques / Effets » — même mécanique que le solo
    document.getElementById("mp-tab-stats")?.addEventListener("click", () => switchLeftTab("stats", "mp-"));
    document.getElementById("mp-tab-effects")?.addEventListener("click", () => switchLeftTab("effects", "mp-"));

    document.addEventListener("keydown", e => {
      if (document.getElementById("screen-mp").classList.contains("hidden")) return;
      const k = e.key.toLowerCase();
      const moves = {
        arrowup: [0, -1], z: [0, -1],
        arrowdown: [0, 1], s: [0, 1],
        arrowleft: [-1, 0], q: [-1, 0],
        arrowright: [1, 0], d: [1, 0],
      };
      if (moves[k]) { e.preventDefault(); mpAction({ type: "move", dx: moves[k][0], dy: moves[k][1] }); }
      else if (k === "e") mpAction({ type: "pickup" });
    });

    // compteur de la Taverne : « X trõlls en ligne »
    fetch("api/mp/info").then(r => r.json()).then(info => {
      const el = document.getElementById("mp-info");
      if (el && info && typeof info.online === "number")
        el.textContent = `· ${info.online} trõll(s) en ligne`;
    }).catch(() => {});

    // ?screen=mp : entrer directement dans le monde partagé (tests/captures)
    if (new URLSearchParams(location.search).get("screen") === "mp") mpEnter();
  });
}
