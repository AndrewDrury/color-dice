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
  "home.looking": "Recherche de parties ouvertes…",
  "home.noGames": "Aucune partie ouverte pour l'instant. Crées-en une !",
  "home.openGamesAria": "Parties ouvertes",
  "home.host": "hôte : {name}",
  "home.playersSr": "joueurs",
  "home.joinAria": "Rejoindre {room}",
  "home.passwordProtected": "Protégée par mot de passe",

  "create.title": "Créer une partie",
  "create.passwordHint": "Transmets-le à tes amis en privé.",
  "create.maxPlayers": "Joueurs max.",
  "create.listed": "Afficher dans la liste publique",

  "join.title": "Rejoindre la partie",
  "join.titleNamed": "Rejoindre {room}",
  "join.gone": "Cette partie a commencé ou est complète.",
  "join.reclaimLink": "Récupérer ma place",

  "reclaim.title": "Récupérer ma place",
  "reclaim.intro":
    "Connexion perdue ou nouvel appareil ? Saisis le même nom et le mot de passe de la salle.",
  "reclaim.submit": "Récupérer la place",
};
