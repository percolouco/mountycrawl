/* Serveur MountyCrawl — fichiers statiques + API de niveaux communautaires
 * + monde multijoueur persistant (mp.js).
 * Node pur, aucune dépendance npm. Stockage : fichiers JSON (LEVELS_FILE,
 * WORLD_FILE pour l'état vivant) + base SQLite native (DB_FILE) pour les
 * valeurs de référence — bestiaire, équipement, potions, parchemins —
 * éditables à chaud par la page admin ou n'importe quel outil SQLite. */

"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const db = require("./db.js");

const PORT = process.env.PORT || 80;
const ROOT = __dirname;
const LEVELS_FILE = process.env.LEVELS_FILE || "/data/levels.json";
const WORLD_FILE = process.env.WORLD_FILE || "/data/world.json";
const DB_FILE = process.env.DB_FILE || "/data/mountycrawl.db";

const mp = require("./mp.js");
const MAX_BODY = 100 * 1024; // 100 Ko par niveau, large
const MAX_LEVELS = 500;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".gif": "image/gif",
};

/* ---------- Stockage ---------- */

function loadLevels() {
  try { return JSON.parse(fs.readFileSync(LEVELS_FILE, "utf8")); }
  catch { return []; }
}

function saveLevels(levels) {
  fs.mkdirSync(path.dirname(LEVELS_FILE), { recursive: true });
  const tmp = LEVELS_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(levels));
  fs.renameSync(tmp, LEVELS_FILE);
}

/* ---------- Validation d'un niveau ---------- */

const MAP_W = 28, MAP_H = 20;

function validateLevel(l) {
  if (!l || typeof l !== "object") return "niveau invalide";
  if (typeof l.name !== "string" || !l.name.trim() || l.name.length > 40) return "nom invalide (1–40 caractères)";
  if (typeof l.author !== "string" || !l.author.trim() || l.author.length > 30) return "auteur invalide (1–30 caractères)";
  if (!Array.isArray(l.grid) || l.grid.length !== MAP_H) return "grille invalide";
  for (const row of l.grid) {
    if (typeof row !== "string" || row.length !== MAP_W || /[^#.>]/.test(row)) return "ligne de grille invalide";
  }
  if (!l.start || !inBounds(l.start) || tile(l, l.start) === "#") return "point de départ manquant ou dans un mur";
  if (!Array.isArray(l.monsters) || l.monsters.length > 60) return "monstres invalides (max 60)";
  for (const m of l.monsters) {
    if (!inBounds(m) || tile(l, m) === "#") return "monstre hors-sol";
    if (m.boss !== true && !(Number.isInteger(m.type) && m.type >= 0 && Number.isInteger(m.tpl) && m.tpl >= 0)) return "type de monstre invalide";
  }
  if (!Array.isArray(l.items) || l.items.length > 60) return "objets invalides (max 60)";
  for (const i of l.items) {
    if (!inBounds(i) || tile(l, i) === "#") return "objet hors-sol";
    if (!["potion", "scroll", "gear", "gold", "weapon", "armor"].includes(i.kind)) return "type d'objet invalide";
  }
  if (l.doors !== undefined && !Array.isArray(l.doors)) return "portes invalides";
  const doors = l.doors || [];
  if (doors.length > 10) return "portes invalides (max 10)";
  for (const d of doors) {
    if (!inBounds(d) || tile(l, d) === "#") return "porte hors-sol";
    if (typeof d.target !== "string" || !/^[a-f0-9]{12}$/.test(d.target)) return "cible de porte invalide";
  }
  const hasExit = l.grid.some(row => row.includes(">"));
  if (l.monsters.length === 0 && doors.length === 0 && !hasExit)
    return "place au moins un monstre, une porte ou une sortie, sinon pas de défi !";
  return null;
}

const inBounds = p => p && Number.isInteger(p.x) && Number.isInteger(p.y) && p.x >= 0 && p.x < MAP_W && p.y >= 0 && p.y < MAP_H;
const tile = (l, p) => l.grid[p.y][p.x];

/* ---------- API ---------- */

function sendJSON(res, code, data) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

/* Le secret d'auteur (renvoyé à la publication, gardé côté client) ne sort jamais en GET. */
function publicLevel(l) {
  const { secret, ...pub } = l;
  return pub;
}

function cleanLevel(level) {
  return {
    name: level.name.trim(), author: level.author.trim(),
    grid: level.grid, start: { x: level.start.x, y: level.start.y },
    monsters: level.monsters, items: level.items, doors: level.doors || [],
  };
}

function readBody(req, res, cb) {
  let body = "";
  req.on("data", chunk => {
    body += chunk;
    if (body.length > MAX_BODY) { sendJSON(res, 413, { error: "niveau trop gros" }); req.destroy(); }
  });
  req.on("end", () => {
    let data;
    try { data = JSON.parse(body); } catch { return sendJSON(res, 400, { error: "JSON invalide" }); }
    cb(data);
  });
}

/* ---------- Multijoueur : monde partagé (mp.js) ---------- */

let WORLD = null;     // initialisé au démarrage du serveur seulement
let worldDirty = false;
let ADMIN_TOKEN = null;

function initMP() {
  db.init(DB_FILE); // avant loadWorld : la migration du tuning < 2.3.0 écrit dedans
  WORLD = mp.loadWorld(WORLD_FILE) || mp.createWorld();
  // token admin : variable d'environnement, sinon généré et persisté à côté du monde
  ADMIN_TOKEN = process.env.MP_ADMIN_TOKEN || null;
  if (!ADMIN_TOKEN) {
    const tokenFile = path.join(path.dirname(WORLD_FILE), "admin-token.txt");
    try { ADMIN_TOKEN = fs.readFileSync(tokenFile, "utf8").trim(); } catch {}
    if (!ADMIN_TOKEN) {
      ADMIN_TOKEN = crypto.randomBytes(16).toString("hex");
      try {
        fs.mkdirSync(path.dirname(tokenFile), { recursive: true });
        fs.writeFileSync(tokenFile, ADMIN_TOKEN);
      } catch {}
    }
  }
  console.log(`Monde multijoueur prêt (${Object.keys(WORLD.trolls).length} troll(s), ${WORLD.monsters.length} monstre(s)).`);
  console.log(`Token admin : ${ADMIN_TOKEN}`);
  setInterval(() => {
    if (mp.tick(WORLD)) worldDirty = true;
  }, 1000);
  setInterval(() => {
    if (!worldDirty) return;
    worldDirty = false;
    try { mp.saveWorld(WORLD, WORLD_FILE); } catch (e) { console.error("sauvegarde du monde :", e.message); }
  }, 15000);
  process.on("SIGTERM", () => {
    try { mp.saveWorld(WORLD, WORLD_FILE); } catch {}
    process.exit(0);
  });
}

function isAdmin(req, url) {
  const provided = req.headers["x-admin-token"] || url.searchParams.get("token");
  return ADMIN_TOKEN && provided === ADMIN_TOKEN;
}

function handleMP(req, res, url) {
  if (!WORLD) return sendJSON(res, 503, { error: "monde non initialisé" });

  if (req.method === "POST" && url.pathname === "/api/mp/join") {
    return readBody(req, res, body => {
      const r = mp.newTroll(WORLD, body.name, body.race, body.password);
      if (r.error) return sendJSON(res, 400, { error: r.error });
      worldDirty = true;
      return sendJSON(res, 201, {
        id: r.troll.id, secret: r.troll.secret,
        state: mp.stateFor(WORLD, r.troll),
      });
    });
  }

  if (req.method === "POST" && url.pathname === "/api/mp/login") {
    return readBody(req, res, body => {
      const r = mp.login(WORLD, body.name, body.password);
      if (r.error) return sendJSON(res, 403, { error: r.error });
      return sendJSON(res, 200, {
        id: r.troll.id, secret: r.troll.secret,
        state: mp.stateFor(WORLD, r.troll),
      });
    });
  }

  if (req.method === "GET" && url.pathname === "/api/mp/state") {
    const t = mp.authTroll(WORLD, url.searchParams.get("id"), url.searchParams.get("secret"));
    if (!t) return sendJSON(res, 403, { error: "troll inconnu ou clé invalide" });
    return sendJSON(res, 200, mp.stateFor(WORLD, t));
  }

  if (req.method === "POST" && url.pathname === "/api/mp/action") {
    return readBody(req, res, body => {
      const t = mp.authTroll(WORLD, body.id, body.secret);
      if (!t) return sendJSON(res, 403, { error: "troll inconnu ou clé invalide" });
      const r = mp.action(WORLD, t, body.action || {});
      worldDirty = true;
      return sendJSON(res, r.error ? 400 : 200, { ...r, state: mp.stateFor(WORLD, t) });
    });
  }

  if (req.method === "GET" && url.pathname === "/api/mp/info") {
    const now = Date.now();
    const online = Object.values(WORLD.trolls).filter(t => now - (t.lastSeen || 0) < 5 * 60 * 1000).length;
    return sendJSON(res, 200, {
      trolls: Object.keys(WORLD.trolls).length, online,
      monsters: WORLD.monsters.length, pollSec: WORLD.config.pollSec,
    });
  }

  /* --- Admin (X-Admin-Token ou ?token=) --- */
  if (url.pathname.startsWith("/api/mp/admin")) {
    if (!isAdmin(req, url)) return sendJSON(res, 403, { error: "token admin invalide" });

    if (req.method === "GET" && url.pathname === "/api/mp/admin") {
      return sendJSON(res, 200, mp.adminOverview(WORLD));
    }
    if (req.method === "PUT" && url.pathname === "/api/mp/admin/config") {
      return readBody(req, res, body => {
        const cfg = mp.adminSetConfig(WORLD, body);
        worldDirty = true;
        mp.worldLog(WORLD, "⚙️ Les Dieux Trõlls ont ajusté les lois du monde.");
        return sendJSON(res, 200, cfg);
      });
    }
    if (req.method === "PUT" && url.pathname === "/api/mp/admin/tuning") {
      return readBody(req, res, body => {
        const tuning = mp.adminSetTuning(WORLD, body);
        worldDirty = true;
        mp.worldLog(WORLD, "⚗️ Les Dieux Trõlls ont retouché bêtes et trésors.");
        return sendJSON(res, 200, tuning);
      });
    }
    if (req.method === "POST" && url.pathname === "/api/mp/admin/kick") {
      return readBody(req, res, body => {
        const r = mp.adminKickTroll(WORLD, body.id);
        if (r.error) return sendJSON(res, 404, r);
        worldDirty = true;
        return sendJSON(res, 200, r);
      });
    }
    if (req.method === "POST" && url.pathname === "/api/mp/admin/reset") {
      mp.adminResetWorld(WORLD);
      worldDirty = true;
      return sendJSON(res, 200, { ok: true });
    }
  }

  sendJSON(res, 404, { error: "route multijoueur inconnue" });
}

function handleAPI(req, res, url) {
  if (url.pathname.startsWith("/api/mp/")) return handleMP(req, res, url);

  // Valeurs de référence des équipements lues EN DIRECT dans la BDD SQLite :
  // l'encyclopédie « Trésors du Hall » reflète ainsi les éditions de la base
  // (DB Browser / sqlite-web) sans toucher au code.
  if (req.method === "GET" && url.pathname === "/api/reference/gear") {
    return sendJSON(res, 200, db.gearAll());
  }

  const idMatch = url.pathname.match(/^\/api\/levels\/([a-f0-9]{12})$/);

  if (req.method === "GET" && url.pathname === "/api/levels") {
    const list = loadLevels().map(l => ({
      id: l.id, name: l.name, author: l.author, date: l.date,
      monsters: l.monsters.length, doors: (l.doors || []).length, plays: l.plays || 0,
    }));
    return sendJSON(res, 200, list);
  }

  if (req.method === "GET" && idMatch) {
    const levels = loadLevels();
    const level = levels.find(l => l.id === idMatch[1]);
    if (!level) return sendJSON(res, 404, { error: "niveau introuvable" });
    level.plays = (level.plays || 0) + 1;
    saveLevels(levels);
    return sendJSON(res, 200, publicLevel(level));
  }

  if (req.method === "POST" && url.pathname === "/api/levels") {
    return readBody(req, res, level => {
      const err = validateLevel(level);
      if (err) return sendJSON(res, 400, { error: err });
      const levels = loadLevels();
      if (levels.length >= MAX_LEVELS) return sendJSON(res, 507, { error: "trop de niveaux stockés" });
      const record = {
        id: crypto.randomBytes(6).toString("hex"),
        secret: crypto.randomBytes(16).toString("hex"),
        date: new Date().toISOString().slice(0, 10),
        plays: 0,
        ...cleanLevel(level),
      };
      levels.push(record);
      saveLevels(levels);
      return sendJSON(res, 201, { id: record.id, secret: record.secret });
    });
  }

  if (req.method === "PUT" && idMatch) {
    return readBody(req, res, level => {
      const levels = loadLevels();
      const existing = levels.find(l => l.id === idMatch[1]);
      if (!existing) return sendJSON(res, 404, { error: "niveau introuvable" });
      const provided = req.headers["x-level-secret"];
      if (!existing.secret || !provided || provided !== existing.secret)
        return sendJSON(res, 403, { error: "clé d'auteur invalide : tu ne peux modifier que tes propres niveaux" });
      const err = validateLevel(level);
      if (err) return sendJSON(res, 400, { error: err });
      Object.assign(existing, cleanLevel(level), { updated: new Date().toISOString().slice(0, 10) });
      saveLevels(levels);
      return sendJSON(res, 200, { id: existing.id });
    });
  }

  sendJSON(res, 404, { error: "route inconnue" });
}

/* ---------- Statique ---------- */

function handleStatic(req, res, url) {
  let p = decodeURIComponent(url.pathname);
  if (p === "/") p = "/index.html";
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT) || file === path.join(ROOT, "server.js") || file === path.join(ROOT, "mp.js")) {
    res.writeHead(403); return res.end("interdit");
  }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end("introuvable"); }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname.startsWith("/api/")) return handleAPI(req, res, url);
  if (req.method !== "GET") { res.writeHead(405); return res.end(); }
  handleStatic(req, res, url);
});

if (require.main === module) {
  initMP();
  server.listen(PORT, () => console.log(`MountyCrawl sur le port ${PORT}, niveaux dans ${LEVELS_FILE}, monde dans ${WORLD_FILE}, référence dans ${DB_FILE}`));
}

module.exports = { validateLevel, MAP_W, MAP_H };
