# Lantern Eater and fuel pressure increment

Implemented October 31, 2026, building on the existing lantern and seeded director. Existing heroes, weapons, bosses, maps, wave progression and image assets are preserved. This completes the Phase 3 code increment; human balance and device acceptance remain open.

## Encounter rules

The Lantern Eater uses the existing Wisp body with a distinct hollow-lantern mouth, identity label, animated tether, range warning and charging/channeling poses. These additions use Canvas drawing and existing art, rather than a new bitmap atlas. The HUD announces nearby, charging and active Eaters with counter instructions.

Its explicit states are approach, windup, channel and recovery. It starts charging within 150 world units after an initial 2.5-second cooldown. The warning lasts 1.2 seconds and drains nothing. A complete 2.4-second channel steals 6 fuel per second (14.4 maximum), followed by 0.9-second recovery and a 6-second cooldown. Interruption gives a 4-second cooldown. Configuration lives in `src/systems/lantern-eater.mjs`.

Damage from any hero weapon interrupts the charge or channel. Stun, dash immunity, shields, Story cover, moving beyond the 190-unit tether, and Bright light within the light radius also break it. Bright retains its existing higher passive fuel consumption, so this counter has a resource cost. The Eater does not use the inherited spectral projectiles or contact attack: its attack only drains fuel. Zero fuel never damages or automatically kills the hero, and an empty lantern stops the siphon.

No more than two Eaters may be alive, and only one may charge or channel at a time. Slots are bounded in both the spawn adapter and simulation. Pausing freezes the attack and fuel, and Continue restores its exact warning/channel/recovery state.

## Seeded pressure and refills

Eaters become eligible when the director reaches its ranged-threat phase (60 active seconds in Survival). Each eligible cohort has an 18% selection chance at steady fuel, 38% below 30 fuel and 50% below 10 fuel. Empty fuel schedules no new Eaters. A cohort can include at most one, only when its four threat points and remaining enemy slots fit the existing budget. Fuel level is an explicit deterministic planning input; identical seeds and input sequences produce identical plans.

Low, critical and empty fuel also increase Woods Wisp selection weight. Their existing light-dependent movement is retained. This does not apply universal extra health or speed to other realm enemies, and does not raise existing encounter caps or overwrite campaign scaling.

A defeated Eater drops one 12-oil flask when there is a free pickup slot and a valid placement. Death is rewarded once. All oil shares the existing four-flask cap and 80-second lifetime; periodic 25-oil refills still use the existing 20-second schedule. Collection clamps fuel at 100. Eater drops cannot replace existing flasks. The serialized lantern now tracks actual stolen fuel, and pickups may specify their restoration amount; older saves without these optional fields remain valid. Invalid enemy states or pickup amounts are rejected.

## Files changed

- New `src/systems/lantern-eater.mjs`: serializable state machine, interruption rules and pressure configuration.
- New `src/systems/lantern-eater-renderer.mjs`: warning, tether, motes, mouth and text cues without simulation mutation.
- `src/systems/lantern.mjs` and `lantern-renderer.mjs`: bounded fuel drain, variable-value oil and compatibility validation.
- `src/systems/spawn-director.mjs`: budgeted fuel-sensitive composition and saved-plan validation.
- `src/engine/runtime.js`: navigation/LOS adapter, weapon interruption, save validation, spawn limits, HUD, rendering and deduplicated drops.
- `index.html`: accessible fuel-threat notice.
- New `tests/eater.test.mjs` and `tests/eater-integration.cjs`; `tests/gameplay.cjs` and `scripts/check-project.cjs` run them with existing checks.
- `README.md`, `docs/IMPLEMENTATION-PLAN.md`, workspace `CURRENT-PROJECT.md`, and `work/package-framework.cjs`: status and artifact validation updates.

## Validation

`npm test`: **172 checks passed**: 131 gameplay integration, 10 lantern, 11 combat, 9 director and 11 Eater module checks. All previous 152 checks remain covered, including the interrupted-boss render regression.

Coverage includes full no-drain windup, fractional drain at 20/30/60/144 updates per second, all six heroes interrupting through their actual weapon attacks, dash/shield/Bright/range/cover counters, two-alive/one-casting limits, death and zero fuel, corrupt state rejection, legacy saves, pause/Continue in all attack states, bounded one-time oil drops, deterministic composition/budget checks, and scripted full 180-second refill economies in all three light modes.

The native Canvas fixture `tests/lantern-eater-field.png` was inspected for warning/tether placement. The 150-enemy, 320-projectile, 90-frame simulation fixture measured median **0.610 ms**, p95 **0.938 ms** on the authoring host. This excludes drawing and is not browser, Windows or Android FPS.

Build commands: `npm run android:debug`, followed by Windows packaging into `release/windows-eater/win-unpacked/`. The artifact packager verifies the embedded Windows web files and Android entry bundles against the same production output before distributing the ZIP/APK. The Windows build is unsigned and Android uses a debug signature.

Automated economy scenarios do not establish human balance or prove that every build can win. Live browser/device visuals, touch/controller readability, crowded encounter balance and target hardware performance remain acceptance tasks. No new browser or device playtest was performed for this increment.

## Next priority

Phase 4: extract the runner's charge and recovery into explicit, tested AI states, then gate each remaining archetype separately. The Eater's small state machine is implemented here; the other enemy AI systems have not been rewritten.
