# Cover archer positioning and attack states

Implemented October 31, 2026, as the third Phase 4 archetype increment. The existing type-2 ranged enemies in all six chapters now use a modular state machine. Their names, artwork, scaled stats, director cost, chapter volleys and elite ground attacks remain intact. No character, weapon, map or bitmap asset was replaced.

## Behavior and counterplay

The states are **approach, seek, hide, peek, retreat, windup, release, recover and stunned**. Story archers look for a hidden position behind nearby walls, intact crates or closed gates, with a reachable peek position that can see the hero. They move to cover, hide for 0.45 seconds, peek, aim, release once, recover, and return to cover. If no suitable cover exists, they approach to about 185 world units and keep their distance. Campaign, Endless and Survival retain this fallback because their scenery is not physical Story cover.

- A full **0.65-second warning** locks the firing direction and target. A dashed line starts at the actual enemy projectile muzzle; text identifies aiming, volley, recovery, hiding and stun. Existing pose and release effects remain in use.
- Breaking sight to either the current hero or the locked target, entering within 100 units, moving beyond 310 units, stun or death cancels the pending volley. Ordinary hits alone do not interrupt it. Once released, projectiles follow the existing collision rules.
- Close pressure makes the archer retreat until at least 135 units away. It cannot sneak in generic melee/contact damage while retreating or recovering.
- Release lasts 0.16 seconds, followed by 0.65 seconds of stationary recovery. The 2.6-second cooldown includes this time. New arrivals have a 2.2-second initial cooldown in addition to their existing arrival grace. Interrupted attacks impose a 1.2-second cooldown.
- Chapter fan shots and elite zones are captured from the existing trait definitions when aiming begins, then released through the existing cast/projectile/visual pipeline once. Cancellation discards the whole pending volley, including ground effects.

## Navigation, performance and saves

Cover selection examines at most 12 nearby rectangles and two candidate pairs per rectangle. Hidden and peek anchors must be clear, within range, connected, and accessible from the enemy. A two-leg route through the peek point can reach the hidden side. Positions occupied by living actors or reserved by another archer are rejected. One shared planning budget permits at most one fresh cover search per simulation frame; normal refresh is every 2.4 seconds. Invalid or blocked cover is abandoned. Movement uses a bounded five-direction local fan with physical body and path checks, capped at 130 world units/second.

Stationary and cover-directed states skip the shared pursuit navigation query. Sight tests are omitted where the current state does not need them, and unchanged locked/current targets share the warning sight result. This is bounded local navigation, not a global avoidance rewrite.

All state timers, cover anchors, locked aim and the pending volley survive pause and Continue. Old type-2 enemies without the new state start with a fair initial cooldown; their old queued cast is cleared to prevent an immediate inherited shot. Invalid states, missing/malformed cover, timers, angles, foreign actor states and malformed volleys are rejected. Already-released volleys are never queued again on Continue.

## Files modified

- New `src/systems/cover-archer.mjs`: tunable configuration, state machine, bounded cover selection and save validation.
- New `src/systems/cover-archer-renderer.mjs`: read-only aim line and state cues.
- `src/engine/runtime.js`: spawn/update adapters, physical cover and movement queries, existing volley capture/release, pose/facing, death cleanup and compatible save migration.
- New `tests/archer.test.mjs` and `tests/archer-integration.cjs`; `tests/gameplay.cjs` and `scripts/check-project.cjs` load and exercise the actual modules.
- `tests/director-integration.cjs`: the generic arrival/cast fixture now uses an ordinary Specter. Archers have a separate arrival test because they own a longer warning and cancel shots under close pressure.
- `README.md`, `docs/IMPLEMENTATION-PLAN.md`, this report, workspace `CURRENT-PROJECT.md` and `work/package-framework.cjs`: current status, build validation and backlog. `work/integrate-archer.cjs` is a one-time source-edit helper, not a runtime dependency.

## Validation

**250 checks passed:** 171 real-runtime integration checks plus 10 lantern, 11 combat, 9 director, 11 Eater, 12 runner, 13 Stalker and 13 archer module checks. The 28 new checks cover all modes and chapter identities, physical hide/peek/fire/return movement, cover reservation and invalidation, full warning, locked muzzle alignment, chapter/elite volleys, interruptions, arrival grace, pause/Continue, old/corrupt saves, frame-rate timing at 20/30/60/144 Hz, bounded crowds and read-only rendering. Existing boss, 600-wave Story, classes, weapons, fuel and director regressions still pass.

Native Canvas aim, release and Story cover renders were inspected in `tests/archer-aim-field.png`, `tests/archer-release-field.png` and `tests/archer-cover-field.png`.

The existing 150-enemy/320-projectile fixture measured **1.590 ms median / 1.959 ms p95**. A separate 24-archer physical Story fixture measured **12.143 / 13.115 ms** across 90 simulation frames. These are different scenarios on the authoring host, exclude rendering, and are not device FPS. Dense Story terrain queries remain a profiling priority on Android; the bounded planner is not a claim of final mobile performance.

Production TypeScript/Vite build, Capacitor sync, Android debug build and Windows x64 packaging passed. Latest Windows folder: `release/windows-archer/win-unpacked/`. The workspace packaging helper compares Windows embedded production files and Android entry bundles against `dist/`; results are recorded in `tests/framework-validation.json`. Windows is unsigned and Android is debug-signed.

Live browser/Windows/Android UI, target-device performance and human full-run balance were not tested in this increment. These remain release acceptance gates.

## Next priority

Extract the **brute** into explicit approach, charge warning, committed rush, recovery and stunned states while preserving its chapter identities and existing attacks. Gate that increment before mimic/warden behavior or broader avoidance changes. Class timing mechanics, interactive map hazards, build evolution/events and Nightfall scoring remain on the ordered backlog.
