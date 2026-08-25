# ZIGOUIGOUI 🐍💕

Le Snake le plus bête du monde : un jeu arcade 2D humoristique et absurde, où l'on
pilote un personnage cartoon complètement ridicule qui grandit à chaque objet avalé.
Aucun contenu explicite : tout est stylisé façon dessin animé débile.

## Lancer le jeu

Ouvrir `index.html` dans un navigateur, ou servir le dossier :

```
python -m http.server 8642
```

puis visiter http://localhost:8642

## Contrôles

| Action | Clavier | Manette | Mobile |
|---|---|---|---|
| Diriger | Flèches / ZQSD / WASD | Croix ou stick gauche | Swipe |
| Pause | Échap ou P | Start | — |
| Rejouer (game over) | Entrée / Espace | A | Bouton |

## Contenu

- **Boss après le niveau classique** : une fois l’objectif du niveau plié **et** 250 points
  atteints, le boss débarque. Tu gardes taille, score, capote et bonus.
  Morsure aux boules (halo jaune). Niveau 1 : Toto tombe en 1 coup.
- **Rivaux en niveau** : dès la salle de bain, puis de plus en plus
  nombreux. Tu peux te recroiser sans mourir. Seules les boules (et les virus) tuent.
- **Les méchants : des virus cartoon qui puent** (la Moule Pas Fraîche,
  la Praline Radioactive, l'Abricot Moisi) — coquillages-amandes stylisés
  grognons avec vapeurs de puanteur et mouche attitrée, qui patrouillent
  dans l'arène à partir de la Plage, de plus en plus nombreux et rapides.
- **Difficulté progressive** : vitesse et objectifs augmentent à chaque niveau,
  et le personnage accélère à chaque objet mangé.
- **3 bonus temporaires** : ⚡ Turbo, 🌟 Invincibilité (traverse tout, même les murs), 💰 Score ×2.
- **Capote protectrice** : apparaît à 150 points (puis tous les 150). Un coup de virus est absorbé ; les murs, eux, s'en fichent.
- **La capote protectrice 🛡️** : apparaît tous les 150 points (12 s pour la ramasser),
  se porte sur la tête, et absorbe un coup mortel à ta place — virus, mur ou
  auto-morsure — avec 1,5 s d'invincibilité pour se dégager.
- **6 skins** : Le Naturel (un peu plus anatomique), Le Classique, Banane Royale,
  Cactus Câlin, Robo-Zizi 3000, Arc-en-ciel Fabuleux.
- **Musique générative différente par niveau** + effets sonores comiques (WebAudio, zéro fichier audio).
- **Sauvegarde locale** : meilleur score, niveaux débloqués, skins, skin équipé.

## Structure

```
index.html    Coquille de l'app (écrans, HUD)
style.css     Style arcade cartoon
js/audio.js   Musique procédurale + SFX
js/data.js    Niveaux, obstacles, skins, sauvegarde
js/game.js    Moteur (grille, collisions, bonus) + rendu canvas
js/main.js    Menus, HUD, clavier/manette/tactile
```
