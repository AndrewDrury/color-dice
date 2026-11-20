import type { home as en } from "../en/home";

export const home: Record<keyof typeof en, string> = {
  "home.yourGames": "Tus partidas",
  "home.status.lobby": "esperando para empezar",
  "home.status.playing": "en curso",
  "home.status.finished": "terminada",
  "home.asName": "como {name}",
  "home.resume": "Continuar",
  "home.forget": "Olvidar",
  "home.forgetAria": "Olvidar {room}",
  "home.record": "Tu récord: {wins} G – {ties} E – {losses} P",
  "home.inviteLabel": "¿Tienes un código de invitación?",
  "home.createGame": "Crear partida",
  "home.openGames": "Partidas abiertas (en vivo)",
  "home.looking": "Buscando partidas abiertas…",
  "home.noGames": "No hay partidas abiertas ahora. ¡Crea una!",
  "home.openGamesAria": "Partidas abiertas",
  "home.playersSr": "jugadores",
  "home.joinAria": "Unirse a {room}",
  "home.passwordProtected": "Protegida con contraseña",
  "home.demoStart": "Iniciar modo demo / prueba",

  "create.title": "Crear partida",
  "create.passwordHint": "Compártela en privado con tus amigos.",
  "create.maxPlayers": "Máx. de jugadores",
  "create.listed": "Mostrar en la lista pública",
  "create.cpuOpponents": "Oponentes CPU",
  "create.cpuNone": "Sin CPU",
  "create.cpuCount_one": "{count} CPU",
  "create.cpuCount_other": "{count} CPU",

  "join.title": "Unirse a la partida",
  "join.titleNamed": "Unirse a {room}",
  "join.gone": "Esta partida ya empezó o está llena.",
  "join.reclaimLink": "Recuperar mi asiento",

  "reclaim.title": "Recuperar mi asiento",
  "reclaim.intro":
    "¿Perdiste la conexión o cambiaste de dispositivo? Escribe el mismo nombre y la contraseña de la sala.",
  "reclaim.submit": "Recuperar asiento",
};
