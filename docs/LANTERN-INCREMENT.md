# Lantern vertical slice implementation report

Implemented the first coding task selected by section 13 of the supplied gameplay plan. The audit and ordered backlog are in [IMPLEMENTATION-PLAN.md](IMPLEMENTATION-PLAN.md). Stopped after this increment's test gate; combat refactoring and the other phases have not started.

## Behavior

Every new expedition starts with 100 oil in Normal mode. Press **L**, controller **Y**, or the **Light** button above the arena to cycle Normal → Bright → Dim. Dim has an 80-pixel radius and uses 0.45 oil/second; Normal has 125 pixels and uses 1/second; Bright has 180 pixels and uses 1.7/second. These are provisional specification values.

Every 20 active simulation seconds, the system attempts to place one +25 oil flask in a reachable location near the hero. Flasks last 80 active seconds, at most four exist, and collection is automatic within 22 pixels. Tanks cap at 100. Placement uses bounded, repeatable geometric candidates rather than ambient RNG; the full spawn director is not seeded yet. Blocked placements are skipped and retried at the next interval. No flask is placed through a Story wall/gate, inside a known active hazard, or close to an enemy. This is a simple refill supply for the vertical slice, not final run-economy balancing.

Below 30 fuel, text warns of low oil and Wisps outside the light move 18% faster. Below 10, critical text recommends Dim. At zero, terrain visibility shrinks to 38 pixels with stronger darkness, but no damage or death is applied and all combat controls remain available. Collecting a flask restores illumination. The Woods Wisp is the only affected enemy: while illuminated it moves at 72% speed. Bosses and other families receive no universal light damage or slow.

Darkness draws before actors, projectiles and skill effects so combat counterplay remains readable. A steady dashed light boundary and written warnings avoid relying on color or flashing. Fuel does not drain during pause, dialogue, blessing selection or other paused menus. Existing classes, equipment, assets, quests, wave rules and camp purchases are retained.

Fuel, mode, pickup lifetime/position, refill cadence and counters are saved inside the expedition. Old expeditions without lantern data receive the default state on Continue. Malformed new lantern state is rejected before loading. Chapter travel retains fuel/mode and clears the previous map's flasks. New expeditions reset fuel. Shrine healing fuel is a separate, unchanged resource.

## Files changed

| File | Purpose |
|---|---|
| `src/systems/lantern.mjs` | New pure resource rules, immutable balance configuration, validation, deterministic candidate placement and explicit Wisp eligibility |
| `src/systems/lantern-renderer.mjs` | New Canvas lighting, steady radius boundary, oil-flask art and Wisp response indicator |
| `src/engine/runtime.js` | Named adapters for terrain, save migration, simulation, Wisp movement, HUD, controls and rendering; new listener removed at runtime destruction |
| `src/engine/contracts.ts` | Adds the `lantern` action |
| `src/game/LanternScene.ts` | Maps controller Y to that action |
| `index.html` | Fuel progress bar, numeric readout, mode button and status text outside the arena |
| `src/styles/platform.css` | Responsive fuel-panel layout using existing theme tokens |
| `tests/lantern.test.mjs` | Ten independent module/renderer checks |
| `tests/lantern-integration.cjs` | Six gameplay integration checks |
| `tests/gameplay.cjs` | Loads real modules in the native test harness and invokes the integration suite |
| `scripts/check-project.cjs` | Runs module checks before the full integration suite |
| `docs/IMPLEMENTATION-PLAN.md`, this report, `README.md` | Audit, priorities, acceptance gates, changes and run instructions |

Generated reports: `tests/lantern-results.json`, `tests/gameplay-results.json`, `tests/native-load-benchmark.json`. `tests/lantern-field.png` is a native Canvas inspection image, not a browser screenshot. Packaging updates generated validation reports and distributable archives; no binaries are committed.

## Verification

- Baseline before changes: **90 integration checks passed**.
- `npm test`: **10 module checks + 96 integration checks passed**. Includes equal fuel consumption at 20/30/60/144 updates per second, bounds/zero fuel over 180 seconds, cap/duplicate collection, validation, explicit Wisp eligibility and actual movement, pause, old/new Continue, fresh-run reset, reachable placement across all 36 Story districts, hazard/cover rejection, full existing Story progression, bosses and combat effects.
- `npm run build`: TypeScript and Vite production build passed. Existing bundle-size and Vite config-loader warnings remain.
- `npx electron-builder --win dir --x64 --config.directories.output=release/windows-lantern` and `npm run android:debug`: Windows x64 package and Android debug APK built successfully. The packaging script verifies embedded Windows files against the web build before producing downloads.
- Native load fixture: 150 enemies, 320 projectiles, 90 simulation frames; **0.427 ms median / 0.762 ms p95** on the authoring host. Pre-change sample: 0.402 / 0.654 ms. These short samples include measurement noise and are not device FPS or a mobile performance guarantee.
- Native gameplay image opened and inspected. Browser layout, hardware controller, touch and Windows/Android visual/FPS playtesting have not been performed in this increment.

## Run and verify

From `Last-Lantern-Framework`, use `npm ci` if dependencies are absent, then `npm run dev` for web or `npm run desktop` for Windows development. Use `npm run android:debug` for a local debug APK with the configured Android SDK/JDK. Run `npm test` and `npm run build` for repeatable checks.

Begin an expedition and cycle light using L/Y/the button. Watch fuel fall, pause for several seconds, resume, collect a flask, then Save & return and Continue. Test an exhausted lantern while moving/dashing and verify a refill restores light. In Whispering Woods, compare the same Wisp inside and outside the boundary. Device validation should include a narrow Android viewport and touch play before accepting the tuning.

## Remaining priorities

Next: Phase 1's collision/damage fairness increment, beginning with swept projectile-versus-player collision and configurable hitboxes; the current endpoint check can miss fast projectiles. Then extract damage handling and test dodge/i-frame boundaries. After that, implement the seeded threat director and optional 180-second challenge, remaining fuel enemies, explicit AI states, class timing/hazards, evolutions/events and local modifiers/scoring in checklist order. Fuel balance and darkness readability still require player testing. No other phase is complete from this slice alone.
