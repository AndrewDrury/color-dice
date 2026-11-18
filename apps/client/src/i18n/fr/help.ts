import type { help as en } from "../en/help";

export const help: Record<keyof typeof en, string> = {
  "help.title": "Comment jouer",
  "help.b1": "À chaque tour, un joueur lance deux dés blancs et un dé par couleur encore ouverte.",
  "help.b2":
    "Tout le monde peut cocher un numéro dans une ligne avec la somme des blancs. Ou passer.",
  "help.b3":
    "Ensuite, seul le lanceur peut ajouter un dé blanc à un dé de couleur et cocher ce numéro.",
  "help.b4": "Coche les numéros de gauche à droite. Ce que tu sautes est perdu pour de bon.",
  "help.b5":
    "Après 5 croix dans une ligne, tu peux cocher son dernier numéro, ce qui verrouille la ligne.",
  "help.b6":
    "Quand une ligne est verrouillée pour quelqu'un, toute la table perd le dé de cette couleur.",
  "help.b7": "Si le lanceur ne coche rien du tout pendant son tour, il prend une pénalité de −5.",
  "help.b8":
    "La partie se termine à 4 pénalités ou quand 2 lignes sont verrouillées. Le plus de points gagne.",
  "help.example": "Exemple",
  "help.exampleCap":
    "La somme des blancs est 5 : coche le 5. Le 3 et le 4 sont sautés pour de bon.",
  "help.exampleAria": "Ligne rouge : 2 coché, 3 et 4 sautés, puis 5 coché",
  "help.scoring": "Décompte des points",
  "help.scoringCap":
    "Chaque croix dans une ligne rapporte plus que la précédente. Chaque pénalité vaut −5.",
  "help.crosses": "Croix",
  "help.points": "Points",
  "help.lockCap": "Le verrou compte comme une croix de plus.",
};
