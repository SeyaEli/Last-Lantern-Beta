# Shadow Stalker light-boundary increment

Implemented October 31, 2026, as the next Phase 4 archetype after the runner. The existing game and remaining archetypes are preserved.

## Scope and encounter rules

The Shadow Stalker is a tagged Woods Wisp variant using the existing Wisp art, a darker body, a broken-crescent marker and explicit state labels. Ordinary Wisps retain their original light-sensitive movement. The other five realms retain their enemies. The Stalker has the Wisp's scaled base health/damage/speed; its distinctive behavior costs two director threat points rather than the ordinary Wisp's one. No existing bitmap assets were replaced.

Its explicit states are **approach, flank, retreat, windup, strike, recover and stunned**. It approaches using existing Story navigation, then circles about 24 units outside the current lantern radius. An eight-unit inner margin and separate retreat threshold prevent rapid switching at the boundary. A fixed four-direction local movement fan checks cover and nearby living bodies. If blocked, it can change its saved circling direction; this is bounded local steering for this archetype, not a rewrite of global avoidance.

- Fueled **Normal** at 30 or more oil holds it outside the light. Moving the light onto it makes it retreat.
- **Dim**, Normal below 30 oil, or exhaustion allow a pounce after circling. Patience is 1.8 seconds, shortened to 0.9 below 30 oil, with an initial 1.5-second cooldown.
- The pounce gives a full **0.75-second warning**, with a marked locked lane and text cue. Its direction and speed then remain fixed for a **0.75-second strike**. Movement speed is 4.8 times base speed with the existing shadow multiplier applied at commitment, capped at 260 world units/second.
- Normal light touching the Stalker during the warning, restoring Normal oil to at least 30, fueled Bright, stun, cover, excessive separation or losing its attack slot cancel the warning. Fueled Bright also interrupts an already committed pounce when it reaches the light. Bright still burns oil at the existing higher rate.
- A sidestep, dash, shield or solid cover counters the committed attack. Ordinary hits do not interrupt it unless their effects produce one of these counters; stun does.
- Recovery lasts **0.9 seconds**, with no movement or contact damage. The post-strike cooldown is 3.6 seconds including recovery; interruption gives a 1.8-second cooldown. Stun additionally holds the actor still before recovery.

Only three Stalkers may be alive and one may warn/pounce at a time. Strikes use five-unit movement segments and the existing swept moving-hero collision/protection timeline. A strike can deal only one accepted hit. Walls, closed gates, crates and world edges stop it at the last safe point. Warning lanes clip to solid terrain. Its old generic contact/trait casting route is bypassed, so it cannot release an extra attack during recovery. It cannot siphon oil or apply automatic damage on exhaustion. An empty lantern still permits normal fighting, movement and refills.

## Seeded spawning and compatibility

The director may add one Stalker per Woods cohort from its mobility phase (30 active seconds in Survival). Chances are 25% at steady fuel, 35% at low fuel, and 40% at critical/empty fuel. The two-point cost and reserved ordinary-enemy slots must fit the existing budget; current crowd, elite, boss and wave rules remain in force. Story elite promotion excludes special resource/light archetypes. Other realms and early cohorts cannot schedule this variant.

Circling side derives from the existing seeded placement phase rather than ambient randomness. State, circle timer, side, locked angle/speed, cooldown and accepted-hit flag survive pause/Continue exactly. Existing expeditions and ordinary Wisp enemies do not acquire a new archetype during migration. Invalid tagged states, foreign chapter/type/boss/elite combinations, and malformed director entries are rejected. RNG compatibility remains additive, but encounter sequences can change between builds when a newly enabled archetype consumes composition rolls; repeatability claims apply to the same build, seed and gameplay inputs.

## Files modified

- New `src/systems/shadow-stalker.mjs`: configuration, light policy, state machine, serializable validation and movement/contact adapter boundary.
- New `src/systems/shadow-stalker-renderer.mjs`: identity, state cues and warning/strike lanes; no simulation mutation.
- `src/systems/spawn-director.mjs`: optional budgeted Woods variants, eligibility/caps, entry costs and validation. Default pure-planner options keep prior callers compatible.
- `src/engine/runtime.js`: spawn/update/validation adapters, local terrain/body steering, swept damage, pose/facing integration, death cleanup, fuel-threat HUD and shared read-only lane clipping with the runner.
- New `tests/stalker.test.mjs` and `tests/stalker-integration.cjs`; `tests/gameplay.cjs` and `scripts/check-project.cjs` load the actual modules and run the checks.
- `README.md`, `docs/IMPLEMENTATION-PLAN.md`, this report, workspace `CURRENT-PROJECT.md` and `work/package-framework.cjs`: status, remaining tasks and artifact validation. `work/integrate-stalker.cjs` is a one-time source-edit helper, not a runtime dependency.

## Tests and validation

`npm test`: **222 checks passed** — 156 real-runtime integration, 10 lantern, 11 combat, 9 director, 11 Eater, 12 runner and 13 Stalker module checks. All previous 195 checks remain covered, including boss interruption rendering, 600-wave Story progression, class weapons, oil, collisions, runner states and seeded Survival.

The 27 new checks cover circling direction/radius, retreat hysteresis, mode and oil thresholds, Bright at critical fuel, full warning, locked aim, 20/30/60/144 Hz strike/recovery/cooldown timing, stun/death/pause, cover, one accepted hit, bounded movement, deterministic budget/cap/realm rules, all seven saved states, old and corrupt saves, dash/shield/armor, empty fuel, arrival grace, physical Story navigation, native rendering and a full crowd fixture. The native warning and pounce images were inspected in `tests/stalker-warning-field.png` and `tests/stalker-pounce-field.png`.

The existing 150-enemy/320-projectile/90-frame simulation fixture measured **0.669 ms median / 1.002 ms p95** on the authoring host. A separate Woods fixture with 150 enemies including three Stalkers and 320 projectiles measured **1.564 / 1.707 ms**. Both exclude rendering and are not browser, Windows UI or Android FPS. They are different scenarios and should not be treated as a controlled speed comparison.

Build targets: production web, Android debug and Windows x64 in `release/windows-stalker/win-unpacked/`. The packaging helper verifies embedded Windows production files and Android entry bundles against the same web output. Windows is unsigned and Android debug-signed; these are testing packages. Generated artifact validation records actual build results.

Live browser/native-window UI, target-device touch/controller handling, full-run human difficulty, crowd readability and hardware performance remain acceptance gates. Automated fixtures do not establish player win rates or final tuning.

## Remaining priority

Next: extract the **cover archer** into explicit positioning, aim/warning, release and recovery states using existing projectiles and cover. Gate that archetype before proceeding to brute, mimic and warden behavior. Broader avoidance, class timing mechanics, map hazards, evolution/events and Nightfall scoring remain on the ordered backlog. This increment stops at the Stalker's code/test gate.
