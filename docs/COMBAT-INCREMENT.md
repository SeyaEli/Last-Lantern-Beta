# Combat fairness increment

Implemented the next code priority from the gameplay plan: continuous projectile collision, shared player damage rules, and tested dodge/invulnerability boundaries. The spawn director and later mechanics are unchanged. The existing six classes, 31 weapons, six realms, story, lantern resources and assets are preserved.

## Changes

- Hostile projectiles now sweep their live travel segment against the hero's movement during the simulation frame. Fast shots and moving heroes no longer pass through each other merely because their final positions do not overlap.
- Collision against the hero is ordered against the first Story wall, gate or crate. Cover before the hero blocks the projectile; cover beyond the hero does not erase an earlier hit. Cover wins simultaneous ties. Impact effects use the actual contact point.
- Friendly projectiles sweep enemies in travel order. A non-piercing shot hits the nearest crossed enemy, independent of array order. Piercing shots retain their per-target hit sets across Continue and cannot repeatedly damage the same target.
- Projectiles only move for their remaining lifetime. A shot that expires before reaching a target cannot damage it later in that frame.
- Contact, projectile, ground-hazard and boss damage all call one resolver for armor, shield/invulnerability protection, pause, HP clamping and recovery invulnerability. Existing default damage and recovery durations are preserved. Story contact and ground hazards check line of sight through cover.
- Starting shields/i-frames remain effective until their actual expiry within a frame. A projectile that crossed and exited while protection was active cannot deal retroactive damage after the timer is decremented. An overlapping projectile can hit when protection expires while it is still touching the hero.
- Dash grants its existing 0.45-second immunity and no longer shortens stronger spawn/checkpoint protection. Frame collision context is held in an ephemeral WeakMap and cleared with `finally`; it cannot leak into saves or subsequent direct ability calls.

The circle hitboxes retain existing sizes and locations. Exact tangential grazes do not count as hits. `COMBAT_CONFIG` exposes player-projectile radius, enemy projectile padding, contact padding, terrain projectile radius, armor cap, dash and incoming-damage timing. Enemy sizes and ability shapes still come from existing enemy/skill definitions.

## Files

| File | Change |
|---|---|
| `src/systems/combat.mjs` | New pure swept-circle geometry, moving-target collision, frame protection context, shared damage resolver and tuning |
| `src/engine/runtime.js` | Integrates frame context, sweep ordering, non-mutating terrain trace/commit, shared feedback and damage routes |
| `tests/combat.test.mjs` | Eleven geometry, timing, source-consistency and lifetime checks |
| `tests/combat-integration.cjs` | Ten real gameplay checks across modes, cover, weapons, dodge, pause and Continue |
| `tests/gameplay.cjs` | Loads the real module in the existing native harness and runs the integration suite |
| `scripts/check-project.cjs` | Runs combat module checks before integration |
| `docs/IMPLEMENTATION-PLAN.md`, `README.md` | Checklist and usage/report references |

Generated reports are `tests/combat-results.json`, `tests/gameplay-results.json`, `tests/native-load-benchmark.json` and the packaging validation report. No asset files or save schema version were changed, and no binaries are committed.

## Verification and limits

`npm test` passes **127 checks**: 106 gameplay integration, 10 lantern module and 11 combat module checks. This includes all existing 600-wave Story progression and boss tests. Added tests cover fast crossings at 20/30/60/120/144 updates per second, moving-player crossings, tangent/near misses, fractional protection expiry, short projectile lifetime, nearest-target ordering, piercing hit-set persistence, Story gate ordering, hazard cover, full dodge immunity, stronger existing protection, and pause/Continue.

`npm run build` passes TypeScript and the Vite production build. Existing Vite configuration-loader and bundle-size warnings remain.

Windows x64 (`npx electron-builder --win dir --x64 --config.directories.output=release/windows-combat`) and Android debug (`npm run android:debug`) both build successfully. Packaging verifies the embedded Windows files against `dist` before refreshing downloads.

The native simulation benchmark remains bounded at 150 enemies and 320 projectiles. The current 90-frame sample measures **0.568 ms median / 0.886 ms p95**. The previous increment measured 0.427 / 0.762 ms on this host. Swept collision performs additional geometry work; these short simulation-only samples also include measurement noise and are not Windows/Android FPS measurements. See `tests/native-load-benchmark.json` for exact values.

This is continuous collision within the existing variable-step engine, not a full physics rewrite. Terrain tracing retains the existing bounded 4-pixel samples with binary refinement of the first obstruction. Hero motion is approximated by its start/end segment for that frame; friendly shots sweep against enemies' current positions. Source releases and non-projectile attack decisions still run on existing simulation ticks. Incoming sources are processed in the existing update order, not a globally time-sorted physics event queue. Boss dash/field geometry, warning duration, recovery, interruption and owner cleanup continue through the existing tested systems.

Automated checks do not demonstrate that every crowded encounter has a practical escape route. Target-device visual, controller/touch, performance and combat-counterplay playtests remain an acceptance gate. The native tests do not claim those sessions occurred.

## Run and review

From `Last-Lantern-Framework`, run `npm test`, `npm run build`, then `npm run dev` or `npm run desktop`. Windows and Android packages can be built with the existing commands in the README. No new gameplay controls are required.

In playtesting, dash across fast ranged shots, test projectiles on either side of a Story gate, use piercing weapons against aligned enemies, pause while projectiles are travelling, then Save & return and Continue. Verify warning visibility, impact locations and consistent shield/armor behavior on actual hardware before accepting final tuning.

Next code phase: the seeded threat-budget spawn director and an explicitly separate optional 180-second challenge. Do not replace Campaign, Story or Endless. Outstanding fairness playtests should be recorded alongside that work, rather than marking every Phase 1 acceptance criterion complete from unit tests alone.
