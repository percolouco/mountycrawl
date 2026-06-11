/* Serveur MountyCrawl — fichiers statiques + API de niveaux communautaires.
 * Node pur, aucune dépendance. Stockage : un fichier JSON (LEVELS_FILE). */

"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 80;
const ROOT = __dirname;
const LEVELS_FILE = process.env.LEVELS_FILE || "/data/levels.json";
const MAX_BODY = 100 * 1024; // 100 Ko par niveau, large
const MAX_LEVELS = 500;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
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
    if (!["potion", "gold", "weapon", "armor"].includes(i.kind)) return "type d'objet invalide";
  }
  if (l.monsters.length === 0) return "place au moins un monstre, sinon pas de défi !";
  return null;
}

const inBounds = p => p && Number.isInteger(p.x) && Number.isInteger(p.y) && p.x >= 0 && p.x < MAP_W && p.y >= 0 && p.y < MAP_H;
const tile = (l, p) => l.grid[p.y][p.x];

/* ---------- API ---------- */

function sendJSON(res, code, data) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function handleAPI(req, res, url) {
  const idMatch = url.pathname.match(/^\/api\/levels\/([a-f0-9]{12})$/);

  if (req.method === "GET" && url.pathname === "/api/levels") {
    const list = loadLevels().map(l => ({
      id: l.id, name: l.name, author: l.author, date: l.date,
      monsters: l.monsters.length, plays: l.plays || 0,
    }));
    return sendJSON(res, 200, list);
  }

  if (req.method === "GET" && idMatch) {
    const levels = loadLevels();
    const level = levels.find(l => l.id === idMatch[1]);
    if (!level) return sendJSON(res, 404, { error: "niveau introuvable" });
    level.plays = (level.plays || 0) + 1;
    saveLevels(levels);
    return sendJSON(res, 200, level);
  }

  if (req.method === "POST" && url.pathname === "/api/levels") {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > MAX_BODY) { sendJSON(res, 413, { error: "niveau trop gros" }); req.destroy(); }
    });
    req.on("end", () => {
      let level;
      try { level = JSON.parse(body); } catch { return sendJSON(res, 400, { error: "JSON invalide" }); }
      const err = validateLevel(level);
      if (err) return sendJSON(res, 400, { error: err });
      const levels = loadLevels();
      if (levels.length >= MAX_LEVELS) return sendJSON(res, 507, { error: "trop de niveaux stockés" });
      const clean = {
        id: crypto.randomBytes(6).toString("hex"),
        name: level.name.trim(), author: level.author.trim(),
        date: new Date().toISOString().slice(0, 10),
        grid: level.grid, start: { x: level.start.x, y: level.start.y },
        monsters: level.monsters, items: level.items, plays: 0,
      };
      levels.push(clean);
      saveLevels(levels);
      return sendJSON(res, 201, { id: clean.id });
    });
    return;
  }

  sendJSON(res, 404, { error: "route inconnue" });
}

/* ---------- Statique ---------- */

function handleStatic(req, res, url) {
  let p = decodeURIComponent(url.pathname);
  if (p === "/") p = "/index.html";
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT) || file === path.join(ROOT, "server.js")) {
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
  server.listen(PORT, () => console.log(`MountyCrawl sur le port ${PORT}, niveaux dans ${LEVELS_FILE}`));
}

module.exports = { validateLevel, MAP_W, MAP_H };
