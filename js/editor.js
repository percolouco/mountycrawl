/* Éditeur de niveaux MountyCrawl — partage les globales de game.js (chargé avant). */

"use strict";

const ED = {
  grid: null,        // tableau 2D de caractères : '#' mur, '.' sol, '>' sortie
  start: null,       // {x, y}
  monsters: [],      // specs {x, y, type, tpl} ou {x, y, boss: true}
  items: [],         // specs {x, y, kind, idx?, gold?}
  brush: { mode: "tile", char: "#" },
  painting: false,
};

function edReset() {
  ED.grid = [];
  for (let y = 0; y < MAP_H; y++) {
    ED.grid.push([]);
    for (let x = 0; x < MAP_W; x++) {
      const border = x === 0 || y === 0 || x === MAP_W - 1 || y === MAP_H - 1;
      ED.grid[y].push(border ? "#" : ".");
    }
  }
  ED.start = null;
  ED.monsters = [];
  ED.items = [];
}

/* ---------- Palette ---------- */

function edBuildPalette() {
  const tiles = [
    { label: "🟫 Mur", mode: "tile", char: "#" },
    { label: "⬜ Sol", mode: "tile", char: "." },
    { label: "▼ Sortie", mode: "tile", char: ">" },
    { label: "🧌 Départ du Trõll", mode: "start" },
    { label: "🧽 Gomme (entités)", mode: "erase" },
  ];
  const tilesDiv = document.getElementById("ed-tiles");
  tilesDiv.innerHTML = "";
  for (const t of tiles) edAddBrushBtn(tilesDiv, t.label, t);

  const tplSel = document.getElementById("ed-tpl");
  tplSel.innerHTML = "";
  TEMPLATES.forEach((tpl, i) => {
    const opt = document.createElement("option");
    opt.value = i;
    opt.textContent = (tpl.prefix.trim() || "Normal") + ` (×${tpl.mult})`;
    if (i === 1) opt.selected = true;
    tplSel.appendChild(opt);
  });

  const monstersDiv = document.getElementById("ed-monsters");
  monstersDiv.innerHTML = "";
  MONSTER_TYPES.forEach((m, i) => {
    edAddBrushBtn(monstersDiv, `${m.emoji} ${m.name} (niv. ${m.level})`, { mode: "monster", type: i });
  });
  edAddBrushBtn(monstersDiv, `${BOSS.emoji} ${BOSS.name} (boss)`, { mode: "monster", boss: true });

  const itemsDiv = document.getElementById("ed-items");
  itemsDiv.innerHTML = "";
  edAddBrushBtn(itemsDiv, "🧪 Potion de Vie", { mode: "item", kind: "potion" });
  edAddBrushBtn(itemsDiv, "💰 Mountyzédons", { mode: "item", kind: "gold" });
  WEAPONS.forEach((w, i) => edAddBrushBtn(itemsDiv, `${w.emoji} ${w.name} (+${w.bonus})`, { mode: "item", kind: "weapon", idx: i }));
  ARMORS.forEach((a, i) => edAddBrushBtn(itemsDiv, `${a.emoji} ${a.name} (+${a.bonus})`, { mode: "item", kind: "armor", idx: i }));

  const toolsDiv = document.getElementById("ed-tools");
  toolsDiv.innerHTML = "";
  const fill = (char, label) => {
    const b = document.createElement("button");
    b.textContent = label;
    b.onclick = () => {
      for (let y = 1; y < MAP_H - 1; y++)
        for (let x = 1; x < MAP_W - 1; x++) ED.grid[y][x] = char;
      if (char === "#") { ED.start = null; ED.monsters = []; ED.items = []; }
      edRender();
    };
    toolsDiv.appendChild(b);
  };
  fill(".", "⬜ Tout remplir de sol");
  fill("#", "🟫 Tout remplir de mur (vide les entités)");
  const caves = document.createElement("button");
  caves.textContent = "🎲 Caverne aléatoire";
  caves.onclick = () => {
    const cavern = generateCavern(MAP_W, MAP_H);
    for (let y = 0; y < MAP_H; y++)
      for (let x = 0; x < MAP_W; x++)
        ED.grid[y][x] = cavern[y][x] === T_WALL ? "#" : ".";
    edPruneEntities();
    edRender();
  };
  toolsDiv.appendChild(caves);
}

function edAddBrushBtn(parent, label, brush) {
  const b = document.createElement("button");
  b.textContent = label;
  b.className = "ed-brush";
  b.onclick = () => {
    ED.brush = brush;
    parent.parentElement.querySelectorAll(".ed-brush").forEach(x => x.classList.remove("selected"));
    b.classList.add("selected");
  };
  parent.appendChild(b);
}

/* Supprime les entités qui se retrouvent dans un mur après modification du terrain. */
function edPruneEntities() {
  const onFloor = e => ED.grid[e.y][e.x] !== "#";
  ED.monsters = ED.monsters.filter(onFloor);
  ED.items = ED.items.filter(onFloor);
  if (ED.start && !onFloor(ED.start)) ED.start = null;
}

/* ---------- Application du pinceau ---------- */

function edApply(x, y) {
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return;
  const b = ED.brush;
  if (b.mode === "tile") {
    // bordure inviolable pour garder le troll dans la carte
    const border = x === 0 || y === 0 || x === MAP_W - 1 || y === MAP_H - 1;
    if (border && b.char !== "#") return;
    ED.grid[y][x] = b.char;
    if (b.char === "#") {
      ED.monsters = ED.monsters.filter(m => m.x !== x || m.y !== y);
      ED.items = ED.items.filter(i => i.x !== x || i.y !== y);
      if (ED.start && ED.start.x === x && ED.start.y === y) ED.start = null;
    }
  } else if (b.mode === "start") {
    if (ED.grid[y][x] === "#") return;
    ED.start = { x, y };
  } else if (b.mode === "erase") {
    ED.monsters = ED.monsters.filter(m => m.x !== x || m.y !== y);
    ED.items = ED.items.filter(i => i.x !== x || i.y !== y);
    if (ED.start && ED.start.x === x && ED.start.y === y) ED.start = null;
  } else if (b.mode === "monster") {
    if (ED.grid[y][x] === "#") return;
    ED.monsters = ED.monsters.filter(m => m.x !== x || m.y !== y);
    if (b.boss) ED.monsters.push({ x, y, boss: true });
    else ED.monsters.push({ x, y, type: b.type, tpl: Number(document.getElementById("ed-tpl").value) });
  } else if (b.mode === "item") {
    if (ED.grid[y][x] === "#") return;
    ED.items = ED.items.filter(i => i.x !== x || i.y !== y);
    const spec = { x, y, kind: b.kind };
    if (b.idx !== undefined) spec.idx = b.idx;
    if (b.kind === "gold") spec.gold = 60;
    ED.items.push(spec);
  }
  edRender();
}

/* ---------- Rendu ---------- */

function edRender() {
  const canvas = document.getElementById("ed-map");
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = "18px serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const c = ED.grid[y][x];
      ctx.fillStyle = c === "#" ? "#4a3a22" : "#7a6a45";
      ctx.fillRect(x * TILE, y * TILE, TILE - 1, TILE - 1);
      if (c === ">") {
        ctx.fillStyle = "#111";
        ctx.fillText("▼", x * TILE + TILE / 2, y * TILE + TILE / 2 + 1);
      }
    }
  }

  const disc = (x, y, color) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x * TILE + TILE / 2, y * TILE + TILE / 2, TILE / 2 - 3, 0, Math.PI * 2);
    ctx.fill();
  };
  for (const i of ED.items) {
    disc(i.x, i.y, i.kind === "gold" ? "#caa53d" : i.kind === "potion" ? "#5d8535" : "#7a8db0");
    ctx.fillStyle = "#1a140e";
    const emoji = i.kind === "potion" ? "🧪" : i.kind === "gold" ? "💰"
      : i.kind === "weapon" ? WEAPONS[i.idx || 0].emoji : ARMORS[i.idx || 0].emoji;
    ctx.fillText(emoji, i.x * TILE + TILE / 2, i.y * TILE + TILE / 2 + 1);
  }
  for (const m of ED.monsters) {
    disc(m.x, m.y, m.boss ? "#7a2070" : "#8a3030");
    ctx.fillStyle = "#1a140e";
    const emoji = m.boss ? BOSS.emoji : MONSTER_TYPES[m.type].emoji;
    ctx.fillText(emoji, m.x * TILE + TILE / 2, m.y * TILE + TILE / 2 + 1);
  }
  if (ED.start) {
    disc(ED.start.x, ED.start.y, "#8fbf5a");
    ctx.fillStyle = "#1a140e";
    ctx.fillText("🧌", ED.start.x * TILE + TILE / 2, ED.start.y * TILE + TILE / 2 + 1);
  }

  const status = document.getElementById("ed-status");
  const missing = [];
  if (!ED.start) missing.push("un point de départ 🧌");
  if (ED.monsters.length === 0) missing.push("au moins un monstre");
  status.textContent = missing.length
    ? "Il manque : " + missing.join(" et ") + "."
    : `Prêt : ${ED.monsters.length} monstre(s), ${ED.items.length} objet(s)${ED.grid.some(r => r.includes(">")) ? ", une sortie" : ""}.`;
  status.className = missing.length ? "ed-warn" : "ed-ok";
}

/* ---------- Export / test / publication ---------- */

function edToLevel() {
  return {
    name: document.getElementById("ed-name").value.trim(),
    author: document.getElementById("ed-author").value.trim(),
    grid: ED.grid.map(row => row.join("")),
    start: ED.start,
    monsters: ED.monsters,
    items: ED.items,
  };
}

function edValidate(level) {
  if (!level.start) return "place un point de départ 🧌";
  if (level.monsters.length === 0) return "place au moins un monstre";
  return null;
}

function edTest() {
  const level = edToLevel();
  const err = edValidate(level);
  if (err) { edFlash(err, true); return; }
  if (!level.name) level.name = "Test sans nom";
  if (!level.author) level.author = "moi";
  window.MC_afterEnd = "editor";
  document.getElementById("screen-editor").classList.add("hidden");
  startGame(level);
}

async function edPublish() {
  const level = edToLevel();
  const err = edValidate(level) ||
    (!level.name ? "donne un nom à ton niveau" : null) ||
    (!level.author ? "indique ton pseudo d'auteur" : null);
  if (err) { edFlash(err, true); return; }
  try {
    const res = await fetch("api/levels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(level),
    });
    const data = await res.json();
    if (!res.ok) { edFlash("Refusé par le serveur : " + data.error, true); return; }
    edFlash(`🌍 Publié ! « ${level.name} » est maintenant jouable par tous.`, false);
  } catch {
    edFlash("Impossible de joindre le serveur.", true);
  }
}

function edFlash(msg, isError) {
  const status = document.getElementById("ed-status");
  status.textContent = msg;
  status.className = isError ? "ed-warn" : "ed-ok";
}

/* ---------- Niveaux communautaires ---------- */

async function communityShow() {
  document.getElementById("screen-create").classList.add("hidden");
  document.getElementById("screen-community").classList.remove("hidden");
  const list = document.getElementById("level-list");
  list.innerHTML = '<p class="lore">Chargement…</p>';
  try {
    const res = await fetch("api/levels");
    const levels = await res.json();
    list.innerHTML = "";
    if (levels.length === 0) {
      list.innerHTML = '<p class="lore">Aucun niveau publié pour l\'instant. Sois le premier, l\'éditeur t\'attend !</p>';
      return;
    }
    for (const l of levels.slice().reverse()) {
      const row = document.createElement("button");
      row.className = "level-row";
      row.textContent = `⚔️ ${l.name} — par ${l.author} · ${l.monsters} monstre(s) · joué ${l.plays} fois · ${l.date}`;
      row.onclick = async () => {
        const r = await fetch("api/levels/" + l.id);
        if (!r.ok) return;
        const level = await r.json();
        document.getElementById("screen-community").classList.add("hidden");
        window.MC_afterEnd = null;
        startGame(level);
      };
      list.appendChild(row);
    }
  } catch {
    list.innerHTML = '<p class="lore">Impossible de joindre le serveur (le mode communautaire nécessite le site en ligne).</p>';
  }
}

/* ---------- Branchement ---------- */

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => {
    edReset();
    edBuildPalette();

    document.getElementById("btn-editor").onclick = () => {
      document.getElementById("screen-create").classList.add("hidden");
      document.getElementById("screen-editor").classList.remove("hidden");
      edRender();
    };
    document.getElementById("ed-back").onclick = () => {
      document.getElementById("screen-editor").classList.add("hidden");
      document.getElementById("screen-create").classList.remove("hidden");
    };
    document.getElementById("btn-community").onclick = communityShow;
    document.getElementById("btn-comm-back").onclick = () => {
      document.getElementById("screen-community").classList.add("hidden");
      document.getElementById("screen-create").classList.remove("hidden");
    };
    document.getElementById("ed-test").onclick = edTest;
    document.getElementById("ed-publish").onclick = edPublish;

    const canvas = document.getElementById("ed-map");
    const cellOf = e => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: Math.floor((e.clientX - rect.left) * (canvas.width / rect.width) / TILE),
        y: Math.floor((e.clientY - rect.top) * (canvas.height / rect.height) / TILE),
      };
    };
    canvas.addEventListener("mousedown", e => {
      ED.painting = true;
      const { x, y } = cellOf(e);
      edApply(x, y);
    });
    canvas.addEventListener("mousemove", e => {
      if (!ED.painting || ED.brush.mode !== "tile") return;
      const { x, y } = cellOf(e);
      edApply(x, y);
    });
    document.addEventListener("mouseup", () => { ED.painting = false; });

    // ?screen=editor | community : accès direct (captures d'écran, raccourcis)
    const params = new URLSearchParams(location.search);
    const screen = params.get("screen");
    if (screen === "editor") document.getElementById("btn-editor").onclick();
    else if (screen === "community") communityShow();

    // ?level=<id> : lien partageable vers un niveau communautaire
    const levelId = params.get("level");
    if (levelId && /^[a-f0-9]{12}$/.test(levelId)) {
      fetch("api/levels/" + levelId)
        .then(r => r.ok ? r.json() : null)
        .then(level => { if (level) startGame(level); });
    }
  });
}
