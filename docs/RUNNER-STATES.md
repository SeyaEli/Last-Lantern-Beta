# Runner charge and recovery increment

Implemented October 31, 2026. This is the first remaining Phase 4 archetype increment, following the Lantern Eater. The rest of the enemy roster has not been rewritten.

## Existing implementation and scope

The seeded director already assigns two threat points to type 1, its fast mobility slot, entering the Survival pool from 30 seconds. Previously those enemies fluttered directly toward the hero and used generic warned contact damage. Type 4 already has a separate brute charge. Use type 1 for the specification's runner role, preserving all six chapter identities (Shade Bat, Coal Moth, Icewing, Furnace Moth, Cryptwing and Bloodwing), art, stats and director costs. Leave the brute and boss AI unchanged.

## Implemented behavior

`src/systems/runner.mjs` owns an explicit, serializable state machine: **approach → windup → charge → recover → approach**, with a distinct **stunned** interruption state. Configuration is centralized in `RUNNER_CONFIG`:

| Rule | Value |
|---|---|
| Initial cooldown | 1.5 seconds after arrival grace |
| Begin warning | Within 190 world units, with Story line of sight |
| Minimum full warning | 0.65 seconds |
| Rush | 0.42 seconds, 3.4 × base movement speed, capped at 340 units/second |
| Recovery | 0.8 seconds without movement or contact damage |
| Cooldown after rush | 3.2 seconds, including recovery |
| Cooldown after interruption | 1.8 seconds; stun additionally holds the enemy still |
| Cancel warning | Solid cover, more than 300 units separation, stun or death |

The target direction and rush speed lock when the warning begins. A marked lane, arrow and progress ring show the attack direction. The sprite faces that direction and uses the existing skill/dash poses; recovery and stun have explicit text cues. The lane clips to solid Story terrain and world edges. The hero can sidestep, dash, shield, use cover or stun. Ordinary damage does not cancel the rush; stun skills do. Earthshatter is tested through its actual delayed release.

The rush checks movement in segments of at most five world units. Walls, closed gates, crates and world boundaries stop it at the last safe point and start recovery, rather than steering the committed rush around obstacles. Approach continues to use the existing Story navigation and collision system. Campaign, Endless and Survival retain their current non-solid background scenery.

Damage uses the existing shared armor and invulnerability rules, with a swept moving-hero test over each segment's actual fraction of the frame. A rush can deal only one accepted hit. Warnings, recovery, stun and arrival grace cannot deal contact damage. The runner bypasses its previous generic contact/trait-cast route so those attacks cannot leak through during its recovery. A defeated runner cancels its attack.

All light/fuel mechanics, the Lantern Eater, classes, weapons, maps, assets, difficulty scaling and wave/boss schedules are retained. No new bitmap assets or online dependencies were added.

## Saves and integration

Continue saves the exact runner state, remaining timer, cooldown, locked direction/speed, interruption reason and hit-once flag. Pause freezes the state. Old type-1 enemies without a runner state gain a fresh approach state and initial cooldown; obsolete generic attack fields are cleared to avoid releasing an untelegraphed legacy attack. Invalid runner timers, states, angles, speed, hit flags, or states attached to a different archetype are rejected.

New files:

- `src/systems/runner.mjs`: configuration, state validation, timers, movement intents and interruptions.
- `src/systems/runner-renderer.mjs`: draw-only lane, progress ring and state labels.
- `tests/runner.test.mjs`: 12 module checks.
- `tests/runner-integration.cjs`: 11 real-runtime checks.

Modified files:

- `src/engine/runtime.js`: spawn, migration/validation, runner adapter, navigation, damage and pose/cue integration.
- `src/systems/combat.mjs`: swept rush subsegments against the moving hero and fractional protection timeline.
- `tests/gameplay.cjs`, `scripts/check-project.cjs`: load the actual modules and run the new suites.
- `README.md`, `docs/IMPLEMENTATION-PLAN.md`, this report and workspace `CURRENT-PROJECT.md`: current status and backlog.
- Workspace `work/package-framework.cjs`: runner test count in packaged validation. `work/integrate-runner.cjs` is a one-time edit helper, not a game dependency.

## Validation

`npm test`: **195 checks passed** (142 integration, 10 lantern, 11 combat, 9 director, 11 Eater and 12 runner module checks). All 172 previous checks remain covered, including 600-wave Story progression, all boss skill paths, interrupted-boss rendering, weapons, oil economy and seeded Survival.

The 23 new checks cover full warning timing, fractional charge travel, locked aim, movement and cooldown consistency at 20/30/60/144 updates per second, explicit stun/recovery, death, blocked movement, bounded speed, hit-once behavior, moving-hero crossings, fractional dash/shield expiry, all modes and chapter identities, armor, actual Earthshatter release, arrival grace, old and corrupt saves, pause/Continue, and draw-only warning/rush cues. Native warning and rush screenshots were inspected in `tests/runner-warning-field.png` and `tests/runner-rush-field.png`.

The same native simulation load fixture (150 enemies, 320 projectiles, 90 frames) measured **0.630 ms median / 1.030 ms p95** on the authoring host. This excludes rendering and is not target-device FPS. The previous Eater sample was 0.610 / 0.938 ms; these short samples include host noise.

Build targets are Android debug and Windows x64 in `release/windows-runner/win-unpacked/`. Packaging verifies Windows embedded production files and Android entry bundles against the production web output. Windows remains unsigned and Android debug-signed. The generated artifact validation records build and test status.

Browser/native-window UI, physical Android touch/controller handling, crowded encounter readability and human difficulty tuning remain untested acceptance gates. Automated fixtures establish behavior, not player win rates.

## Remaining priority

Next Phase 4 increment: explicit Shadow Stalker light-boundary positioning and counterplay, built on the existing fuel-sensitive Wisp. Then extract and gate the cover archer, brute, mimic and warden separately. Global local avoidance, class timing mechanics, per-map hazards, evolution/events and Nightfall scoring remain on the ordered backlog. This increment stops after the runner's code/test gate.
