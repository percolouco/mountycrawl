# 🧌 MountyCrawl — Le Monde Souterrain

Un roguelike navigateur en hommage à [MountyHall](https://www.mountyhall.com), la Terre des Trõlls.
Tu incarnes un Trõll qui descend dans le Monde Souterrain à la recherche de monstres,
de trésors et de PX — jusqu'au Béhémoth qui rôde à la profondeur −5.

100 % vanilla HTML/CSS/JS, aucune dépendance, aucun build. Ouvrir `index.html` et jouer.

## Jouer

🎮 **https://mountycrawl.nas.percolouco.com** (déployé via Traefik, compose dans
`/opt/container/mountycrawl`, image node:22-alpine construite depuis ce repo).

En local :

```bash
PORT=8080 LEVELS_FILE=/tmp/levels.json node server.js
# → http://localhost:8080
```

(Le jeu solo fonctionne aussi en ouvrant `index.html` directement ; seuls l'éditeur
« Publier » et les niveaux communautaires ont besoin du serveur.)

Après une modification, redéployer avec :

```bash
cd /opt/container/mountycrawl && docker compose up -d --build
```

Paramètres d'URL pratiques : `index.html?autostart=1&race=Durakuir&name=Grosbill`
lance directement une partie (utilisé pour les captures d'écran et les tests).

## Mécaniques reprises de MountyHall

| Mécanique | Dans MountyHall | Dans MountyCrawl |
|---|---|---|
| Tour de jeu | DLA de 12 h, 6 PA | DLA instantanée quand les PA sont épuisés (ou bouton « Passer la DLA »), 6 PA |
| Caractéristiques | ATT, ESQ, DEG, REG, PV, Vue en dés | Identique : ATT/ESQ/DEG en D6, REG en D3, Vue = rayon de vision (brouillard de guerre) |
| Combat | Somme ATT D6 vs somme ESQ D6, dégâts DEG D6 − armure | Identique, avec le détail des jets dans le journal |
| Magie | Seuil de Résistance basé sur MM vs RM, borné 10–90 % | Identique (Siphon d'Âme du Darkling) |
| Progression | PX → PI à l'entraînement, coût (dés + 1) × coût racial | Identique, avec réduction sur la caractéristique favorite de la race |
| Niveaux | 10 × N PI pour atteindre le niveau N | Identique |
| Races | 5 races, chacune avec sort/compétence propre | Les 5 races avec leur capacité signature (voir ci-dessous) |
| Coûts en PA | Déplacement 1–3, attaque, ramasser, équiper, potion… | Déplacement 1, attaque 3, ramasser 1, équiper 2, potion 1 |

Simplifications assumées : les PX sont convertis en PI immédiatement (pas de phase
d'entraînement), la DLA ne dure pas 12 h réelles (sinon la partie durerait trois mois),
et le Monde Souterrain est généré procéduralement à chaque descente.

## Les 5 races

| Race | Favori (PI réduits) | Capacité signature |
|---|---|---|
| 🟢 Skrim | Attaque | Frappe Double (4 PA) : deux attaques dans le même assaut |
| 🔴 Kastar | Dégâts | Morsure Vampirique (4 PA) : soigne 50 % des dégâts infligés |
| 🟤 Durakuir | PV | Peau de Pierre (2 PA) : +3 d'armure jusqu'à la prochaine DLA |
| 🟡 Tomawak | Vue | Camouflage (3 PA) : invisible jusqu'à la prochaine DLA |
| 🟣 Darkling | Régénération | Siphon d'Âme (3 PA) : 2D6 dégâts magiques MM vs RM, ignore l'armure, soigne la moitié |

## Contrôles

- **ZQSD / flèches** : se déplacer (1 PA) — marcher sur un monstre l'attaque (3 PA)
- **Espace** : passer la DLA (les monstres agissent, tu régénères REG D3)
- **E** : ramasser l'objet sous tes pieds (1 PA)
- Boutons à l'écran pour la capacité raciale, l'équipement, les potions et l'entraînement (PI)

## Bestiaire

Gobelin, Champignon Vénéneux, Araignée Géante, Gargouille, Momie, Sorcière, Golem de
Pierre — déclinés en gabarits *Jeune / Vieux / Ancien / Mythique* selon la profondeur,
et le **Béhémoth** comme boss final à la profondeur −5.

## Éditeur de niveaux & partage

Depuis l'écran d'accueil : **🛠️ Éditeur de niveaux**.

- Peins le terrain à la souris (mur, sol, sortie ▼), place le départ 🧌, les monstres
  (avec gabarit Jeune → Mythique) et les objets. Outils : tout sol / tout mur /
  caverne aléatoire.
- **▶️ Tester** joue ton niveau immédiatement (retour à l'éditeur après la partie).
- **🌍 Publier** l'envoie au serveur ; il apparaît dans « Niveaux de la communauté ».
- Victoire d'un niveau custom : terrasser tous les monstres, ou atteindre la sortie ▼.
- Lien partageable : `https://mountycrawl.nas.percolouco.com/?level=<id>`.

### API

| Route | Description |
|---|---|
| `GET /api/levels` | Liste (id, nom, auteur, date, nb monstres, nb parties) |
| `GET /api/levels/<id>` | Niveau complet (incrémente le compteur de parties) |
| `POST /api/levels` | Publie un niveau (validation côté serveur : grille 28×20, départ hors mur, 1–60 monstres…) |

Stockage : `/data/levels.json` dans le volume `/opt/container/mountycrawl/data`.

## Tests

```bash
node test/smoke.js
```

Vérifie les dés, la résolution de combat, le Seuil de Résistance, les coûts
d'amélioration, les niveaux, la connexité des cavernes générées et le bestiaire.

## Sources

Mécaniques reconstituées depuis le [site officiel](https://www.mountyhall.com),
les [règles](https://www.mountyhall.com/MH_Rules/Rules_4.php) et la
[Mountypedia](https://mountypedia.mountyhall.com). MountyCrawl est un hommage
non affilié au jeu original de Mountyhall SARL.

## Versions

- **1.1.0** (2026-06-11) — Mode création : éditeur de niveaux visuel, publication en
  ligne, écran « Niveaux de la communauté », liens partageables `?level=<id>`,
  backend node sans dépendance (`server.js`) avec validation et stockage JSON.
- **1.0.0** (2026-06-11) — Version initiale : 5 races, 5 profondeurs, combat aux dés
  fidèle aux règles MH, progression PI, brouillard de guerre, boss Béhémoth.
