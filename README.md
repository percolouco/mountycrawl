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
| Bonus/malus | Physiques (équipement) et magiques (potions, sortilèges…) distincts | Identique : équipement = physique (exceptions à venir), potions/parchemins = magique ; décomposition « P/M » affichée dans le profil |
| Armure | L'armure réduit les dégâts physiques ; seule sa composante magique réduit les dégâts magiques | Identique : armure physique (naturelle en D3 + équipement) + armure magique (potions/parchemins) — troll et monstres |
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

Comme l'armure, l'ATT et les DEG des monstres existent en **physique** et en
**magique** : un monstre doté d'une attaque magique (ATT mag et DEG mag > 0)
alterne au hasard entre ses deux attaques ; l'attaque magique n'est réduite que
par l'armure magique du troll. En vanilla toutes les valeurs magiques sont à 0
(comportement inchangé) — elles se règlent par type via l'admin du monde partagé.

## Monde partagé (multijoueur)

Depuis l'accueil : **🧌🧌 Monde partagé**. Un monde souterrain persistant et
commun à tous les joueurs, autoritaire côté serveur (`mp.js`) :

- **Le monde vit en continu**, joueurs connectés ou non : chaque monstre a sa
  propre **DLA** (période tirée dans une fourchette paramétrable) et agit à son
  échéance — il erre, ou attaque le troll à portée de Vue. Les monstres ne
  s'attaquent jamais entre eux. La population se repeuple automatiquement.
- **Chaque troll a 6 PA**, rechargés à sa DLA personnelle (paramétrable). Toutes
  les actions du solo sont disponibles : déplacement, attaque, compétence et
  sortilège de race, potions, parchemins, équipement, entraînement en PI.
- **À MountyHall on ne meurt jamais vraiment** : un troll terrassé réapparaît
  après un délai paramétrable, PV pleins, en conservant tout son avoir.
- **Connexion multi-appareils** : le troll vit côté serveur. À la création on
  choisit un mot de passe (conseillé) ; « 🔑 Retrouver mon troll » permet ensuite
  de le récupérer depuis n'importe quel appareil avec nom + mot de passe (les
  noms sont uniques, le mot de passe est stocké hashé+salé). Sans mot de passe,
  l'identité (id + clé secrète) reste gardée par le navigateur d'origine
  (localStorage), comme avant.
- Le client se rafraîchit par **polling** (intervalle conseillé par le serveur,
  paramétrable) ; les autres trolls visibles apparaissent en bleu avec leur nom,
  les camouflés sont invisibles.
- Persistance dans `WORLD_FILE` (défaut `/data/world.json`), sauvegarde
  périodique et au SIGTERM.

### Administration (`admin.html`)

Page protégée par token (`MP_ADMIN_TOKEN`, sinon généré au premier démarrage
dans `/data/admin-token.txt` et affiché dans les logs). Tous les réglages sont
**appliqués à chaud** : DLA des monstres (min/max — les échéances déjà planifiées
sont re-tirées si besoin), DLA des trolls, intervalle de rafraîchissement client,
population de monstres et de trésors, délai de réapparition, profondeur du monde
(puissance des monstres), taille de carte (à la prochaine régénération), limite
de trolls. Plus : vue d'ensemble (trolls avec dernière activité, monstres avec
leur DLA individuelle et leur prochaine action), derniers échos du monde, et
bouton « Régénérer le monde » (trolls conservés et replacés).

L'admin peut aussi **retoucher les règles du monde partagé**, à chaud (les
nouveaux spawns/drops utilisent les valeurs retouchées ; le solo reste vanilla) :

- **Tuning du bestiaire** : tableau éditable par type de monstre (niveau, ATT
  phy/mag, ESQ, DEG phy/mag, PV, armure phy/mag, VUE) — valeurs de base, avant
  gabarit d'âge (Jeune/Vieux/Ancien/Mythique).
- **Tuning de l'équipement** : les 55 objets avec tous leurs bonus modifiables
  (ATT phy/mag, ESQ, DEG phy/mag, REG, armure phy/mag, VUE, PV fixes, RM/MM en %).
- **Tuning des potions & parchemins** : fourchette de puissance « niveau X »
  (min/max) tirée à chaque drop, par trésor.

Les cases modifiées sont surlignées et chaque catégorie se remet d'origine d'un
clic. Depuis la 2.3.0, ces valeurs vivent dans une **base SQLite**
(`DB_FILE`, défaut `/data/mountycrawl.db`, via le module natif `node:sqlite` —
toujours zéro dépendance npm) : tables `monsters`, `gear`, `potions`, `scrolls`,
seedées vanilla au premier démarrage puis jamais écrasées. On peut donc aussi
les éditer directement avec n'importe quel outil SQLite (DB Browser, DBeaver,
sqlite3) — chaque spawn/drop relit la base, c'est pris en compte à chaud.
L'état vivant du monde (trolls, monstres actifs, objets au sol) reste dans
`world.json` ; l'ancien `world.tuning` est migré automatiquement dans la base.

### API multijoueur

- `POST /api/mp/join` `{name, race, password}` → `{id, secret, state}`
- `POST /api/mp/login` `{name, password}` → `{id, secret, state}` (retrouver
  son troll depuis un autre appareil)
- `GET /api/mp/state?id=&secret=` → état visible (vue du troll)
- `POST /api/mp/action` `{id, secret, action}` — `move`, `attack`, `comp`,
  `sort`, `pickup`, `use`, `unequip`, `eat`, `drop`, `train`
- `GET /api/mp/info` → compteurs publics (trolls en ligne…)
- `GET /api/mp/admin` · `PUT /api/mp/admin/config` · `PUT /api/mp/admin/tuning`
  · `POST /api/mp/admin/reset` (header `X-Admin-Token`)

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
node test/smoke.js   # cœur des règles : dés, combat, armures, talents, cavernes…
node test/mp.js      # moteur multijoueur : DLA, tick, actions, admin, persistance
```

Vérifie les dés, la résolution de combat (armures physique/magique), le Seuil de
Résistance, les coûts d'amélioration, les niveaux, la connexité des cavernes
générées, le bestiaire, et le monde partagé (DLA des monstres, mort/réapparition,
visibilité, réglages admin bornés, sauvegarde/rechargement).

## Sources

Mécaniques reconstituées depuis le [site officiel](https://www.mountyhall.com),
les [règles](https://www.mountyhall.com/MH_Rules/Rules_4.php) et la
[Mountypedia](https://mountypedia.mountyhall.com). MountyCrawl est un hommage
non affilié au jeu original de Mountyhall SARL.

## Versions

- **2.7.0** (2026-06-14) — **Templates de drop** façon MountyHall. 19 suffixes
  (« de l'Aigle », « des Mages », « des Béhémoths »…) stockés dans une nouvelle
  table `templates` de la base (seedés au démarrage, éditables comme le reste via
  sqlite-web / `GET /api/reference/templates`). À chaque **drop d'équipement du
  monde partagé**, l'objet reçoit jusqu'à **3 templates** (6 pour une arme à
  **2 mains**), chaque emplacement étant rempli avec une **probabilité réglable
  sur la page admin** (`templateChance`, 0–100 %). Les bonus des templates
  s'ajoutent aux mods de l'objet (nouveau mod `TOUR`, en minutes) et leurs
  suffixes au nom (« Épée Courte de l'Aigle des Mages »). Le solo reste vanilla.
  *Note : le bonus `TOUR` est affiché mais son effet de jeu (DLA) reste à câbler
  une fois la règle confirmée.*
- **2.6.3** (2026-06-13) — **Cache-busting** des fichiers du jeu : les balises
  `<script>`/`<link>` de `index.html` portent `?v=__V__`, jeton que le serveur
  remplace par la version de l'appli (donc différent à chaque déploiement). Le
  navigateur recharge ainsi forcément le nouveau code/CSS — fini les anciennes
  versions servies depuis le cache même après une mise à jour (par ex. la page
  « Trésors du Hall » qui n'affichait pas les bonus magiques d'équipement
  fraîchement édités). Complète le `Cache-Control: no-cache` de la 2.6.1.
- **2.6.2** (2026-06-13) — La page admin et l'édition directe en base
  (sqlite-web) **ne se marchent plus dessus**. Avant, sauver le tuning d'une
  catégorie la **remettait entièrement au vanilla** puis réappliquait le
  formulaire — donc une édition faite en base pouvait être écrasée par une
  sauvegarde admin (et un onglet admin périmé écrasait les éditions récentes).
  Désormais l'admin fait des **mises à jour ciblées** : seuls les objets
  réellement modifiés dans la session sont écrits, le reste de la catégorie est
  laissé tel quel. Le bouton « Tout remettre d'origine » passe par un reset
  explicite (`patch.reset`). Les deux chemins d'édition cohabitent enfin.
- **2.6.1** (2026-06-13) — Suite du branchement de la base de référence sur
  l'encyclopédie. Les **plages de puissance des potions et parchemins** sont
  désormais lues dans la BDD (`/api/reference/potions`, `/api/reference/scrolls`,
  `/api/reference/monsters` en plus de `gear`) — une plage simple « A à B » suit
  la base, les libellés spéciaux (« — », « 5 (fixe) », « 1, 2, 3, 5 ou 8 ») sont
  préservés. **Cache navigateur corrigé** : le HTML/JS/CSS est désormais envoyé
  en `Cache-Control: no-cache` (toujours revalidé) pour qu'une mise à jour ou une
  édition de la base soit prise immédiatement, sans vider le cache à la main
  (les médias gardent un cache d'un jour). Enfin, **PufPuff** était encore en
  « 0 à 2 » dans la base (le rollPower solo seul avait été corrigé en 2.5.1) :
  défaut corrigé en « 1 à 3 » + migration automatique des bases déjà créées.
- **2.6.0** (2026-06-13) — La page **« Trésors du Hall »** lit désormais les
  équipements **en direct dans la base de référence** (BDD SQLite) au lieu des
  valeurs figées du code : nouvel endpoint `GET /api/reference/gear`
  (`db.gearAll()`), et l'encyclopédie récupère ces données à chaque ouverture
  (repli automatique sur `gear.js` si la base est injoignable, ex. ouverture en
  `file://`). Toute édition de l'équipement faite via l'admin / sqlite-web est
  donc reflétée immédiatement sur le listing. L'intro de la section a aussi été
  mise à jour (bonus physiques **et** magiques d'équipement).
- **2.5.1** (2026-06-13) — Correction des niveaux de potions : **le niveau 0
  n'existe plus** (minimum 1). PufPuff passe de « 0 à 2 » à **« 1 à 3 »** (le
  niveau 0 affichait des formules absurdes : `ATT −0 D3`, `VUE −(0+1)`,
  `PV −2D3 si 0 ≥ 2`). Le Biskot, à effet **fixe**, n'affiche plus de niveau
  du tout (au lieu de « niv. 0 »).
- **2.5.0** (2026-06-13) — **Cumul systématique des bonus physiques et
  magiques.** On lance les dés, puis on ajoute **toujours les deux** bonus :
  le physique (équipement) *et* le magique (potions/parchemins + équipement
  magique) s'additionnent, comme le faisait déjà l'esquive (avant, l'attaque
  et les dégâts ne prenaient qu'une seule saveur selon le type d'attaque). Les
  colonnes phys/mag sont désormais **pures et sans recouvrement** (une potion
  est un bonus magique, comptée une seule fois), donc l'affichage `+total
  (phy +X · mag +Y)` est cohérent — fini le faux double comptage. `opts.magic`
  ne sert plus qu'à choisir l'armure qui réduit (la magique seule pour une
  attaque magique). **Armure** présentée comme l'attaque et l'esquive : une
  seule ligne `XD3 +total (phy +P · mag +M)` au lieu des deux lignes « phy. »
  et « mag. » séparées.
- **2.4.4** (2026-06-13) — Affichage des bonus fixes clarifié : quand le bonus
  physique et le bonus magique sont **identiques**, on n'affiche plus qu'un
  seul `+X` (avant : `+1 (phy +1 · mag +1)`, qui donnait l'illusion d'un triple
  comptage). Le détail `(phy +X · mag +Y)` n'apparaît plus que lorsque les deux
  saveurs **diffèrent réellement** (équipement magique, etc.), et le bonus de
  dégâts fixe (`degBonus`) est correctement reporté des deux côtés. Le calcul de
  combat lui-même était déjà correct (`pickFlat` choisit une seule saveur).
- **2.4.3** (2026-06-13) — Fin de l'harmonisation de la fiche : les règles
  CSS de mise en page des caractéristiques (libellé à gauche, valeur alignée
  à droite en chasse fixe, indice phys/mag) ne ciblaient que le solo (`#stats`)
  et sont désormais **partagées avec le multi** (`#mp-stats`) ; suppression
  d'un reliquat CSS multi qui désalignait le message « aucun effet ». Les deux
  fiches sont maintenant strictement identiques au pixel près.
- **2.4.2** (2026-06-13) — **Fiche du troll harmonisée** entre le solo et le
  monde partagé : le mode multi adopte le même **panneau à onglets**
  « Caractéristiques / Effets » que le solo (avec le badge du nombre d'effets
  actifs), et son onglet Effets utilise désormais le **même rendu**
  (cartes buff/malus + « Total des modificateurs ») au lieu de la liste
  simplifiée d'avant. Les deux modes partagent désormais strictement le même
  code d'affichage (`fmtStatLine`, `renderEffectsPanel`, `switchLeftTab`) ;
  seule subsiste la différence de fond entre les modes (compteur de **Tour**
  en solo, compte à rebours **DLA** en temps réel en multi).
- **2.4.1** (2026-06-13) — Fiche du troll du monde partagé : les **bonus
  physiques et magiques** de chaque caractéristique (attaque, esquive, dégâts,
  régénération) sont désormais **toujours détaillés** (`phy +X · mag +Y`),
  même quand un bonus s'applique aux deux saveurs — on voyait avant disparaître
  la décomposition dès que les deux valeurs étaient égales. Les deux panneaux
  latéraux ont été **légèrement agrandis** (230 → 270 px) pour les accueillir.
- **2.4.0** (2026-06-12) — Gestion du sac, en solo comme en multi :
  **déséquiper** (↩️, 1 PA : la pièce revient au sac, PV max et bonus recalculés),
  **jeter à terre** (🗑️, 1 PA : l'objet tombe sur la case du troll et peut être
  ramassé — une seule chose à terre par case), et **goinfrer** l'équipement
  (🍴, 1 PA : l'objet est dévoré et détruit contre un petit bonus aléatoire,
  X = 1 à 3 — « MIAM » +XD3 PV immédiats, « CLONK » +X en armure pendant
  X tours, « GRRROUAR » +X en dégâts pendant X tours, avec les textes
  d'ambiance qui vont bien). Le sac est désormais **classé par type**
  (potions, parchemins, puis l'équipement par emplacement) et chaque objet
  affiche **ses effets** : formule du trésor avec son niveau X et sa durée
  pour les potions/parchemins, bonus complets pour l'équipement.
  Actions API : `unequip`, `eat`, `drop`. Les boutons du monde partagé
  reprennent le style olive du pack parchemin.
- **2.3.0** (2026-06-12) — Les valeurs de référence du monde partagé passent dans
  une **base SQLite** (`db.js`, module natif `node:sqlite` — toujours zéro
  dépendance npm) : tables `monsters` (bestiaire), `gear` (55 objets),
  `potions`/`scrolls` (fourchettes de puissance), dans `DB_FILE` (défaut
  `/data/mountycrawl.db`). Seed vanilla au premier démarrage, jamais écrasé
  ensuite ; chaque spawn/drop **relit la base**, donc une modification — page
  admin ou édition directe au DB Browser/DBeaver/sqlite3 — s'applique à chaud.
  L'ancien `world.tuning` de world.json est migré automatiquement puis retiré.
  L'état vivant (trolls, monstres actifs, objets au sol) reste dans `world.json`.
  Image Docker en node:24 (SQLite natif stable). API et page admin inchangées.
- **2.2.0** (2026-06-12) — Le couple **physique/magique partout** : comme l'armure,
  l'ATT et les DEG existent désormais en deux saveurs pour les **monstres**
  (`attMag`, `degMag` — un monstre qui en a alterne au hasard entre attaque
  physique et magique, cette dernière n'étant réduite que par l'armure magique)
  et pour l'**équipement** (`attMag`/`degMag`/`armMag` : bonus appliqués aux
  sortilèges et à l'armure magique, là où `att`/`deg`/`arm` restent physiques).
  ESQ, PV et VUE restent simples. Les bonus fixes du troll sont décomposés par
  type d'action (`xxxFlatPhys`/`xxxFlatMag`) : les potions/parchemins modifient
  le troll et comptent dans les deux, l'équipement selon sa saveur — au passage,
  une arme physique ne booste plus les sortilèges (Vampirisme, Siphon des Âmes…).
  Toutes les valeurs magiques vanilla sont à 0 (comportement inchangé) et se
  règlent via le tuning admin, dont les tableaux gagnent les colonnes
  ATT/DEG/Arm phy et mag. Admin : bouton 🗑️ pour **supprimer un troll**
  (`POST /api/mp/admin/kick`).
- **2.1.0** (2026-06-12) — **Connexion multi-appareils** : à la création du troll
  on choisit un mot de passe (stocké hashé+salé, jamais en clair) ; « 🔑 Retrouver
  mon troll » (`POST /api/mp/login`) permet de récupérer son troll depuis
  n'importe quel appareil avec nom + mot de passe. Les noms de troll deviennent
  uniques (insensible à la casse). Structure prête pour une vraie inscription
  plus tard. **Admin enrichie** (`PUT /api/mp/admin/tuning`, appliqué à chaud
  aux nouveaux spawns/drops du monde partagé, solo vanilla) : bestiaire éditable
  par type (niveau, ATT, ESQ, DEG, PV, armures phy/mag, VUE), les 55 objets
  d'équipement avec tous leurs bonus modifiables, fourchette de puissance
  « niveau X » min/max par potion et parchemin. Seuls les écarts au vanilla sont
  stockés (`world.tuning`, persisté), cases modifiées surlignées, remise
  d'origine par catégorie.
- **2.0.0** (2026-06-12) — **Multijoueur** : monde souterrain partagé et persistant,
  autoritaire côté serveur (`mp.js`, node pur). Le monde vit en continu : chaque
  monstre agit à sa propre DLA paramétrable (fourchette min/max), erre ou attaque
  les trolls à portée, repeuplement automatique ; jamais de combat monstre contre
  monstre. Trolls : 6 PA rechargés à leur DLA personnelle, toutes les actions du
  solo (talents de race compris), réapparition après la mort, identité conservée
  en localStorage. Client par polling (intervalle paramétrable), autres trolls
  visibles (sauf camouflés). Page `admin.html` protégée par token : tous les
  réglages à chaud + tableau de bord (trolls, monstres et leurs DLA, échos du
  monde, régénération du monde). Tests `test/mp.js`.
- **1.9.0** (2026-06-12) — Bonus/malus **physiques** et **magiques** distincts, comme
  à MountyHall : l'équipement donne des bonus physiques (exceptions à venir), les
  potions et parchemins des bonus magiques. L'armure est scindée en **armure
  physique** (base + naturelle en D3 + équipement) et **armure magique** (effets
  de potions/parchemins, ex. Extrait du Glacier) : les dégâts physiques sont
  réduits par l'armure totale, les dégâts magiques (Rafale Psychique, Vampirisme,
  Projectile Magique, Rune Explosive) par la seule armure magique — le Siphon des
  Âmes continue d'ignorer toute armure. Les monstres ont eux aussi une armure
  physique et une armure magique distinctes (valeurs du bestiaire à venir).
  Affichage : Armure phy./mag. séparées dans le profil, décomposition « P/M » des
  bonus fixes, absorption d'armure détaillée dans les rapports de combat.
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
