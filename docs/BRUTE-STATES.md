# Brute charge and recovery increment

Implemented October 31, 2026. Existing type-4 heavy enemies now use explicit **approach, guard, windup, charge, recover and stunned** states in Campaign, Story, Endless and Survival. Chapter names, artwork, scaled health/damage, director cost and elite ground attacks are retained. Boss charges remain owned by the existing boss system.

## Behavior and counterplay

- Brutes approach using existing Story navigation. Within 180 world units and with sight of the hero, they hold their ground while waiting for their cooldown. Guarding grants no armor bonus and causes no contact damage. Losing sight or leaving this range resumes pursuit. This is local engagement behavior; strategic assignment to map chokepoints remains future work.
- A full **0.9-second warning** locks the direction and rush speed. A dashed lane and progress ring mark the attack, clipped to physical cover and map edges. Sidestepping or circling avoids the committed lane.
- The charge lasts **0.8 seconds**, at 5.2 times base movement speed bounded to 220–300 world units/second. Difficulty cannot shorten its warning. Direction and speed do not track the hero after commitment.
- Only one accepted contact hit is possible per charge. Shared swept collision, armor, shield and dash protection apply. Ordinary movement, warning, guard, recovery and stun do not produce generic melee damage or unrelated trait casts.
- Story walls, closed gates, crates and world edges stop the charge at its last safe point. Movement uses segments of at most five world units. Breaking sight during warning or separating beyond 320 units cancels commitment. Stun interrupts warning or an active charge; death cancels all pending work. Ordinary hits without stun do not interrupt it.
- A **1.3-second stationary recovery** leaves an opening after completion, obstruction or interruption. Stun holds the brute still first, then grants the full recovery. The normal cooldown is 4.2 seconds including recovery; interruption uses 2 seconds. New and migrated brutes start with 2.5 seconds of cooldown plus any existing arrival grace.

Chapter 4–6 elite ground attacks are captured through the existing chapter trait definition at warning start, keeping their scaled damage and locked target. They release once when the charge commits, using the existing ground-warning/effect pipeline. Interrupted warnings discard their pending zones. An already released hazard retains its existing independent lifetime. The brute's renderer adds state text, lane/progress cues and existing charge wake effects; it does not mutate gameplay.

## Save compatibility and boundaries

Pause and Continue retain all six states, remaining time, cooldown, locked angle/speed, pending elite zones and the accepted-hit flag. Reloading an active charge cannot damage the player a second time. Older enemies without brute state migrate to approach with the initial cooldown; legacy charge, contact and queued cast fields are cleared. Validation rejects corrupt timers, angles, speeds, hit flags, zone data and brute state attached to foreign types or bosses.

No global AI rewrite, new asset download or bitmap replacement was required. The new module separates state/timing from runtime adapters for terrain, incoming damage, chapter traits and effects.

## Files modified

- New `src/systems/brute.mjs`: configuration, serializable state machine, interruption and validation.
- New `src/systems/brute-renderer.mjs`: read-only lane, progress and state cues.
- `src/engine/runtime.js`: spawn/update adapters, legacy branch replacement, physical segmented movement, swept contact, elite-zone capture/release, pose/facing, death cleanup and migration/validation.
- New `tests/brute.test.mjs` and `tests/brute-integration.cjs`; `tests/gameplay.cjs` and `scripts/check-project.cjs` load and exercise the actual modules.
- `tests/runner-integration.cjs`: the existing brute compatibility assertion now checks its explicit warning state rather than retired legacy fields.
- `README.md`, `docs/IMPLEMENTATION-PLAN.md`, this report, workspace `CURRENT-PROJECT.md` and `work/package-framework.cjs`: current status, backlog and artifact validation. Workspace `work/integrate-brute.cjs` is a one-time editing helper, not a runtime dependency.

## Tests and builds

**280 automated checks passed:** 187 runtime integration checks, 10 lantern, 11 combat, 9 director, 11 Eater, 12 runner, 13 Stalker, 13 archer and 14 brute module checks. The 30 additional checks cover all modes/chapter identities, full warning, locked lanes, one accepted hit, sidesteps, armor/shields/dash, stun through the actual delayed Brawler skill, death, Story cover in all six realms, world edges, guard behavior, arrival grace, all saved states, legacy/corrupt saves, pending elite zones and repeat-hit prevention after Continue. Module checks exercise 20/30/60/144 Hz timing and bounded movement at extreme difficulty.

Native Canvas warning and charge renders were inspected in `tests/brute-warning-field.png` and `tests/brute-rush-field.png`. Render checks verify that drawing leaves state intact and subsequent frames continue. Automated tests also retain existing 600-wave Story, boss skills, character/weapon and resource regressions.

Simulation-only authoring-host timings are recorded in `tests/native-load-benchmark.json` and `tests/archer-load-benchmark.json`. These exclude rendering and do not establish Android or Windows FPS. Dense physical Story terrain-query cost remains a target-device profiling task.

Production TypeScript/Vite build, Capacitor sync, Android debug build and Windows x64 packaging passed. Latest Windows folder: `release/windows-brute/win-unpacked/`. Packaging compares Windows embedded web files and Android entry bundles against the same `dist/` output and records the result in `tests/framework-validation.json`. Windows is unsigned and Android debug-signed. Live browser/native UI, device controls/performance and human full-run balance remain acceptance gates.

## Remaining priority

Next code increment: the **Spectral Mimic's authentic-target and decoy behavior**, followed by Void Warden danger-zone states. Gate each independently. Strategic chokepoint assignment, broader local avoidance, class timing mechanics, map hazards, evolution/events and Nightfall scoring remain on the ordered backlog.
