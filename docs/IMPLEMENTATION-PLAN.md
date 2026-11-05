# Gameplay enhancement audit and implementation checklist

Specification: `D:/G/Last_Lantern_Codex_Implementation_Plan.docx`, version 1.0, October 31 2026. Audit performed against the framework source, not the historical standalone HTML. The document is development requirements; its example numbers and suggested names are tuning proposals.

## Scope and first increment

The specification's phase table starts with combat fairness, but section 13 explicitly selects a minimal lantern vertical slice as the first coding task. Follow that specific instruction after this audit. Implement only fuel, modes, lighting, refills, warnings, and one existing enemy's light response. Keep all other systems as a prioritized backlog.

The document assumes a three-minute game. The actual game has Campaign and Story with six 100-wave maps plus Endless. Preserve these modes. A separately configured 180-second challenge and its win condition belong to the spawn-director phase; do not replace the existing campaign with a timer. The document's proposed hazard map names also differ from the existing six realms. Reuse the current realms when hazards are developed.

## Architecture and existing implementation

| Area | Actual files and implementation | Status against specification |
|---|---|---|
| Engine and loop | `src/main.ts`, `src/game/LanternScene.ts`: Phaser Canvas scene, single frame loop, delta capped at 50 ms; custom Canvas renderer | Present. Variable-step simulation, not fixed-step collision |
| Gameplay | `src/engine/runtime.js`: closure contains simulation, combat, menus, narrative and many sequential function overrides | Present; large legacy runtime needs gradual module extraction, not a rewrite |
| Inputs | Runtime: WASD/arrows, pointer drag, Shift dash, Space skill, P pause, E/M/Q Story interactions. Scene adds controller movement, A/B/X/Start | Present. Controller menus incomplete |
| Assets | `src/engine/assets.json`, `loadAssets.ts`, `public/assets/`: 188 local images, bounded decoding; complete walking/action atlases and procedural FX | Present; preserve all assets |
| Platforms | `electron/main.cjs`, `src/platform/lifecycle.ts`, `android/`: Electron sandbox/protocol, Capacitor lifecycle save/pause | Present; no Steamworks/store release integration |
| Saves | Runtime `fresh`, `migrate`, `validExpedition`, `packRun`, `resumeRun`, periodic snapshot; local storage and import/export | Present; additive migration required for new state |
| Combat fairness | `src/systems/combat.mjs`: shared incoming-damage resolver and configurable hitboxes; runtime uses swept projectiles, fractional i-frame checks and Story cover ordering; existing contact/cast/boss warnings retained | Code increment tested. Global encounter fairness and device acceptance remain open; see `COMBAT-INCREMENT.md` |
| Bosses | 30 named guardians, 60 skills; full warning/recovery, chains, interrupt/stagger guard, cover checks and death cleanup | Substantially present; preserve, audit remaining edge cases |
| Director | `src/systems/spawn-director.mjs` plus runtime adapters: independent seed streams, bounded safe candidates, Story reachability, budgeted composition and optional 180-second Survival | Code/test increment implemented. Existing modes retain their wave/stat rules. Device tuning remains open; see `SPAWN-DIRECTOR.md` |
| Lantern | `src/systems/lantern.mjs`: carried fuel, three modes, exhaustion, reachable oil, optional pickup values and tracked siphon drain | Implemented code increments. Human economy/balance acceptance remains open |
| Enemy AI | Five regular types per chapter, chapter traits, archers retreat/shoot, brutes wind up charges; Story uses LOS, shared tile BFS and obstacle checks. Eater, runner, Shadow Stalker, cover archer, brute, Mimic and Warden have modular states; brutes guard, warn, charge and recover | Partial. Shared avoidance next; strategic chokepoint placement and broader avoidance remain |
| Classes | Six classes and 18 equipped skills, cooldowns, delayed release, healing zones, shields, sentry and alternate skills | Present differentiation; perfect dodge, charged release, elemental combo and reload timing missing |
| Maps | Six large scrolling realms; Story tile walls, gates, crates, mechanisms, NPCs, navigation; Campaign/Endless scenery mostly non-solid | Partial. No common hazard controller or one distinct interactive hazard per realm |
| Builds | 31 class weapons with unique effects and animations; temporary blessing choices, level damage cap, 200-rank skills and 10 permanent camp tracks | Partial. No prerequisite evolution recipes or curse/trade-off events. Permanent stats are much stronger than the proposed unlock-focused direction |
| Scoring | Local wave records, Endless score and immediate banked gold; objectives and boss rewards | Partial. No event ledger, modifier sets, auditable adjusted scoring or separate challenge tiers |
| Tests | `tests/gameplay.cjs`: native Canvas + DOM harness; 90 baseline integration checks including 600-wave Story and all boss skills | Baseline passes. No current device FPS or visual playtest; native simulation timing is not FPS |

Baseline native load fixture: 150 enemies and 320 projectiles, 90 simulation frames. Existing caps: 150 enemies for high-pressure ordinary waves, 320 projectiles, 250 particles, 90 floating texts, 70 burn zones. Measure the new run against the same fixture; do not call this an Android performance result.

## Ordered checklist and acceptance gates

- [x] P0 / Phase 0: inspect architecture, mechanics, controls, assets, save boundaries and baseline tests.
- [x] P0 / section 13: configurable lantern module; Normal starts at 100 fuel; Dim/Normal/Bright; paused menus freeze consumption; +25 reachable refills; low/critical/exhausted feedback; fuel-sensitive Wisp; save/load and legacy migration; automated tests. Device playtesting remains a release gate.
- [x] P1 / Phase 1 code: shared player-damage resolution, hitbox configuration, swept projectiles, cover ordering, fractional i-frame checks and regression tests for existing warnings/interruption. See `COMBAT-INCREMENT.md`.
- [ ] P1 / Phase 1 acceptance: target-device combat/visual playtest; confirm practical escape routes in crowded high-damage encounters. Automated tests alone do not complete this gate.
- [x] P1 / Phase 2 code: seeded RNG streams, threat budgets, safe/reachable spawns, bounded navigation, arrival delays and a separate 180-second Survival mode. Seed/Continue/cadence tests pass; see `SPAWN-DIRECTOR.md`.
- [ ] P1 / Phase 2 acceptance: device playtesting for spawn readability, crowd pressure, seed/preparation UI, complete-run balance and target FPS.
- [x] P2 / Phase 3 code: interruptible Lantern Eater warning/channel/recovery, fuel-sensitive seeded composition, bounded oil drops, compatible saves and complete scripted challenge economy tests. Zero fuel never auto-kills. See `LANTERN-EATER.md`; 172 total automated checks pass.
- [ ] P2 / Phase 3 acceptance: human full-run economy tuning and target-device counter readability; verify all modes remain winnable. Scripted economy checks do not complete this gate.
- [x] P2 / Phase 4 first code slice: runner approach, full warning, locked-direction rush, recovery and stunned states; solid cover, swept contact, pause/Continue and legacy migration. See `RUNNER-STATES.md`; 195 total automated checks pass. Eater's state machine was implemented in Phase 3.
- [ ] P2 / Phase 4 runner acceptance: target-device warning/animation readability, full-run difficulty and crowded encounter counterplay.
- [x] P2 / Phase 4 second code slice: Woods Shadow Stalker variant, light-boundary circling/retreat, warned pounce, recovery/stun, bounded local steering, seeded budget/caps, save validation and tests. See `SHADOW-STALKER.md`; 222 automated checks pass.
- [ ] P2 / Phase 4 Stalker acceptance: device readability, light/oil tradeoffs and crowded full-run human balance.
- [x] P2 / Phase 4 third code slice: cover archer seek/hide/peek positioning, locked full-warning volleys, release/recovery/retreat/stun, cover interruption, chapter patterns and compatible saves. See `COVER-ARCHER.md`; 250 automated checks pass.
- [ ] P2 / Phase 4 archer acceptance: target-device crowd readability, dense Story performance and human cover counterplay.
- [x] P2 / Phase 4 fourth code slice: brute guard/approach, full warning, locked charge, recovery/stun, solid cover and swept single-hit contact, elite zones, compatible saves and tests. See `BRUTE-STATES.md`; 280 automated checks pass.
- [ ] P2 / Phase 4 brute acceptance: target-device lane/readability, crowded full-run balance and strategic chokepoint assignment.
- [x] P2 / Phase 4 fifth code slice: Spectral Mimic split/illusion/aim/recovery/stun, authentic markers, harmless targetable echoes, reward isolation, seeded budget/caps and validated saves. See `SPECTRAL-MIMIC.md`; 300 automated checks pass.
- [ ] P2 / Phase 4 Mimic acceptance: crowded authentic-marker readability, device performance and human counterplay.
- [x] P2 / Phase 4 sixth code slice: Void Warden placement/windup/recovery/stun, fixed warned zones, safe floor/escape checks, owner cleanup, seeded caps/budgets and compatible saves. See `VOID-WARDEN.md`; 324 automated checks pass.
- [ ] P2 / Phase 4 Warden acceptance: target-device warning readability, movement escape and full-run human balance.
- [ ] P2 / remaining Phase 4: bounded shared local avoidance for ordinary mobile enemies next; strategic brute chokepoint assignment remains open. Gate each archetype before adding the next; broader local avoidance remains open.
- [ ] P2 / Phase 5: reusable ability definitions; one timing mechanic per class; common hazard interface; one telegraphed hazard for each existing realm. Gate each class/hazard independently.
- [ ] P3 / Phase 6: data-driven evolution recipes, meaningful class-compatible upgrade rolls, cursed shrines and risky treasure; prototype balanced progression without deleting purchased upgrades. Gate prerequisites, reset isolation and viable-build playtests.
- [ ] P3 / Phase 7: deduplicated combat event ledger, local seeded run record, selectable Nightfall modifiers, additive bonuses and adjusted scoring. Gate reward idempotency, save/retry correctness and local labeling.
- [ ] Release validation: Windows and Android visual, touch/controller and performance testing on target devices. Profile before adding pools or changing simulation timing.

## File-level plan for the first increment

Add `src/systems/lantern.mjs` for tunable config, serializable state, pure fuel/mode/radius/status logic, bounded deterministic refill candidates and explicit shadow eligibility. Add a small renderer beside it. Integrate through a few named runtime calls at construction, validation, simulation, HUD and drawing. Expose a keyboard/touch/controller action without replacing any existing controls. Add module tests and extend existing integration tests for legacy Continue, pause, fresh runs, chapter travel and pickup collision. Keep gameplay assets untouched.

Run `npm test` and `npm run build` before declaring the increment implemented. Stop at this gate; do not start the other phases in this change.
