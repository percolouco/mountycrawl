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
| Caractéristiques | ATT/ESQ en D6, DEG/REG en D3, PV, Vue | Identique, profils de base officiels des 5 races (`MH_Rules/Races_*.php`) |
| Combat | Somme ATT D6 vs somme ESQ D6, dégâts DEG D3 − armure, coup critique (attaque ≥ 2 × esquive) aux dégâts doublés | Identique, avec un panneau « Détail du combat » au format des rapports MH (jets, Seuil de Résistance, jet de Résistance, maîtrise, butin, PX) à droite du journal |
| Talents | Compétence + sortilège réservés par race, 15 % de maîtrise initiale, jet D100 sous le %, progression à l'usage (+1D6 % < 50, +1D3 % < 75, +1 % ensuite ; sous 50 %, un échec donne quand même +1 %), plafonds 90 % compétences / 80 % sortilèges, échec = PA partiellement remboursés | Identique |
| Magie | Seuil de Résistance basé sur MM vs RM, borné 10–90 % | Identique : jet de résistance des monstres → effets de moitié |
| Progression | PX → PI, le N-ième achat coûte N × coût de base racial (table de Rules_3.php) | Identique : 16 PI de base (12 pour la caractéristique favorite), REG 30 (Darkling 22), Armure naturelle 30 pour tous, PV par tranche de 10 |
| Niveaux | 10 × N PI pour atteindre le niveau N | Identique |
| Races | 5 races, chacune avec sort/compétence propre | Les 5 races avec leur capacité signature (voir ci-dessous) |
| Coûts en PA | Déplacement 1–3, attaque, ramasser, équiper, potion… | Déplacement 1, attaque 3, ramasser 1, équiper 2, potion 1 |

Simplifications assumées : les PX sont convertis en PI immédiatement (pas de phase
d'entraînement), la DLA ne dure pas 12 h réelles (sinon la partie durerait trois mois),
et le Monde Souterrain est généré procéduralement à chaque descente.

## Les 5 races (profils et talents officiels)

Profils de base repris des pages officielles, compétence (🥋 2 PA) et sortilège
(🔮 4 PA) réservés avec les effets décrits sur la Mountypedia, adaptés à la grille :

| Race | Profil de base | 🥋 Compétence | 🔮 Sortilège |
|---|---|---|---|
| 🟢 Skrim | ATT 4D6 · ESQ 3D6 · DEG 3D3 · REG 1D3 · PV 30 · Vue 3 | **Botte Secrète** : attaque bonus 1/DLA (2D6 par 3 dés d'ATT, 1D3 par 2 dés d'ATT) | **Hypnotisme** : esquive ÷2 + la cible perd son tour |
| 🟤 Durakuir | ATT 3D6 · ESQ 3D6 · DEG 3D3 · REG 1D3 · PV 40 · Vue 3 | **Régénération Accrue** : +1D3 PV par tranche de 15 PV max | **Rafale Psychique** : imparable, 1D3 par dé de DEG, ignore l'armure |
| 🔴 Kastar | ATT 3D6 · ESQ 3D6 · DEG 4D3 · REG 1D3 · PV 30 · Vue 3 | **Accélération du Métabolisme** : sacrifie des PV (fatigue croissante) pour +4 PA | **Vampirisme** : dégâts magiques + vol de 50 % des dégâts |
| 🟡 Tomawak | ATT 3D6 · ESQ 3D6 · DEG 3D3 · REG 1D3 · PV 30 · Vue 4 | **Camouflage** : invisible, jet sous 75 % de la maîtrise à chaque pas | **Projectile Magique** : à distance (portée = Vue), bonus de proximité |
| 🟣 Darkling | ATT 3D6 · ESQ 3D6 · DEG 3D3 · REG 2D3 · PV 30 · Vue 3 | **Balayage** : déstabilise (la cible perd son tour) | **Siphon des Âmes** : 1D3 par dé de REG, ignore toute armure, nécrose −ATT |

### Page « Règles des talents »

Accessible depuis l'accueil (📜 Règles des talents) et en jeu (bouton 📜 Règles
dans l'en-tête) : les 10 fiches au format MountyHall — Coût en PA, Type, Jet de
résistance, Effet de zone, limite par DLA, EFFET détaillé avec les formules de
jets, et DESCRIPTION d'ambiance. En cours de partie, la fiche des talents de ta
race affiche en plus un encart « **Mes infos** » : pourcentage actuel et plafond,
taux de réussite sur tes jets, dernière utilisation, et tes jets calculés
(ex. Vampirisme : Attaque 2 D6 · Dégâts 4 D3 · Vol de vie 50 %).

### Coûts d'amélioration (officiels, [Rules_3.php](https://www.mountyhall.com/MH_Rules/Rules_3.php))

Le N-ième achat d'une caractéristique coûte N × le coût de base :

| Amélioration | Skrim | Durakuir | Kastar | Tomawak | Darkling |
|---|---|---|---|---|---|
| +1D6 Attaque | **12** | 16 | 16 | 16 | 16 |
| +1D6 Esquive | 16 | 16 | 16 | 16 | 16 |
| +1D3 Dégâts | 16 | 16 | **12** | 16 | 16 |
| +1D3 Régénération | 30 | 30 | 30 | 30 | **22** |
| +1D3 Armure naturelle | 30 | 30 | 30 | 30 | 30 |
| +1 Vue | 16 | 16 | 16 | **12** | 16 |
| +10 PV | 16 | **12** | 16 | 16 | 16 |

(L'amélioration « 30 minutes de DLA » du jeu original n'a pas d'équivalent ici,
la DLA étant instantanée.)

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
  caverne aléatoire / nouveau niveau.
- **🚪 Portes** : une porte téléporte le troll vers un autre niveau publié, en
  conservant PV, PI et équipement — de quoi chaîner des niveaux en campagne.
- **▶️ Tester** joue ton niveau immédiatement (retour à l'éditeur après la partie).
- **🌍 Publier** l'envoie au serveur ; il apparaît dans « Niveaux de la communauté ».
  La publication renvoie une clé d'auteur gardée en localStorage : tes niveaux
  restent modifiables via la section « Mes niveaux publiés » (bouton devient
  « Mettre à jour »).
- Victoire d'un niveau custom : atteindre la sortie ▼ si elle existe, sinon
  terrasser tous les monstres. Un niveau avec porte(s) sans sortie ne se termine
  pas sur place : la suite est derrière la porte.
- Lien partageable : `https://mountycrawl.nas.percolouco.com/?level=<id>`.

### API

| Route | Description |
|---|---|
| `GET /api/levels` | Liste (id, nom, auteur, date, nb monstres, nb portes, nb parties) |
| `GET /api/levels/<id>` | Niveau complet (incrémente le compteur de parties ; la clé d'auteur n'est jamais renvoyée) |
| `POST /api/levels` | Publie un niveau ; renvoie `{id, secret}` — le `secret` est la clé d'auteur |
| `PUT /api/levels/<id>` | Met à jour un niveau ; exige l'en-tête `X-Level-Secret` (403 sinon) |

Validation serveur : grille 28×20, départ hors mur, max 60 monstres/objets et
10 portes (cible = id de niveau), au moins un objectif (monstre, porte ou sortie).

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

- **1.8.0** (2026-06-12) — Habillage « pack parchemin » officiel de MountyHall
  (https://www.mountyhall.com/MH_Pack/packMH_parchemin/) : fond lin, tableaux
  crème à bordure noire (tableau1/2.jpg), liens rouge sombre #990000, boutons
  olive #666633 façon `mh_form_submit`, bandeaux en boiseries (interfacehaut),
  police Trebuchet MS. Assets dans `img/mh/`.
- **1.7.1** (2026-06-12) — Les bonus ATT/ESQ/DEG/REG de l'équipement sont des bonus
  **fixes** ajoutés aux jets, jamais des dés supplémentaires (un Gourdin donne
  DEG +5 sur le jet, pas +5D3).
- **1.7.0** (2026-06-11) — Équipement Mountypedia complet : 6 emplacements (Arme,
  Armure, Casque, Bouclier, Talisman, Bottes) et 55 objets dropables aux valeurs
  de base officielles (bonus fixes, RM/MM en %).
  Armes à 2 mains incompatibles avec un bouclier, PV max d'équipement, tiers de
  drop par profondeur, pinceaux d'éditeur par emplacement, rétrocompatibilité des
  anciens niveaux publiés (specs weapon/armor mappées). Section « Équipement »
  dans la page Trésors.
- **1.6.0** (2026-06-11) — Parchemins 📜 : les 7 parchemins standards de Mountypedia
  (Rune des Cyclopes, Traité de Clairvoyance, Idées Confuses, Rune Explosive,
  Plan Génial, Yeu'Ki'Pic, Rune des Foins) en trésors à trouver, butin de monstre
  et pinceau d'éditeur. Effets de zone (rayon 3 cases : dégâts ou aveuglement des
  monstres), TOUR accéléré/ralenti converti en PA (±30 min = ±1 PA, min. 1 PA par
  tour). Nouvelle page « 🧪 Trésors du Hall » : fiches des 25 potions et des
  7 parchemins (niveau X, durée, formules), accessible depuis l'accueil et en jeu.
- **1.5.2** (2026-06-11) — Les bonus/malus DEG et REG des potions sont des valeurs
  fixes ajoutées au jet, plus des dés supplémentaires (seules les notations « X D3 »
  de Mountypedia sont des jets). Concerne Bonne Bouffe, Fertilité, Corruption,
  DjhinTonik, Rhume/Grippe/Pneumonie, Biskot, KouleMann et Glacier. La régénération
  ne peut plus être négative sous malus.
- **1.5.1** (2026-06-11) — Potions fidèles à Mountypedia : toutes les potions à jet
  utilisent des D3 (Sang de Toh Réroh et PufPuff étaient à tort en D6), et chaque
  fiole ne fait qu'un seul jet — le même total s'applique à toutes les caracs
  concernées (ex. Sang de Toh Réroh niv. 4 : un jet de 4D3 partagé par ATT et ESQ).
  Affichage : suppression des mentions « (jet) » dans le panneau des effets.
- **1.5.0** (2026-06-11) — Page « Règles des talents » : les 10 fiches compétences/
  sortilèges au format MountyHall (coût, type, jet de résistance, formules, lore),
  avec encart « Mes infos » en partie (maîtrise, taux de réussite, jets calculés du
  troll). Suivi des statistiques d'utilisation des talents.
- **1.4.0** (2026-06-11) — Panneau « Détail du combat » au format des rapports
  MountyHall (jets d'Attaque/Esquive, coup critique, Seuil et jet de Résistance,
  progression de Maîtrise, dégâts, mise à mort, butin, total de PX), pour chaque
  action du troll et chaque attaque de monstre. Ajout des coups critiques
  (dégâts ×2 quand l'attaque fait au moins le double de l'esquive) et du butin
  lâché par les monstres (40 % de chance : potion ou Mountyzédons).
  `?demo=combat` simule un combat pour les captures d'écran.
- **1.3.2** (2026-06-11) — Sous 50 % de maîtrise, un jet de talent raté fait quand
  même progresser de 1 % (plafonds inchangés : 90 % compétences, 80 % sortilèges).
- **1.3.1** (2026-06-11) — Coûts d'amélioration officiels de Rules_3.php (N-ième
  achat = N × base, favorisée 12 PI, REG 30/22, PV par 10) et armure naturelle
  en D3 achetable (30 PI pour toutes les races).
- **1.3.0** (2026-06-11) — Races fidèles aux règles officielles : profils de base
  exacts, dégâts en D3, compétence + sortilège réservés par race avec maîtrise en %
  progressant à l'usage, jets de résistance des monstres, statuts (à terre, hypnose,
  nécrose), fatigue du Kastar, camouflage persistant du Tomawak.
- **1.2.0** (2026-06-11) — Portes 🚪 entre niveaux (campagnes multi-niveaux, troll
  conservé), édition post-publication avec clé d'auteur (`PUT` + localStorage),
  section « Mes niveaux publiés », objectifs de victoire affinés.
- **1.1.0** (2026-06-11) — Mode création : éditeur de niveaux visuel, publication en
  ligne, écran « Niveaux de la communauté », liens partageables `?level=<id>`,
  backend node sans dépendance (`server.js`) avec validation et stockage JSON.
- **1.0.0** (2026-06-11) — Version initiale : 5 races, 5 profondeurs, combat aux dés
  fidèle aux règles MH, progression PI, brouillard de guerre, boss Béhémoth.
