/* Page « Règles des talents » : fiches des compétences et sortilèges par race,
 * au format des fiches MountyHall, avec la section « Mes infos » du troll en cours.
 * Partage les globales de game.js (chargé avant). */

"use strict";

const TALENT_RULES = {
  "Botte Secrète": {
    race: "Skrim", kind: "Compétence", icon: "🥋", type: "Attaque",
    resist: false, zone: false, perDla: true,
    effect: `La Botte Secrète permet de porter, <b>une fois par DLA</b>, une attaque
      supplémentaire à moindre coût en PA.<br><br>
      L'attaque par Botte Secrète a les caractéristiques suivantes :<br>
      • Jet d'Attaque : <b>2 D6 par 3 D6 d'Attaque</b><br>
      • Jet de Dégâts : <b>1 D3 par 2 D6 d'Attaque</b><br><br>
      Les dégâts sont réduits normalement par l'armure de la cible.`,
    flavor: `Le Skrim feinte, virevolte, et place le coup que personne n'a vu venir.
      Les Maîtres d'Armes du Hall jurent qu'il est impossible de parer une botte
      qu'on ne connaît pas — c'est exactement l'idée.`,
    myInfo: t => [
      ["Attaque", `${Math.max(1, Math.floor(t.att * 2 / 3))} D6`],
      ["Dégâts", `${Math.max(1, Math.floor(t.att / 2))} D3`],
    ],
  },
  "Hypnotisme": {
    race: "Skrim", kind: "Sortilège", icon: "🔮", type: "Affaiblissement",
    resist: true, zone: false, perDla: false,
    effect: `L'Hypnotisme affaiblit un adversaire adjacent :<br>
      • son <b>Esquive est divisée par 2</b> pendant 2 tours ;<br>
      • il <b>perd son prochain tour</b>.<br><br>
      Un Jet de Résistance réussi de la part de la cible réduit l'effet :
      l'esquive n'est divisée que pendant 1 tour et le tour n'est pas perdu.`,
    flavor: `Les yeux du Skrim se mettent à tournoyer, sa voix se fait sirupeuse…
      et l'adversaire se demande soudain ce qu'il était venu faire dans ces cavernes.`,
    myInfo: () => [],
  },
  "Régénération Accrue": {
    race: "Durakuir", kind: "Compétence", icon: "🥋", type: "Soin",
    resist: false, zone: false, perDla: false,
    effect: `Le Durakuir récupère immédiatement des Points de Vie :<br>
      • Soin : <b>1 D3 par tranche de 15 PV max</b>.<br><br>
      Le calcul prend en compte les PV maximum avec tous leurs bonus.`,
    flavor: `La peau du Durakuir se referme à vue d'œil, les os se ressoudent dans
      un craquement sinistre. Ce qui ne le tue pas le laisse à peu près indifférent.`,
    myInfo: t => [
      ["Soin", `${Math.max(1, Math.floor(t.pvMax / 15))} D3`],
    ],
  },
  "Rafale Psychique": {
    race: "Durakuir", kind: "Sortilège", icon: "🔮", type: "Attaque",
    resist: true, zone: false, perDla: false,
    effect: `La Rafale Psychique est la seule attaque <b>imparable</b> du jeu :<br>
      • Jet d'Attaque : <b>automatiquement réussi</b> (aucune esquive possible) ;<br>
      • Jet de Dégâts : <b>1 D3 par D3 de Dégâts</b> ;<br>
      • l'<b>armure physique est ignorée</b>.<br><br>
      Un Jet de Résistance réussi de la part de la cible lui permet de ne subir
      que la moitié des dégâts.`,
    flavor: `Le Durakuir fronce les sourcils — un exploit en soi — et une onde de
      pure mauvaise humeur traverse le crâne de son adversaire.`,
    myInfo: t => [
      ["Attaque", "automatiquement réussie"],
      ["Dégâts", `${t.deg} D3`],
    ],
  },
  "Accélération du Métabolisme": {
    race: "Kastar", kind: "Compétence", icon: "🥋", type: "Utilitaire",
    resist: false, zone: false, perDla: false,
    effect: `Le Kastar sacrifie des Points de Vie pour agir davantage :<br>
      • Coût : <b>1 D3 PV + la fatigue accumulée</b> ;<br>
      • Gain : <b>+4 PA</b> (sans dépasser 6) ;<br>
      • chaque usage augmente la <b>fatigue de 1</b> ; elle se dissipe à chaque
      nouvelle DLA (division par 1,25).<br><br>
      Attention : si les PV tombent à 0, le métabolisme a raison du Kastar.`,
    flavor: `Le cœur du Kastar s'emballe, ses veines gonflent, le monde ralentit
      autour de lui. La Faim paiera l'addition plus tard.`,
    myInfo: t => [
      ["Coût actuel", `1 D3 + ${t.fatigue} PV (fatigue)`],
      ["Gain", "+4 PA"],
    ],
  },
  "Vampirisme": {
    race: "Kastar", kind: "Sortilège", icon: "🔮", type: "Attaque",
    resist: true, zone: false, perDla: false,
    effect: `Le Vampirisme permet une attaque magique particulièrement dévastatrice
      pour la victime mais bénéfique pour l'assaillant : ce dernier gagne autant de
      PV que la <b>moitié des dégâts réellement infligés</b>.<br><br>
      L'attaque par Vampirisme a les caractéristiques suivantes :<br>
      • Jet d'Attaque : <b>2 D6 par 3 D3 de Dégâts</b> ;<br>
      • Jet de Dégâts : <b>1 D3 par D3 de Dégâts</b> ;<br>
      • l'<b>armure physique est ignorée</b> ;<br>
      • Vampirisme : <b>50 % des dégâts infligés</b> rendus en PV.<br><br>
      Un Jet de Résistance réussi de la part de la cible lui permet de ne subir que
      la moitié des dégâts (et réduit d'autant le gain de PV). Si la cible est tuée,
      le gain est limité à la moitié des PV qu'il lui restait.`,
    flavor: `Le Kastar plante ses dents dans son adversaire et lui arrache un bon
      morceau. Mais ce n'est pas tout ! Faisant appel aux Enseignements du Dieu du
      Manger, le Kastar digère sans mal ce qu'il a pris à son adversaire et sait
      profiter de cet apport pour régénérer sans problème.`,
    myInfo: t => [
      ["Attaque", `${Math.max(1, Math.floor(t.deg * 2 / 3))} D6`],
      ["Dégâts", `${t.deg} D3`],
      ["Vol de vie", "50 % des dégâts infligés"],
    ],
  },
  "Camouflage": {
    race: "Tomawak", kind: "Compétence", icon: "🥋", type: "Furtivité",
    resist: false, zone: false, perDla: false,
    effect: `Le Tomawak devient <b>invisible</b> aux yeux des monstres.<br><br>
      • Le camouflage persiste de DLA en DLA tant qu'il n'est pas rompu ;<br>
      • à chaque déplacement, un jet sous <b>75 % de la maîtrise</b> est requis
      pour rester caché ;<br>
      • attaquer rompt le camouflage ; le Projectile Magique ne le conserve
      que sur un jet sous <b>25 % de la maîtrise</b>.`,
    flavor: `Un frémissement d'air, une ombre qui glisse le long de la paroi…
      Le Tomawak n'est plus là. Enfin si, mais bonne chance pour le prouver.`,
    myInfo: t => [
      ["Jet de discrétion au déplacement", `${Math.floor(t.comp.pct * 0.75)} %`],
      ["Conservation après Projectile Magique", `${Math.floor(t.comp.pct * 0.25)} %`],
    ],
  },
  "Projectile Magique": {
    race: "Tomawak", kind: "Sortilège", icon: "🔮", type: "Attaque à distance",
    resist: true, zone: false, perDla: false,
    effect: `Le Projectile Magique frappe à distance, dans la limite de la
      <b>portée = Vue</b> du lanceur :<br>
      • Jet d'Attaque : <b>1 D6 par case de Vue + 1 D6 par case de proximité</b>
      (bonus quand la cible est plus proche que la portée maximale) ;<br>
      • Jet de Dégâts : <b>1 D3 par 2 cases de Vue</b> ;<br>
      • l'<b>armure physique est ignorée</b>.<br><br>
      Un Jet de Résistance réussi de la part de la cible lui permet de ne subir
      que la moitié des dégâts.`,
    flavor: `Une bille de lumière verte file entre les stalactites et explose en
      plein museau de la cible. Le Tomawak, lui, est déjà ailleurs.`,
    myInfo: t => [
      ["Portée", `${t.vue} case(s)`],
      ["Attaque", `${t.vue} D6 + 1 D6 par case de proximité`],
      ["Dégâts", `${Math.max(1, Math.floor(t.vue / 2))} D3`],
    ],
  },
  "Balayage": {
    race: "Darkling", kind: "Compétence", icon: "🥋", type: "Contrôle",
    resist: false, zone: false, perDla: true,
    effect: `Le Balayage fauche les jambes d'un adversaire adjacent,
      <b>une fois par DLA</b> :<br>
      • Jet de Déstabilisation : <b>1 D6 par D6 d'Attaque</b> ;<br>
      • Jet de Stabilité de la cible : <b>2 D6 par 3 D6 d'Esquive</b> ;<br>
      • si la déstabilisation l'emporte, la cible est <b>à terre</b> et
      <b>perd son prochain tour</b>.<br><br>
      Le Balayage n'inflige pas de dégâts et ne rompt pas la discrétion.`,
    flavor: `D'un mouvement fluide et sournois — sa spécialité — le Darkling fauche
      les appuis de son adversaire, qui découvre le plafond de la caverne.`,
    myInfo: t => [
      ["Déstabilisation", `${t.att} D6`],
    ],
  },
  "Siphon des Âmes": {
    race: "Darkling", kind: "Sortilège", icon: "🔮", type: "Attaque",
    resist: true, zone: false, perDla: false,
    effect: `Le Siphon des Âmes arrache des lambeaux d'essence vitale :<br>
      • Jet d'Attaque : <b>1 D6 par D6 d'Attaque</b> ;<br>
      • Jet de Dégâts : <b>1 D3 par D3 de Régénération</b> ;<br>
      • <b>toute armure est ignorée</b> (physique et magique) ;<br>
      • Nécrose : la cible perd <b>1 D6 d'Attaque par D3 de Régénération</b>
      du lanceur pendant 2 tours.<br><br>
      Un Jet de Résistance réussi de la part de la cible lui permet de ne subir
      que la moitié des dégâts et de la nécrose.`,
    flavor: `Des volutes noires s'échappent de la victime et s'enroulent autour du
      Darkling, qui les hume comme un grand cru. L'âme a un goût de réglisse, paraît-il.`,
    myInfo: t => [
      ["Attaque", `${t.att} D6`],
      ["Dégâts", `${t.reg} D3`],
      ["Nécrose", `−${t.reg} D6 d'Attaque pendant 2 tours`],
    ],
  },
};

/* ---------- Rendu de la page ---------- */

let rulesReturnTo = "create"; // écran à réafficher en quittant les règles

function rulesFiche(name, rule, cost) {
  const inGame = typeof G !== "undefined" && G && !G.over && G.troll && G.troll.race === rule.race;
  let myInfos = "";
  if (inGame) {
    const t = G.troll;
    const talent = rule.kind === "Compétence" ? t.comp : t.sort;
    const cap = rule.kind === "Compétence" ? 90 : 80;
    const tries = talent.tries || 0;
    const rate = tries ? Math.round((talent.successes || 0) * 100 / tries) : 0;
    const last = talent.lastUse ? new Date(talent.lastUse).toLocaleString("fr-FR") : "jamais";
    const extra = rule.myInfo(t).map(([k, v]) => `<tr><td>${k} :</td><td><b>${v}</b></td></tr>`).join("");
    myInfos = `
      <div class="rules-myinfo">
        <div class="rules-myinfo-title">Mes infos : ${name}</div>
        <table>
          <tr><td>Pourcentage actuel :</td><td><b>${talent.pct} %</b> (max. : ${cap} %)</td></tr>
          <tr><td>Réussite :</td><td><b>${rate} % succès</b> sur ${tries} jet(s)</td></tr>
          <tr><td>Dernière utilisation :</td><td>${last}</td></tr>
          ${extra}
        </table>
      </div>`;
  }
  return `
    <div class="rules-fiche">
      ${myInfos}
      <div class="rules-fiche-title">${rule.icon} ${rule.kind} : ${name}</div>
      <table>
        <tr><td>Coût en PA :</td><td><b>${cost}</b></td></tr>
        <tr><td>Type :</td><td><b>${rule.type}</b></td></tr>
        <tr><td>Jet de résistance :</td><td><b>${rule.resist ? "Oui" : "Non"}</b></td></tr>
        <tr><td>Effet de zone :</td><td><b>${rule.zone ? "Oui" : "Non"}</b></td></tr>
        <tr><td>Limité à 1 par DLA :</td><td><b>${rule.perDla ? "Oui" : "Non"}</b></td></tr>
      </table>
      <div class="rules-section">EFFET :</div>
      <div class="rules-text">${rule.effect}</div>
      <div class="rules-section">DESCRIPTION :</div>
      <div class="rules-text rules-flavor">${rule.flavor}</div>
    </div>`;
}

function rulesRender() {
  const body = document.getElementById("rules-body");
  let html = "";
  for (const [raceName, race] of Object.entries(RACES)) {
    html += `<h2 class="rules-race rules-race-${raceName}">${race.emoji} ${raceName}</h2><div class="rules-pair">`;
    html += rulesFiche(race.comp.name, TALENT_RULES[race.comp.name], race.comp.cost);
    html += rulesFiche(race.sort.name, TALENT_RULES[race.sort.name], race.sort.cost);
    html += "</div>";
  }
  body.innerHTML = html;
}

function rulesShow(from) {
  rulesReturnTo = from;
  document.getElementById("screen-" + from).classList.add("hidden");
  document.getElementById("screen-rules").classList.remove("hidden");
  rulesRender();
  document.getElementById("screen-rules").scrollTop = 0;
  // si un troll est en jeu, amener sa race en tête de page
  if (typeof G !== "undefined" && G && G.troll) {
    const anchor = document.querySelector(`#rules-body .rules-race-${G.troll.race}`);
    if (anchor) anchor.scrollIntoView();
  }
}

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("btn-rules").onclick = () => rulesShow("create");
    document.getElementById("btn-rules-game").onclick = () => rulesShow("game");
    document.getElementById("rules-back").onclick = () => {
      document.getElementById("screen-rules").classList.add("hidden");
      document.getElementById("screen-" + rulesReturnTo).classList.remove("hidden");
    };
    if (new URLSearchParams(location.search).get("screen") === "rules") {
      rulesShow(document.getElementById("screen-game").classList.contains("hidden") ? "create" : "game");
    }
  });
}
