import type { home as en } from "../en/home";

export const home: Record<keyof typeof en, string> = {
  "home.yourGames": "Tes parties",
  "home.status.lobby": "en attente",
  "home.status.playing": "en cours",
  "home.status.finished": "terminée",
  "home.asName": "en tant que {name}",
  "home.resume": "Reprendre",
  "home.forget": "Oublier",
  "home.forgetAria": "Oublier {room}",
  "home.record": "Ton bilan : {wins} V – {ties} N – {losses} D",
  "home.inviteLabel": "Un code d'invitation ?",
  "home.createGame": "Créer une partie",
  "home.openGames": "Parties ouvertes (en direct)",
  "home.quickCreateNeedsCache":
    "Enregistre d'abord des réglages valides de salle/nom/mot de passe, puis réessaie.",
  "home.quickCreateCopied": "Le lien d'invitation a été copié automatiquement.",
  "home.copyLinkAgain": "Recopier le lien",
  "home.looking": "Recherche de parties ouvertes…",
  "home.noGames": "Aucune partie ouverte pour l'instant. Crées-en une !",
  "home.openGamesAria": "Parties ouvertes",
  "home.playersSr": "joueurs",
  "home.joinAria": "Rejoindre {room}",
  "home.passwordProtected": "Protégée par mot de passe",
  "home.demoStart": "Démarrer le mode démo / test",

  "create.title": "Créer une partie",
  "create.passwordHint": "Transmets-le à tes amis en privé.",
  "create.maxPlayers": "Joueurs max.",
  "create.listed": "Afficher dans la liste publique",
  "create.cpuOpponents": "Adversaires CPU",
  "create.cpuNone": "Aucune CPU",
  "create.cpuCount_one": "{count} CPU",
  "create.cpuCount_other": "{count} CPU",

  "join.title": "Rejoindre la partie",
  "join.titleNamed": "Rejoindre {room}",
  "join.gone": "Cette partie a commencé ou est complète.",
  "join.reclaimLink": "Récupérer ma place",

  "reclaim.title": "Récupérer ma place",
  "reclaim.intro":
    "Connexion perdue ou nouvel appareil ? Saisis le même nom et le mot de passe de la salle.",
  "reclaim.submit": "Récupérer la place",
};
