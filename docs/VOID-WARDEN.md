# Void Warden danger-zone states

Implemented November 1, 2026 as the next Phase 4 increment. A limited tagged type-2 caster variant now uses explicit **approach, windup, recover and stunned** states in all four modes and six realms. Ordinary archers keep their cover behavior; heroes, weapons, maps, bosses and bitmap assets are preserved.

## Encounter and counterplay

- A Warden approaches using existing navigation and stops around 200 world units away. It can begin a cast within 260 units, after an initial three-second cooldown.
- It locks a **48-unit-radius** ground seal and gives a full **1.2-second warning**. The ring, progress arc, center mark, MOVE label and caster state text identify where to leave. Moving the hero does not move the target.
- After commitment, the seal enters the existing hazard pipeline and erupts after another 0.05 seconds. Its total released lifetime is 0.45 seconds, including the struck visual tail. Damage equals the Warden's existing scaled enemy damage and can be accepted only once per seal. Armor, shield and dash protection use the shared damage resolver.
- Leaving the ring avoids the eruption. Stun, death, broken Story sight, separating beyond 340 units, or newly blocked target terrain cancel the warning. Ordinary hits alone do not interrupt it; stun-producing skills do. Stun freezes the caster first, then grants full recovery.
- Recovery lasts **1.15 seconds**, normal cooldown **5.5 seconds** including recovery, and interruption cooldown **2.5 seconds**. No generic contact damage, archer volley or inherited chapter trait cast runs during these states.

Dead, missing or stunned owners have their remaining seals removed before the hazard damage step. Death cleanup removes only the defeated Warden's zones. Existing boss and ordinary hazards retain their own rules. Warning/recovery art uses existing caster poses and release effects; eruptions use the existing chapter-themed hazard visuals.

## Safe placement and bounded work

Placement tries the hero's position, then eight fixed nearby alternatives. The entire seal circle must fit inside the world and on clear physical Story floor, with sight from its caster. Existing pending hazards and other Warden warnings cannot overlap its placement. A bounded eight-direction escape check requires a clear landing outside the seal and a walkable route from the hero. If none is suitable, the Warden retries after 0.8 seconds instead of forcing a zone into a wall or sealed space. Placement creates no new global path search.

At most **two Wardens** may live, **one may wind up at a time**, and **four owned seals** may exist globally. New seals are also refused once the existing hazard list reaches 120. The seeded director can request at most one Warden per cohort from threat phase 4, with a 20% chance and six-point cost, subject to its budget and live count. Survival reaches that phase at 120 seconds; other modes retain the existing wave-to-threat mapping. New composition rolls may change encounters between builds; repeatability is within the same build, seed and gameplay inputs.

## Saves and compatibility

Pause and Continue retain state timers, locked targets, owner IDs and released seal timers/struck flags. Reloading a struck seal does not repeat damage. Validation rejects corrupt states/targets, duplicate authentic IDs, foreign actor state, orphan seals, malformed zone damage/radius/timing and excess counts. Existing saves without Wardens keep their ordinary enemies. Chapter/wave transitions already clear the hazard list along with actors.

## Files modified

- New `src/systems/void-warden.mjs`: configuration, serializable state machine, interruption, validation and bounded placement candidates.
- New `src/systems/void-warden-renderer.mjs`: read-only warning rings, progress and state cues.
- `src/systems/spawn-director.mjs`: optional budgeted Warden entries, phase/count limits, cost and plan validation.
- `src/engine/runtime.js`: tagged spawning/update, floor/escape/overlap queries, attack poses, shared hazard release, owner cleanup before damage and save validation.
- New `tests/warden.test.mjs` and `tests/warden-integration.cjs`; `tests/gameplay.cjs` and `scripts/check-project.cjs` load the actual modules. The native Canvas harness now requests garbage collection between independent cases when run through `npm test`, releasing temporary fixture buffers. This fixes a test-process image allocation failure without changing production memory behavior.
- `README.md`, `docs/IMPLEMENTATION-PLAN.md`, this report, workspace `CURRENT-PROJECT.md` and `work/package-framework.cjs`: current status, backlog and artifact verification. `work/integrate-warden.cjs` is a one-time editing helper, not a runtime dependency.

## Tests and builds

**324 checks passed:** 212 runtime integration checks plus 10 lantern, 11 combat, 9 director, 11 Eater, 12 runner, 13 Stalker, 13 archer, 14 brute, 9 Mimic and 10 Warden module checks. Warden checks cover all modes/realms, full warnings, fixed targets, safe placement, one accepted hit, leaving the ring, shields/armor/dash, stun/death/cover interruption, already-queued seal cleanup, cast/spawn/zone caps, pause/Continue in every state and after eruption, corrupted saves, arrival grace and the actual delayed Brawler stun skill. Timing is checked at 20/30/60/144 Hz. Existing story, boss, weapon, fuel and enemy regressions pass.

Native Canvas warning and eruption renders were inspected in `tests/warden-warning-field.png` and `tests/warden-eruption-field.png`. Drawing preserves state and subsequent updates continue. The baseline 150-enemy/320-projectile simulation recorded 1.768 ms median / 2.124 ms p95 on the authoring host. The separate dense 24-archer Story fixture recorded 21.129 / 23.763 ms; this remains a profiling concern. Both exclude rendering and are not target-device FPS.

Production TypeScript/Vite, Capacitor sync, Android debug and Windows x64 builds passed. Latest Windows folder: `release/windows-warden/win-unpacked/`. Packaging compares embedded Windows web files and Android entry bundles to the same `dist/` output; actual results are recorded in `tests/framework-validation.json`. Windows remains unsigned and Android debug-signed. Live UI, touch/controller handling, hardware performance, crowded warning readability and human full-run balance remain acceptance gates.

## Remaining priority

All specified enemy archetypes now have individual code/test increments. Next code priority is **bounded shared local avoidance for ordinary mobile enemies**, preserving existing terrain navigation and specialized attack commitment. Strategic brute chokepoint assignment remains open. Class timing mechanics, interactive map hazards, evolution/events and Nightfall scoring follow on the ordered backlog; device acceptance has not been marked complete.
