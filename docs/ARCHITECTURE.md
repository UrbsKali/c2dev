# Architecture

Détail des choix et de leur justification : [CHANGES-events-and-teleop.md](./CHANGES-events-and-teleop.md).

```
src/lib/
  teleop/        Domaine "contrôle manuel" (indépendant de l'UI)
    types.ts       DeviceProfile, ControlFrame, WireSpec
    profiles/      Catalogue intégré: 1 fichier = 1 type d'appareil
    registry.ts    Registre + résolution robot -> profil + validation de descripteurs distants
    encode.ts      Trame d'axes -> Command (piloté par le profil, aucune logique par appareil)
    bindings.ts    Préférences clavier / manette (par profil, persistées)
    session.ts     Profil actif (override manuel > robot sélectionné > défaut)
  monitoring/    Domaine "alertes automatiques"
    rules/         1 fichier = 1 règle (batterie, télémétrie perdue, panne)
    monitor.ts     Évaluation périodique, anti-spam, escalade, "recovered", sources externes
  services/      I/O (Supabase, websocket, manette, envoi des commandes)
  stores/        État Svelte partagé (robots, events, user...)
  components/    UI
  config/        Constantes réglables (teleop.ts, events.ts) - rien en dur ailleurs
supabase/migrations/   SQL (events; realtime/index de `commands` déjà existante; champs télémétrie)
```

Alias: `$teleop`, `$monitoring`, `$config`, `$services`, `$stores`, `$components`, `$types`.

## Ajouter un type d'appareil
1. Créer `teleop/profiles/<nom>.ts` (axes, actions, `wire`).
2. L'ajouter à `profiles/index.ts`. Rien d'autre à changer (clavier, manette, panneau, envoi).

## Détection automatique à la connexion d'un robot
Un robot peut annoncer son profil via la télémétrie (`control_profile` = id connu,
ou `control_descriptor` = profil complet en JSON). `resolveProfileForRobot` le valide
(`validateProfileDescriptor`), l'enregistre en `origin: 'remote'` et le panneau l'utilise.
Il suffit que la couche de connexion remplisse ces champs. Les profils intégrés ne
peuvent jamais être écrasés par un robot.

## Ajouter une alerte automatique
- Dérivable de la télémétrie: écrire une `HealthRule` et l'ajouter à `monitoring/rules/index.ts`
  (ou `registerHealthRule()` à l'exécution).
- Source externe (diagnostics ROS, gateway): `registerEventSource((emit) => { ...; return unsubscribe; })`.
- Seuils et délais: `config/events.ts` (`HEALTH_CONFIG`, `EVENTS_CONFIG.AUTO_DISMISS_MS`).

`HEALTH_CONFIG.PERSIST_EVENTS` est à `false`: chaque onglet fait tourner son moniteur,
les persister créerait des doublons. À activer quand un seul émetteur (gateway/edge function) existe.
