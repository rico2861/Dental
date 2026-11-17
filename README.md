# DENTAL LIGHT

Application de gestion de clinique dentaire : patients, dossiers médicaux, rendez-vous, plans de traitement,
prothèses, facturation multi-devises, caisse, stock, paie, rapports (PDF / Excel), documents et consentements,
avec sécurité renforcée (rôles et permissions fines, 2FA, sessions, journal d'audit).

**Technologies : Node.js (Express) · PostgreSQL embarqué (PGlite, rien à installer) · JavaScript natif côté navigateur · Python (outils d'exploitation).**

## Structure du projet

```
dental-light/
├── backend/                  API et serveur Node.js
│   ├── src/
│   │   ├── server.js         point d'entrée (authentification, utilisateurs, patients, tableau de bord)
│   │   ├── config/env.js     configuration (.env)
│   │   ├── core/             rôles et permissions
│   │   ├── db/               connexion PostgreSQL + moteur de migrations
│   │   ├── lib/pdf.js        génération de PDF
│   │   └── routes/           billing, cash, clinical, clinical2, documents,
│   │                         planning, reports, requests, security, stock
│   ├── scripts/              setup.js · migrate.js
│   ├── tests/                tests d'intégration (npm test)
│   ├── .env.example
│   └── package.json
├── frontend/                 interface web (HTML / CSS / JS), servie par le backend
│   ├── index.html
│   ├── css/style.css
│   └── js/                   app.js + views2…views6.js
├── db/
│   └── migrations/           schéma SQL versionné (001 … 006)
├── tools/                    outils Python (bibliothèque standard uniquement)
│   ├── backup.py             sauvegarde base + documents
│   ├── restore.py            restauration
│   └── check_env.py          diagnostic de l'installation
└── README.md
```

## Installation

Prérequis : **Node.js 18+** uniquement. La base de données est embarquée (PGlite = PostgreSQL dans Node.js) :
aucun serveur ni logiciel à installer. Les données sont stockées dans `backend/data/db`.

```bash
cd backend
npm install
npm start        # crée .env au besoin, applique les migrations, crée le propriétaire, puis http://localhost:3000
```

Au premier lancement, `.env` est créé automatiquement (clé secrète aléatoire). L'e-mail du propriétaire et son mot de passe
temporaire sont affichés dans le terminal et écrits dans `backend/.env` (modifiables avant le premier démarrage).
`npm run setup` fait la même initialisation sans démarrer le serveur. Un seul processus à la fois peut ouvrir la base.

**Première connexion du propriétaire** : changement obligatoire du mot de passe, puis activation obligatoire
de la double authentification (application d'authentification). Conservez les 8 codes de secours.

## Mise en production

- `NODE_ENV=production` et **HTTPS obligatoire** (cookie `Secure`), derrière un reverse proxy (`trust proxy` activé).
- Retirer `OWNER_PASSWORD` du `.env` après `npm run setup`.
- Mises à jour : `git pull && npm install && npm run migrate`, puis redémarrer.
- Santé du service : `GET /api/health` → `{"status":"ok"}`. Arrêt propre sur `SIGTERM` / `SIGINT`.
- **Sauvegardes** : arrêtez le serveur puis copiez `backend/data` (base) et `backend/storage` (documents) ensemble. Les outils Python ci-dessous concernent un PostgreSQL externe :

```bash
python3 tools/backup.py --dest /chemin/sauvegardes --keep-days 30     # à planifier (cron)
python3 tools/restore.py --dump <fichier.dump> --documents <fichier.tar.gz> --yes
python3 tools/check_env.py                                            # diagnostic
```

Les outils Python nécessitent les clients PostgreSQL (`pg_dump`, `pg_restore`, `psql`) dans le `PATH`.

## Tests

168 tests d'intégration (authentification, permissions, 2FA, facturation, caisse, stock, documents, sessions…).
Ils utilisent une base temporaire embarquée, supprimée à la fin.

```bash
cd backend
npm test
```

Durée : environ 70 s (un test attend l'expiration d'une session).

## Sécurité — points clés

- Mots de passe hachés (bcrypt), verrouillage après 5 échecs, session par cookie `httpOnly` + `SameSite=Strict`, expiration par inactivité.
- 2FA TOTP avec codes de secours à usage unique ; obligatoire pour les administrateurs.
- Permissions fines par rôle, délégation encadrée, journal d'audit **non modifiable** (triggers PostgreSQL).
- Documents patients stockés hors du dossier public, accessibles uniquement via l'API authentifiée.
- En-têtes de sécurité (Helmet), limitation de débit sur la connexion.
