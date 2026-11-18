import type { help as en } from "../en/help";

export const help: Record<keyof typeof en, string> = {
  "help.title": "Cómo se juega",
  "help.b1": "En cada turno, un jugador tira dos dados blancos y un dado por cada color abierto.",
  "help.b2": "Todos pueden marcar un número en cualquier fila con la suma de los blancos. O pasar.",
  "help.b3":
    "Después, solo quien tiró puede sumar un dado blanco a un dado de color y marcar ese número.",
  "help.b4": "Marca los números de izquierda a derecha. Lo que saltes se pierde para siempre.",
  "help.b5":
    "Con 5 marcas en una fila puedes marcar su último número, lo que además bloquea la fila.",
  "help.b6": "Cuando una fila se bloquea para alguien, toda la mesa pierde el dado de ese color.",
  "help.b7": "Si quien tira no marca nada en su turno, recibe una penalización de −5.",
  "help.b8":
    "La partida termina con 4 penalizaciones o cuando hay 2 filas bloqueadas. Gana quien tenga más puntos.",
  "help.example": "Ejemplo",
  "help.exampleCap": "La suma blanca es 5: marca el 5. El 3 y el 4 se saltan para siempre.",
  "help.exampleAria": "Fila roja: 2 marcado, 3 y 4 saltados, luego 5 marcado",
  "help.scoring": "Puntuación",
  "help.scoringCap": "Cada marca en una fila vale más que la anterior. Cada penalización resta 5.",
  "help.crosses": "Marcas",
  "help.points": "Puntos",
  "help.lockCap": "El candado cuenta como una marca más.",
};
