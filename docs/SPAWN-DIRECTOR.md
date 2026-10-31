# Seeded spawn director and Survival increment

Implemented Phase 2 code from the gameplay specification. The director adds repeatable encounter composition, safe bounded placement and a separate 180-second Survival challenge. Campaign, Story and Endless retain their wave progression, boss milestones, existing difficulty curves, classes, weapons, maps, assets and permanent purchases. The boss-stagger rendering fix remains covered by regression tests.

## How to play

Choose **New Game → Play Survival**. Enter a run seed or leave it blank to generate a new one. Choose an unlocked map and Relaxed, Standard or Veteran threat budget, then begin. Seeds are also available for the existing three modes. The active seed is shown above the arena and in pause; Survival results also display it.

Survival is won by remaining alive for **180 active simulation seconds**. Pause, NPC/menu pauses and blessing selection stop the clock. Enemies may remain alive at the deadline. A guardian is scheduled from 150 seconds, with safe arrival and crowd-cap checks; it is optional with the shipped `requireBoss:false` configuration. Killing it early does not end the challenge. The completion bonus is **2,500 gold**, and this mode does not increment full-campaign victory unlocks. Existing kill/loot rewards still apply. Local best survival time and the last challenge seed/difficulty/map/hero/result are saved; this is not an online leaderboard or an anti-cheat system.

| Active time | Threat phase |
|---|---|
| 0–30 seconds | Basic melee onboarding |
| 30–60 | Runners and mobility pressure |
| 60–90 | Ranged enemies and positioning |
| 90–120 | Elite pressure and mixed enemies |
| 120–150 | Heavy enemies, ranged units and flankers |
| 150–180 | Optional guardian and combined threats |

The director evaluates a new Survival budget every 10 seconds using an absolute saved schedule. Budget is `floor((8 + 35 × (scheduledTime / 180)^1.6) × difficulty)` with time clamped to the run duration. Normal costs are 1/2/3/3/5 for the five existing enemy archetypes; an elite costs 12. Difficulty changes the budget by 0.8/1/1.2. Each cohort is limited to 14 enemies and the full Survival crowd to 84, including the boss. Slots are reserved for the elite and guardian so common mobs cannot permanently fill their space. All values and phase pools live in `DIRECTOR_CONFIG` in `src/systems/spawn-director.mjs`; Survival's bounded health/damage/speed tuning is there as well.

The existing modes also spend budgets for composition at their established spawn intervals or Story-wave boundaries. Their requested bounded counts are retained by reserving enough budget for remaining ordinary enemies. Existing bosses and legacy milestone elites remain separate authored encounters. Campaign/Endless keep their previous vitality/damage progression; this change does not replace their balance with the Survival curve.

## Placement and warnings

Candidate searches stop after 64 attempts. They prefer positions outside the camera where possible, respect map bounds and minimum distance from the player, avoid occupied space and known active hazards, and reject solid Story tiles/gates/crates. Story candidates must be reachable in the active district. A cached flood fill visits at most the district's 108 tile cells; the existing enemy navigation cache is retained rather than adding per-enemy A* searches.

Small Story districts may need visible arrivals. Directed cohorts show a dashed arrival ring, a written countdown and a translucent body, and wait 1.2 seconds before movement/contact/casts. Existing boss summon sigils and their delays are retained. No unsafe candidate is forcibly placed. Blocked Story waves retry on a bounded half-second cadence rather than silently skipping the wave or losing its boss. Far-away ordinary enemies re-enter using the same safe placement checks.

Terrain collision is still implemented primarily in Story. Decorative objects in Campaign/Endless/Survival backgrounds have not been converted to solid obstacles in this increment. Map hazards and broader physical-map work remain in later phases.

## Seed and save behavior

The module hashes a seed of up to 64 characters and uses independent deterministic streams for composition, placement and gameplay events. Critical hits, loot rolls and blessing choices use the event stream. Camera shake, particles and other cosmetic random calls cannot change these streams. Each director saves the stream states, next scheduled tick, counters, last budget plan, special-encounter flags and blocked-Story retry state inside the expedition.

Continue resumes the next plan/candidate exactly under the same world state. Old expeditions with no director data receive a deterministic legacy seed without resetting equipment, money, story or wave progress. Invalid RNG/budget data is rejected before loading. Preparation also normalizes legacy/fresh chapter unlock data before selecting a map.

Seed reproducibility assumes the same build, mode, map, difficulty, build/actions and relevant world state. Player movement, kills, crowd availability and blocked terrain affect which candidates can be accepted. This is not a complete cross-device physics replay or a promise that every run with the same seed will have identical outcomes. Absolute scheduled times do make Survival's budget plans independent of 20/30/60/144 Hz update cadence in the controlled regression fixture.

## Changed files

| File | Purpose |
|---|---|
| `src/systems/spawn-director.mjs` | New balance data, seed hashing/PRNG streams, state validation, budget plans and bounded placement |
| `src/engine/runtime.js` | Mode integration, seed preparation/HUD, safe Story reachability, spawn adapters and arrival rules, event RNG, legacy migration and challenge completion/rewards |
| `index.html` | Fourth mode card, local Survival record and seed/status display |
| `src/styles/platform.css` | Seed field, status wrapping and responsive four-mode layout using existing tokens |
| `tests/director.test.mjs` | Nine module checks |
| `tests/director-integration.cjs` | Twelve real-runtime checks |
| `tests/gameplay.cjs`, `scripts/check-project.cjs` | Load the actual module and run its suites |
| `docs/IMPLEMENTATION-PLAN.md`, this report, `README.md` | Status, instructions, validation and remaining scope |

Generated reports include `tests/director-results.json`, `tests/gameplay-results.json`, `tests/native-load-benchmark.json` and packaged framework validation. No existing image assets were replaced. The packaging helper refreshes downloads; binaries are not committed.

## Validation

- `npm test`: **152 checks passed** — 122 integration, 10 lantern module, 11 combat module and 9 director module checks. The existing 600-wave Story/Campaign progression, all 30 boss skill/interrupt paths, the boss-freeze rendering regression, weapons, lantern, collisions and saves still pass.
- Added coverage: repeat seeds with decorative RNG noise; independent event rolls; exact Continue state and future candidates; plans/deadline at 20/30/60/144 updates per second; safe reachable spawns across all 30 Story combat districts; blocked-boss retry; arrival delay; cap/pause behavior; legacy/corrupt saves; preparation form; complete 180-second simulation with the guardian alive, exactly 18 scheduled budget ticks and no duplicated completion reward.
- The full-duration completion test uses elevated test HP and suppressed player attacks to verify timing, caps and the optional-boss rule. It does **not** establish balance or win rates for unmodified characters.
- `npm run build`: TypeScript and Vite pass. Existing Vite config-loader and large-chunk warnings remain.
- `npm run android:debug` and `npx electron-builder --win dir --x64 --config.directories.output=release/windows-director`: Android debug APK and Windows x64 builds pass. Packaging checks the embedded Windows files and Android web entry/bundles against the final web build.
- Native simulation load fixture: 150 enemies, 320 projectiles, 90 frames; **0.582 ms median / 0.989 ms p95** on the authoring host. Prior combat-fairness sample was 0.568 / 0.886 ms. These short measurements include noise and are not rendered FPS or Android hardware results.
- A native starting-frame image was inspected. Browser DOM layout, touch/controller hardware, target-device FPS, difficulty balance and practical escape routes still need playtesting.

## Run and remaining work

From `Last-Lantern-Framework`, use `npm run dev` or `npm run desktop`, and run `npm test` for verification. `npm run android:debug` builds a local debug APK. Use the seed displayed in a run when reporting an encounter, together with mode, map, difficulty and the build being played.

This increment stops at Phase 2's code/test gate. Next: the remaining light/fuel system, starting with one interruptible Lantern Eater channel and readable fuel pressure. Explicit AI states, class timing mechanics, per-map hazards, evolutions/events and Nightfall scoring remain on the ordered backlog. Device validation and challenge tuning remain open alongside those phases.
