# ZIGOUIGOUI 🐍💕

En quête de sa Puchita : un jeu arcade 2D humoristique et absurde, où l'on
pilote un personnage cartoon complètement ridicule qui grandit à chaque objet avalé.
Aucun contenu explicite : tout est stylisé façon dessin animé débile.

## Lancer le jeu (navigateur / PC web)

```
npm start
```

puis visiter http://localhost:8642

Ou ouvrir `index.html` dans un navigateur.

## Version PC (Windows / Mac / Linux)

Fenêtre desktop, sans barre d’adresse :

```
npm install
npm run pc
```

## Version téléphone — PWA (iOS et Android, tout de suite)

1. Lance le jeu en **https** (ou localhost).
2. **Android (Chrome)** : menu ⋮ → **Installer l’application**.
3. **iPhone / iPad (Safari)** : Partager → **Sur l’écran d’accueil**.
4. **PC (Chrome / Edge)** : icône ⨁ dans la barre d’adresse → Installer.

Le jeu se lance en plein écran, hors du navigateur.

## Version Android native (APK)

Il faut [Android Studio](https://developer.android.com/studio).

```
npm install
npx cap add android
npm run android:open
```

Dans Android Studio : **Run** (émulateur) ou **Build → Build Bundle(s) / APK(s)**.

## Version iOS native (iPhone)

Il faut un **Mac**, [Xcode](https://developer.apple.com/xcode/) et un compte Apple.

```
npm install
npx cap add ios
npm run ios:open
```

Dans Xcode : choisis ton iPhone ou le simulateur, puis **Run**. Pour l’App Store, il faut un compte développeur Apple (99 $/an).

Les dossiers `android/` et `ios/` sont créés au premier `cap add` : ce sont les projets natifs, le jeu web est copié dans `www/` à chaque `npm run android` / `npm run ios`.

## Contrôles

| Action | Clavier | Manette | Mobile |
|---|---|---|---|
| Diriger | Flèches / ZQSD / WASD | Croix ou stick gauche | Swipe |
| Pause | Échap ou P | Start | — |
| Rejouer (game over) | Entrée / Espace | A | Bouton |

## Contenu

- **Boss après le niveau classique** : une fois l’objectif du niveau plié, le boss débarque. Tu gardes taille, score, capote et bonus. Morsure aux boules (halo jaune). Hits = numéro du niveau.
- **Rivaux en niveau** : dès la salle de bain. Seules les boules tuent.
- **Puchitas méchantes** : vulves cartoon (pâle, marron, ébène).
- **3 bonus temporaires** : ⚡ Turbo, 🌟 Invincibilité, 💰 Score ×2.
- **Capote protectrice** et cœurs d’or.
- **Skins** : Naturel (plusieurs carnations), drapeaux, etc.
- **Sauvegarde locale** : meilleur score, niveaux, skins.

## Structure

```
index.html / style.css / js/   jeu web
icons/                         icônes PWA / stores
electron/main.js               appli PC
capacitor.config.json          iOS + Android
www/                           copie web pour Capacitor (générée)
```
