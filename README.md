# DENTAL LIGHT

Application de gestion de clinique dentaire : patients et dossiers médicaux, rendez-vous et salle d'attente, plans de
traitement, prothèses, facturation multi-devises, caisse, stock, paie, rapports (PDF / Excel), documents et
consentements, avec une sécurité renforcée (rôles et permissions, double authentification, journal d'audit,
historique des modifications, chiffrement des données médicales, sauvegardes et copie en ligne).

**Technologies : Node.js (Express) · PostgreSQL embarqué (PGlite, rien à installer) · JavaScript natif côté navigateur.**

---

## Sommaire

1. [Installation](#1-installation)
2. [Démarrage automatique (Windows et Linux)](#2-démarrage-automatique-windows-et-linux)
3. [Récupération d'un compte (mot de passe perdu, compte bloqué)](#3-récupération-dun-compte)
4. [Protection des données sensibles](#4-protection-des-données-sensibles)
5. [Sauvegardes et copie en ligne (Supabase)](#5-sauvegardes-et-copie-en-ligne-supabase)
6. [Accès depuis les autres appareils](#6-accès-depuis-les-autres-appareils)
7. [Données de démonstration](#7-données-de-démonstration)
8. [Mises à jour](#8-mises-à-jour)
9. [Dépannage](#9-dépannage)
10. [Toutes les commandes](#10-toutes-les-commandes)
11. [Structure du projet](#11-structure-du-projet)

> Toutes les commandes `npm run …` se lancent **depuis le dossier `backend`**.
> Ailleurs, npm répond « Missing script ».

---

## 1. Installation

Prérequis : **Node.js 18 ou plus récent**. La base de données est embarquée : aucun logiciel de base de données à
installer. Les données sont dans `backend/data/db`, les documents dans `backend/storage`.

```bash
cd backend
npm install
npm start
```

Ouvrez ensuite **http://localhost:3000**.

- Au premier lancement, `backend/.env` est créé automatiquement (clé secrète aléatoire, e-mail et mot de passe
  temporaire du propriétaire, affichés dans le terminal).
- **Première connexion du propriétaire** : changement obligatoire du mot de passe.
- `OWNER_EMAIL` / `OWNER_PASSWORD` du `.env` ne servent **qu'à la toute première connexion**. Dès que le propriétaire
  s'est connecté une fois, ils sont ignorés : changer le mot de passe dans `.env` ne change plus rien
  (voir [Récupération d'un compte](#3-récupération-dun-compte)).
- Une fois l'installation terminée, installez le [démarrage automatique](#2-démarrage-automatique-windows-et-linux) :
  vous n'aurez plus jamais à taper `npm start`.

> ⚠ **Ne jamais modifier ni partager `JWT_SECRET`** (dans `backend/.env`) : il chiffre les dossiers médicaux.
> Sans lui, les données chiffrées sont illisibles. Gardez-en une copie grâce au
> [kit de récupération](#kit-de-récupération-indispensable).

---

## 2. Démarrage automatique (Windows et Linux)

L'application démarre **toute seule** à l'allumage de l'ordinateur et se **relance toute seule** en cas de problème.

### Installation (une seule fois)

**Windows** : ouvrez un terminal **en administrateur** (clic droit sur Démarrer → « Terminal (administrateur) ») :

```bat
cd C:\chemin\vers\Dental\backend
npm run service:installer
```

- En administrateur : démarrage **à l'allumage du PC, avant toute connexion** (compte système de Windows).
- Sans administrateur : démarrage à l'ouverture de session de l'utilisateur, sans fenêtre.

**Linux** (systemd) :

```bash
cd /chemin/vers/Dental/backend
sudo npm run service:installer     # service système : démarre avec la machine
# ou, sans sudo : service de l'utilisateur (la commande indique comment le faire démarrer sans session ouverte)
```

Vérification : `npm run service:etat` doit afficher « Surveillance : INSTALLÉE » et « Serveur : répond ».

> Si un serveur tourne déjà au moment de l'installation, le service prend le relais au prochain démarrage.
> Pour basculer tout de suite : `npm run service:arreter` puis `npm run service:demarrer`.

### Les trois niveaux de protection

| Niveau | Rôle |
|---|---|
| **Gardien** (vérifie toutes les 30 s) | Relance le serveur s'il **plante**. S'il **se fige** (il tourne mais ne répond plus pendant ≈ 1 min 30, la vérification interroge la base), il l'arrête puis le relance. |
| **Surveillance** (toutes les 5 min) | Si l'application ne répond pas et qu'aucun gardien n'est actif (gardien disparu, PC sorti de veille…), elle la relance. Windows : tâche planifiée « DENTAL LIGHT - surveillance ». Linux : minuterie `dental-light-surveillance.timer`. |
| **Démarrage à l'allumage** | Windows : tâche planifiée « DENTAL LIGHT ». Linux : service `dental-light`. |

**Précautions intégrées :**

- **Jamais deux serveurs sur la même base.** Si le port est déjà occupé, le serveur refuse de démarrer **avant**
  d'ouvrir la base, et le gardien ne lance pas de doublon : il attend et prend le relais quand l'autre s'arrête.
- **Pas de relance en boucle** : attente progressive (3 s → 1 min). Après 5 arrêts en 10 minutes, pause de 5 minutes.
- **Patience au démarrage** : jusqu'à 5 minutes pour les mises à jour de la base avant de considérer le serveur bloqué.
- **Arrêt volontaire respecté** : après `npm run service:arreter`, la surveillance ne relance rien jusqu'à
  `npm run service:demarrer` ou au prochain allumage.

### Commandes

| Commande | Effet |
|---|---|
| `npm run service:installer` | Installe le démarrage automatique et la surveillance |
| `npm run service:etat` | Indique ce qui est installé et si le serveur répond |
| `npm run service:arreter` | Arrête le serveur (arrêt volontaire, la surveillance se met en pause) |
| `npm run service:demarrer` | Relance le serveur (ne fait rien s'il tourne déjà) |
| `npm run service:desinstaller` | Retire le démarrage automatique et la surveillance |

**Journal** : `backend/logs/serveur.log` (démarrages, arrêts, relances, messages du serveur ; archivé à 5 Mo).
Sous Linux aussi : `journalctl -u dental-light`.

---

## 3. Récupération d'un compte

Quatre niveaux, du plus simple au dernier recours. Toutes les méthodes :
**ferment toutes les sessions** du compte, **lèvent le verrouillage**, sont **inscrites au journal** (et dans
l'historique des modifications) avec une **alerte à la direction**, et **n'envoient jamais de mot de passe par e-mail**.
La double authentification est conservée si elle était activée (elle n'est jamais imposée par une récupération).

### Méthode 1 — Lien par e-mail (perte normale du mot de passe)

Page de connexion → **« Mot de passe oublié ? »** → **Lien par e-mail**.

- Lien valable **30 minutes**, utilisable **une seule fois** (seule son empreinte est conservée).
- Réponse identique que le compte existe ou non (impossible de deviner les comptes existants).
- ⚠ Nécessite que l'envoi d'e-mails soit configuré (Profil → réglages e-mail de la clinique).
  Sur un serveur en ligne, définissez `APP_URL` (ex. `https://clinique.exemple.ht`) dans `.env` pour que le lien
  pointe vers la bonne adresse.

### Méthode 2 — Codes de récupération (si l'e-mail n'est plus accessible)

- **Générer** : Profil → **Codes de récupération** → « Générer mes codes » (mot de passe redemandé).
  10 codes affichés **une seule fois**, téléchargeables en `.txt`. En générer de nouveaux annule les anciens.
- **Utiliser** : page de connexion → « Mot de passe oublié ? » → **Code de récupération** : identifiant + un code +
  nouveau mot de passe. Chaque code ne sert qu'**une fois** ; 5 codes faux verrouillent le compte 15 minutes.
- Rangez-les **hors de l'ordinateur** (papier dans un coffre, clé USB).

### Méthode 3 — Commande en console (dernier recours)

Sur **l'ordinateur du serveur** (ou en SSH protégé), **serveur arrêté**
(`npm run service:arreter`, ou Ctrl+C dans sa fenêtre). Cette commande n'existe pas sur Internet.

```bash
npm run recuperation                                             # liste les comptes administrateurs et leur état
npm run recuperation -- debloquer proprietaire@exemple.com       # lève le verrouillage (le mot de passe ne change pas)
npm run recuperation -- reinitialiser proprietaire@exemple.com   # mot de passe temporaire affiché UNE fois
npm run recuperation -- codes proprietaire@exemple.com           # nouveaux codes de récupération
```

L'identifiant peut être l'adresse e-mail **ou** le nom d'utilisateur (ex. `PD320350`).
Relancez ensuite le serveur : `npm run service:demarrer` (ou `npm start`).

### Niveau 4 — Compte propriétaire de secours

Un deuxième compte avec tous les droits du propriétaire, **désactivé** tant qu'on n'en a pas besoin
(utile si le compte principal est perdu ou piraté). Un seul compte de secours possible.

```bash
npm run recuperation -- secours-creer urgence@exemple.ht Marie Dupont   # crée le compte (désactivé)
npm run recuperation -- secours-activer                                  # l'active 24 h, mot de passe temporaire affiché une fois
npm run recuperation -- secours-desactiver                               # le désactive et ferme ses sessions
```

Utilisez une **adresse e-mail différente** du compte principal. Après 24 heures, le compte se coupe tout seul.

### Verrouillage automatique

5 mots de passe faux → compte verrouillé **15 minutes** (il se déverrouille tout seul). Pour débloquer tout de suite :
`npm run recuperation -- debloquer <compte>`. Les employés peuvent aussi demander au propriétaire ou à un
administrateur de réinitialiser leur mot de passe (page Utilisateurs).

---

## 4. Protection des données sensibles

### Historique des modifications (immuable)

Chaque **modification ou suppression** d'une donnée sensible est enregistrée : **ancienne et nouvelle valeur,
auteur, date, poste, motif**. Données suivies : patients, antécédents médicaux, examens, interventions, plans,
rendez-vous, factures, paiements, dépenses, tarifs, comptes et permissions, paie, prothèses, documents, réglages.

- Posé **dans la base** : même une modification faite hors de l'application est enregistrée
  (« Hors application (accès direct à la base) »).
- **Personne ne peut le modifier ni l'effacer** (la base refuse). Il est copié sur Supabase avec le reste.
- **Consulter** : Journal → onglet **« Modifications de données »** (filtres par type, suppressions, avec motif),
  ou dans un dossier patient : menu **⋮ → Historique des modifications**.

### Motif obligatoire

Une fenêtre demande le **motif** (5 caractères minimum) avant d'enregistrer : identité d'un patient, changement de
médecin traitant, **correction** des antécédents / de l'examen / de l'hygiène (la première saisie n'en demande pas),
tarif, statut ou permissions d'un compte, commission, ajustement de paie.

### Mot de passe redemandé (actions critiques)

Créer ou modifier un compte, réinitialiser un mot de passe ou la double authentification, annuler un paiement ou une
facture, corriger une facture, changer la paie, les commissions ou le taux de change, réglages de sécurité ou d'e-mail,
générer des codes de récupération. Valable **10 minutes** ; 5 erreurs → blocage 15 minutes (noté au journal).

### Autres protections

- Mots de passe hachés (bcrypt), sessions par cookie `httpOnly` + `SameSite=Strict`, déconnexion après inactivité ;
  **toutes les sessions sont fermées à chaque redémarrage du serveur** (`KEEP_SESSIONS=true` pour les garder).
- Données médicales **chiffrées** (AES-256-GCM, clé dérivée de `JWT_SECRET`) : antécédents, hygiène, examens, documents.
- Double authentification (application ou e-mail) **facultative** ; obligatoire pour les administrateurs seulement si
  la clinique l'active (réglages de sécurité, ou `REQUIRE_2FA=true`).
- Permissions par rôle, journal d'audit non modifiable, documents accessibles uniquement via l'API authentifiée,
  en-têtes de sécurité (Helmet), limitation de débit sur la connexion et la récupération.

---

## 5. Sauvegardes et copie en ligne (Supabase)

Tout se gère dans la page **Sauvegardes** (propriétaire / administrateurs) :

- **Sauvegarde complète** automatique (chaque jour + hebdomadaire conservée plus longtemps), **différentielle**
  (toutes les 6 h) et **journal des transactions** (toutes les 15 min) : on peut revenir **à la minute près**.
- Chaque sauvegarde est **relue et vérifiée** avant d'être déclarée réussie ; bouton **Vérifier** pour la tester.
- **Miroir** sur un second disque (clé USB, disque externe) : indiquez le dossier dans les réglages.
- **Restaurer** une sauvegarde ou **à un instant précis** (propriétaire, mot de passe demandé).

### Copie en ligne Supabase

Si `SUPABASE_DB_URL` (et/ou `SUPABASE_URL` + `SUPABASE_SERVICE_KEY`) sont définis dans `backend/.env`, **toutes les
tables, tous les documents et les sauvegardes vérifiées** sont envoyés automatiquement **toutes les 2 minutes**
(par le port 443 si les ports PostgreSQL sont bloqués). En cas de perte du PC : Sauvegardes → **Récupérer depuis Supabase**.

### Kit de récupération (indispensable)

Les dossiers médicaux sont chiffrés avec `JWT_SECRET`, qui n'existe que dans `backend/.env` de ce PC.
**Sans ce fichier, les données récupérées de Supabase restent illisibles.**

1. Sauvegardes → **Kit de récupération** (propriétaire, mot de passe demandé) → un fichier texte se télécharge.
2. Rangez-le **hors du PC** (clé USB dans un coffre, copie imprimée), puis supprimez-le des Téléchargements.

**Si le PC est perdu** : installez DENTAL LIGHT sur un nouveau PC → copiez le contenu du kit dans `backend/.env` →
`npm start` → Sauvegardes → **Récupérer depuis Supabase**.

---

## 6. Accès depuis les autres appareils

Sur le même réseau (Wi-Fi ou câble), ouvrez l'adresse affichée au démarrage (ex. `http://10.115.54.228:3000`),
aussi visible dans **Utilisateurs → Accès réseau**.

- Autorisez le port 3000 dans le **pare-feu Windows** si la page ne s'ouvre pas.
- Les réseaux « invités » (ex. `…_Guest`) isolent les appareils entre eux : utilisez le réseau principal.

---

## 7. Données de démonstration

**Clinique de démonstration séparée** (aucun risque pour les vraies données, Supabase coupé) :

```bash
npm run demo                 # http://localhost:3100 — créée au premier lancement (~1 min)
npm run demo -- --reset      # efface et recrée la démo
```

Environ 110 patients fictifs, 240 interventions, 290 rendez-vous, factures, paiements, dépenses, plans, prothèses,
salle d'attente… Comptes et mot de passe : `backend/demo-data/comptes.txt`.

`npm run demo -- --ici` **ajoute** ces données fictives dans la **vraie** plateforme (serveur arrêté). Une copie
complète de la base est faite avant (`backend/data/db.avant-demo-…`), les patients sont marqués « Patient fictif »,
et la liste des éléments ajoutés est écrite dans `backend/data/demo-injection-….json`.
⚠ Ces données comptent alors dans les chiffres réels (caisse, rapports, commissions) et partent sur Supabase.

---

## 8. Mises à jour

```bash
npm run service:arreter        # (ou Ctrl+C si lancé à la main)
git pull
npm install
npm run service:demarrer       # (ou npm start) — les migrations de la base s'appliquent toutes seules
```

---

## 9. Dépannage

| Problème | Solution |
|---|---|
| « Le port 3000 est déjà utilisé » | DENTAL LIGHT tourne déjà (souvent le service automatique) : ouvrez http://localhost:3000. La base n'a pas été touchée. |
| « Missing script » | La commande a été tapée hors du dossier `backend`. |
| Compte verrouillé | Attendre 15 min, ou `npm run recuperation -- debloquer <compte>` (serveur arrêté). |
| Le mot de passe du `.env` ne marche pas | Normal après la première connexion : `npm run recuperation -- reinitialiser <compte>`. |
| « Cette fonction vient d'être ajoutée » | Le serveur n'a pas été redémarré depuis la mise à jour : `npm run service:arreter` puis `service:demarrer`. |
| L'application ne démarre pas | `npm run service:etat`, puis lisez `backend/logs/serveur.log`. |
| La base ne s'ouvre pas (après une coupure de courant) | `npm run restaurer` (repart de la dernière sauvegarde vérifiée, la base actuelle est mise de côté), puis redémarrer. |
| La page ne s'ouvre pas sur un autre appareil | Pare-feu Windows (port 3000), même réseau, pas de réseau « invité ». |

---

## 10. Toutes les commandes

À lancer depuis `backend` :

| Commande | Rôle |
|---|---|
| `npm start` | Démarre le serveur à la main |
| `npm run service:installer` · `etat` · `arreter` · `demarrer` · `desinstaller` | Démarrage automatique et surveillance |
| `npm run recuperation` (+ `debloquer`, `reinitialiser`, `codes`, `secours-creer`, `secours-activer`, `secours-desactiver`) | Récupération des comptes en console (serveur arrêté) |
| `npm run restaurer` | Restaure la dernière sauvegarde vérifiée (base illisible) |
| `npm run demo` (+ `--reset`, `--ici`) | Données de démonstration |
| `npm run migrate` | Applique les migrations de la base |
| `npm test` | Tests d'intégration (base temporaire) |

---

## 11. Structure du projet

```
Dental/
├── backend/
│   ├── src/
│   │   ├── server.js          point d'entrée (connexion, utilisateurs, patients, protections)
│   │   ├── config/env.js      configuration (.env)
│   │   ├── core/              rôles et permissions
│   │   ├── db/                base embarquée + migrations
│   │   ├── lib/               sauvegardes, Supabase, chiffrement, PDF, e-mail…
│   │   └── routes/            facturation, caisse, clinique, planning, salle d'attente,
│   │                          sauvegardes, sécurité, récupération des comptes…
│   ├── scripts/
│   │   ├── service.js         démarrage automatique (Windows / Linux) et surveillance
│   │   ├── service-run.js     gardien du serveur (relance, détection de blocage)
│   │   ├── recuperation.js    récupération des comptes en console
│   │   ├── demo.js            données de démonstration
│   │   └── …                  init-env, setup, migrate, restore-latest
│   ├── data/                  base de données (ne pas modifier à la main, non versionné)
│   ├── storage/               documents patients (non versionné)
│   ├── backups/               sauvegardes (non versionné)
│   ├── logs/                  journal du service (non versionné)
│   └── .env                   configuration et secrets (non versionné — voir le kit de récupération)
├── frontend/                  interface web (HTML / CSS / JS), servie par le backend
├── db/migrations/             schéma SQL versionné (001 … 030)
└── README.md
```
