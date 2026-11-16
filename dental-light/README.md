# DENTAL LIGHT

Application de gestion de clinique dentaire : patients, dossiers médicaux, rendez-vous, plans de traitement,
prothèses, facturation multi-devises, caisse, stock, paie, rapports (PDF / Excel), documents et consentements,
avec sécurité renforcée (rôles et permissions fines, 2FA, sessions, journal d'audit).

**Technologies : Node.js (Express) · PostgreSQL · JavaScript natif côté navigateur · Python (outils d'exploitation).**

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

Prérequis : **Node.js 18+**, **PostgreSQL 13+**, Python 3.9+ (outils uniquement).

```bash
# 1. Créer une base PostgreSQL vide
createdb dental_light

# 2. Configurer
cd backend
cp .env.example .env        # puis éditer .env
#   DATABASE_URL   connexion PostgreSQL
#   JWT_SECRET     64+ caractères aléatoires (sert aussi à chiffrer les secrets 2FA : ne jamais le changer ensuite)
#   OWNER_EMAIL / OWNER_PASSWORD   compte propriétaire initial (10+ caractères)
#   STORAGE_DIR    dossier PRIVÉ des documents (vide = backend/storage)

# 3. Installer, créer les tables et le propriétaire
npm install
npm run setup

# 4. Démarrer
npm start                   # http://localhost:3000
```

**Première connexion du propriétaire** : changement obligatoire du mot de passe, puis activation obligatoire
de la double authentification (application d'authentification). Conservez les 8 codes de secours.

## Mise en production

- `NODE_ENV=production` et **HTTPS obligatoire** (cookie `Secure`), derrière un reverse proxy (`trust proxy` activé).
- Retirer `OWNER_PASSWORD` du `.env` après `npm run setup`.
- Mises à jour : `git pull && npm install && npm run migrate`, puis redémarrer.
- Santé du service : `GET /api/health` → `{"status":"ok"}`. Arrêt propre sur `SIGTERM` / `SIGINT`.
- **Sauvegardes** (la base et `STORAGE_DIR` doivent être sauvegardés ensemble) :

```bash
python3 tools/backup.py --dest /chemin/sauvegardes --keep-days 30     # à planifier (cron)
python3 tools/restore.py --dump <fichier.dump> --documents <fichier.tar.gz> --yes
python3 tools/check_env.py                                            # diagnostic
```

Les outils Python nécessitent les clients PostgreSQL (`pg_dump`, `pg_restore`, `psql`) dans le `PATH`.

## Tests

168 tests d'intégration (authentification, permissions, 2FA, facturation, caisse, stock, documents, sessions…).
Ils utilisent une base **dédiée, qui est vidée** à chaque exécution (son nom doit contenir « test »).

```bash
createdb dental_light_test
cd backend
TEST_DATABASE_URL=postgres://user:password@localhost:5432/dental_light_test npm test
```

Durée : environ 70 s (un test attend l'expiration d'une session).

## Sécurité — points clés

- Mots de passe hachés (bcrypt), verrouillage après 5 échecs, session par cookie `httpOnly` + `SameSite=Strict`, expiration par inactivité.
- 2FA TOTP avec codes de secours à usage unique ; obligatoire pour les administrateurs.
- Permissions fines par rôle, délégation encadrée, journal d'audit **non modifiable** (triggers PostgreSQL).
- Documents patients stockés hors du dossier public, accessibles uniquement via l'API authentifiée.
- En-têtes de sécurité (Helmet), limitation de débit sur la connexion.
