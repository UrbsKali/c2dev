# Événements & contrôle manuel : ce qui a été fait et pourquoi

Ce document décrit les deux tâches de cette itération, les choix faits et leurs raisons.
L'architecture résultante est résumée dans [`ARCHITECTURE.md`](./ARCHITECTURE.md).

**Tâches demandées**
1. Un système simple d'évènements (notification « il y a un problème »), côté SQL Supabase et Svelte.
2. Un contrôle manuel simple d'un robot (flèches), assez modulaire pour accepter tout type de commande
   (manette PS5, gizmos plus poussés) et pour s'adapter à chaque type d'appareil : **6 appareils au total,
   terrestres, volants, etc.**

---

## 1. Évènements et alertes

### État de départ
La table `events` (gravité, titre, message, acquittement), le store `events`, le feed et les toasts existaient.
Deux manques : les évènements n'étaient émis qu'à la main (bouton de test), et le délai de fermeture des toasts
était écrit en dur (`7000`).

### Ce qui a été ajouté
| Changement | Où |
|---|---|
| Moniteur de santé qui crée des alertes automatiquement | `src/lib/monitoring/` |
| Règles : batterie faible/critique, télémétrie perdue, panne (statut), « recovered » au retour à la normale | `monitoring/rules/` |
| Délais de toast **par gravité** et tous les seuils dans un fichier de config | `src/lib/config/events.ts` |
| Un seul chemin d'affichage (`pushEvent`) pour les évènements locaux et realtime | `stores/events.ts` |
| Colonnes de télémétrie `battery`, `control_profile`, `control_descriptor` | migration SQL |

### Choix et justifications
- **Le moniteur lit le store `robots`**, déjà alimenté par la télémétrie Supabase ou le simulateur. Quand les vrais
  robots enverront leurs données, les alertes se déclencheront sans aucun branchement supplémentaire.
- **Règles = données + une fonction**, une par fichier. Ajouter une alerte = ajouter un fichier et une ligne
  (`monitoring/rules/index.ts`), ou `registerHealthRule()` à l'exécution.
- **Sources externes** (diagnostics ROS, passerelle) : `registerEventSource()`. Elles peuvent pousser des alertes
  que la télémétrie ne permet pas de déduire.
- **Anti-spam** : une alerte n'est émise qu'à l'apparition ou à l'aggravation, pas à chaque tick. La batterie a une
  **hystérésis** (l'alerte ne disparaît qu'au-dessus du seuil + 5 %) pour éviter les allers-retours autour du seuil.
- **La télémétrie perdue est détectée par un minuteur** (toutes les 2 s) : l'absence de message ne déclenche aucun
  évènement, il faut donc vérifier l'âge de la dernière donnée.
- **Toasts** : `info` 7 s, `warning` 12 s, `critical`/`error` restent jusqu'à acquittement (une alerte critique ne
  doit pas disparaître seule). Tout est réglable dans `EVENTS_CONFIG.AUTO_DISMISS_MS`.
- **`HEALTH_CONFIG.PERSIST_EVENTS = false`** : l'application est conçue pour tourner sur plusieurs écrans/onglets,
  et **chaque onglet exécute son moniteur**. Chaque écran affiche donc ses alertes, ce qui est voulu. En revanche
  si chacun écrivait dans la table `events`, on obtiendrait des doublons. À passer à `true` le jour où un seul
  émetteur (passerelle, edge function) écrit les alertes.
- **RLS de `events` inchangée** (lecture/écriture ouvertes en dev) : choix assumé pour la phase de test.

---

## 2. Contrôle manuel modulaire

### État de départ
Clavier et manette fonctionnaient, mais la commande était figée sur deux valeurs (`linear`, `angular`). Le profil
« drone » ne pouvait ni monter, ni s'incliner, ni lancer d'action. Les profils étaient codés en dur dans plusieurs
fichiers (`if (profile === 'drone')`), choisis à la main et mémorisés dans le navigateur, **sans lien avec le robot
sélectionné**.

### Principe
```
entrées (clavier / manette / boutons UI)
        -> trame d'axes { forward: 0.5, turn: -0.2 }
        -> profil d'appareil actif (donnée pure)
        -> Command { command_type, payload }
```
Rien dans cette chaîne ne sait ce qu'est un « tank » ou un « drone » : tout vient du **profil d'appareil**
(`src/lib/teleop/profiles/`).

### Un profil décrit
- ses **axes** (id, libellé, axe de manette par défaut, touches par disposition AZERTY/QWERTY/flèches) ;
- ses **actions** discrètes (armer, décoller, atterrir, retour maison...) ;
- ses **gizmos** (sticks affichés) et son D-pad ;
- son **format d'envoi** (`wire`) : `twist` (linear/angular, compatible ROS) ou `axes` (libre).

Profils fournis : terrestre différentiel, multirotor, omnidirectionnel, Ackermann.

### Choix et justifications
- **Profils = données sérialisables, sans fonctions.** C'est la clé de la modularité : un profil peut venir du
  catalogue aujourd'hui, **ou du robot lui-même demain**. Si la télémétrie contient `control_profile` (id connu) ou
  `control_descriptor` (profil complet en JSON), `resolveProfileForRobot` le valide, l'enregistre (`origin: remote`)
  et le panneau l'utilise, sans changement de code. Les profils intégrés ne peuvent jamais être écrasés par un robot,
  et un descripteur invalide est rejeté.
- **Sélection automatique** : override manuel > profil annoncé par le robot > profil correspondant au `type` du robot
  > profil terrestre par défaut. Plus de risque de piloter un drone avec le profil d'un tank.
- **Ajouter un des 6 appareils** = un fichier dans `profiles/` + une ligne dans `profiles/index.ts`. Ni le clavier,
  ni la manette, ni le panneau, ni l'envoi ne changent.
- **Une trame d'axes générique** plutôt que `linear`/`angular` : un drone a 4 axes, un bras robotique en aurait 6.
  Le profil dit comment les projeter sur la commande.
- **Format `teleop` conservé** pour les profils terrestres : les consommateurs existants (pont ROS) ne cassent pas.
- **Actions** en commande séparée (`command_type = 'action'`), déclenchées une fois à l'appui (détection de front sur
  la manette) pour ne jamais renvoyer « décoller » 60 fois par seconde.
- **Limiteur de vitesse** appliqué par axe, avec exception possible (`scaledBySpeed: false` pour les gaz, afin de ne
  pas faire chuter un drone en le bridant).
- **Arrêt d'urgence universel**, identique pour tous les appareils (touche `K`, boutons B/Cercle, pare-chocs, Select,
  Start) : en situation critique l'opérateur n'a pas à se souvenir d'un réglage par appareil.
- **Préférences par profil** (touches, axes, inversions) enregistrées dans le navigateur, donc modifier le drone
  n'altère pas le rover.
- **Arborescence en domaines** (`teleop/`, `monitoring/`) : le code métier est séparé de l'UI et des I/O, pour que
  le projet puisse grossir sans mélange.

### Conséquences à connaître
- Les anciens stores `gamepadMapping` / `keybindings` et leurs tests sont supprimés (remplacés par `teleop/`).
  Les réglages clavier/manette déjà enregistrés dans un navigateur ne sont plus lus.
- Non vérifié : l'interface dans un navigateur et avec une vraie manette. Les tests couvrent le registre, l'encodage,
  les raccourcis, le pipeline d'envoi et le moniteur (30 tests).

---

## 3. Base de données Supabase

La base du projet contenait déjà `commands` (10 colonnes, `robot_id` et `issued_by` en `uuid`, `status` de type
`command_status`) et `events`. **Aucune structure existante n'est modifiée.**

### Migration `supabase/migrations/20261031_commands_realtime_and_telemetry_fields.sql`
| Ajout | Pourquoi |
|---|---|
| Realtime sur `commands` | Le robot/pont reçoit les ordres instantanément, sans interroger la table en boucle. |
| Index `(robot_id, status)` et `(issued_at DESC)` | Rendre rapide la recherche des ordres en attente d'un robot. |
| `telemetry_points.battery`, `control_profile`, `control_descriptor` (nullables) | Alimenter l'alerte de batterie et la détection de profil par le robot. |

Idempotente : peut être rejouée sans effet de bord. Ce fichier ne touche à aucune politique RLS (voir ci-dessous).

> La migration `20261030_events_and_commands.sql` (table `events`) est déjà appliquée sur la base : ne pas la rejouer
> sauf si la table est recréée.

### Adaptation du code au schéma réel
`sendCommand` n'écrit en base que si `robot_id` est un uuid, et envoie `issued_by = null` quand l'opérateur n'est pas
un uuid (mode test sans connexion). Un robot simulé (`sim-ghost`) reste local. Raison : ces colonnes sont des `uuid`
(`robot_id` est une clé étrangère vers `robots`), et un envoi non conforme serait rejeté.

### RLS sur `commands` : politiques de dev (fichier séparé)
Vérifié sur la base : `relrowsecurity = true` et **aucune politique** sur `commands`. Conséquence : l'application ne
peut ni écrire d'ordre ni en recevoir par realtime (le realtime ne délivre rien à un utilisateur que la RLS empêche de lire).

`20261031_commands_dev_policies.sql` ajoute trois politiques permissives (lecture, insertion, mise à jour pour
`anon` et `authenticated`), alignées sur celles de `events`. Elles sont **volontairement dans un fichier à part** :
c'est le seul changement de sécurité, à exécuter en connaissance de cause et **à remplacer avant la production**
(par ex. insertion réservée aux opérateurs assignés à la mission du robot). La structure de la table n'est pas modifiée.

---

## 4. Appliquer la migration
1. Ouvrir le **SQL Editor** du projet Supabase du compte utilisé pour ce projet.
2. Coller puis exécuter, dans cet ordre :
   - `supabase/migrations/20261031_commands_realtime_and_telemetry_fields.sql` (realtime, index, colonnes) ;
   - `supabase/migrations/20261031_commands_dev_policies.sql` (politiques de dev, nécessaires car la RLS est active).
3. Vérifier :
   ```sql
   select tablename from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'commands';
   select column_name from information_schema.columns where table_name = 'telemetry_points' and column_name in ('battery','control_profile','control_descriptor');
   ```
   (ou, avec la CLI : `supabase db push`).

## 5. Évolutions prévues
- Détection automatique du profil à la connexion du robot : renseigner `control_profile` / `control_descriptor`
  dans la télémétrie (le reste est prêt).
- Passer `PERSIST_EVENTS` à `true` avec un émetteur d'alertes unique.
- Remplacer les politiques de dev de `events` et `commands` par des politiques définitives.
- Actions et gizmos supplémentaires : ajouter des `actions` / `gizmo` aux profils.
