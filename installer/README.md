# Installeur Windows — DENTAL LIGHT

Produit un **`DentalLight-Setup.exe`** : installation en un clic, démarrage automatique, et ouverture de l'écran d'activation (demande de licence) à la fin.

## Comment c'est construit
Le workflow GitHub Actions `.github/workflows/build-windows.yml` (runner **Windows**) :
1. installe les dépendances de `backend/` (production),
2. embarque le runtime **Node** (`node.exe`) — l'utilisateur n'a rien à installer,
3. compile l'installeur avec **Inno Setup** (`dental-light.iss`),
4. publie `DentalLight-Setup.exe` en **release** du dépôt (sur un tag `v*`) et en artefact.

### Lancer le build
- Onglet **Actions** du dépôt → « Build Windows Installer » → **Run workflow**, ou
- pousser un tag : `git tag v1.0.0 && git push origin v1.0.0` → la release est créée automatiquement.

Le lien de téléchargement de la vitrine pointe vers `releases/latest`.

## Ce que fait l'installeur
- Installe le logiciel dans `Program Files\DENTAL LIGHT` (Node embarqué).
- Met les **données** dans `C:\ProgramData\DENTAL LIGHT` (base, documents, sauvegardes, `.env`) — dossier inscriptible, **conservé même à la désinstallation** (rien n'est perdu).
- Crée une tâche planifiée **au démarrage de session** (le serveur se relance tout seul).
- Ouvre `http://localhost:3000` : si aucune licence, l'**écran d'activation** demande le code de la clinique.
- Les identifiants du propriétaire (première connexion) sont écrits dans `C:\ProgramData\DENTAL LIGHT\PREMIER-DEMARRAGE.txt`.

## Fichiers
- `dental-light.iss` — script Inno Setup
- `launch.bat` — définit `DATA_ROOT` et lance le serveur
- `start-hidden.vbs` — lance `launch.bat` sans fenêtre

## À tester sur une vraie machine Windows
Ce scaffolding suit l'approche standard mais doit être **vérifié sur Windows** (le build et l'exécution ne sont pas testables depuis Linux). Pour une robustesse maximale (surveillance/relance en cas de plantage), on peut remplacer la tâche planifiée par le service intégré : `npm run service:installer` (voir `backend/scripts/service.js`).
