# Spectral Mimic and authentic-target counterplay

Implemented October 31, 2026 as the next Phase 4 increment. The Mimic is an optional tagged type-3 Specter variant in all six realms and all four modes. Ordinary Specters retain their chapter identity and behavior; heroes, weapons, maps and image assets are preserved.

## Encounter rules

The explicit states are **approach, split, illusion, aim, recover and stunned**. A Mimic approaches using existing Story navigation, stops within engagement range, and gives a full **1-second split warning**. If uninterrupted, it creates up to **two targetable echoes**, waits **2.4 seconds**, then gives a separate **0.75-second aim warning** before firing one locked-direction hex. Recovery is **1.1 seconds**; normal cooldown is **5 seconds**, initial cooldown **3 seconds**, and interruption cooldown **2.5 seconds**. There is no generic melee damage or inherited Specter trait cast during this sequence.

- The real enemy has a **filled diamond** above its existing sprite. Echoes have **hollow diamonds**. State text explains the counter and a dashed muzzle line shows the locked hex direction.
- Echoes use the owner's existing chapter artwork and occupy real target entries. All six hero classes can target and dispel them through normal attacks. They have one HP, never attack, and grant **no kills, gold, experience, loot or corpse rewards**. They can absorb an attack according to its ordinary piercing rules.
- Damaging the authentic enemy collapses only its own echoes and interrupts its pending sequence. Stun and death also clear its copies. Stun holds it still before full recovery.
- Breaking Story sight or leaving 320 units cancels split, illusion or aim. The hex locks its angle at the start of the aim warning, uses the existing projectile/muzzle/effect pipeline at release, and is stopped by normal projectile cover rules.
- Echoes expire after at most 4.5 seconds, disappear when their owner returns to approach, and cannot survive their owner's death. Already-released projectiles retain their normal lifetime.

## Spawning, placement and saves

The seeded director can request one Mimic per cohort from threat phase 3, with a 22% chance, a five-point cost and at most two living Mimics. Existing threat budgets, reserved slots, bosses and elite rules remain active. Survival reaches this phase at 90 seconds; other modes retain their existing wave-to-threat mapping. Encounter sequences can change between builds that add composition rolls; determinism applies to the same build, seed and inputs.

Copy placement tries a fixed fan of six candidates around the owner, accepts at most two, and rejects occupied positions, world edges, solid Story terrain and blocked paths. Copies count against the live actor cap (including Survival's cap); crowded rooms can produce fewer or no echoes. No per-frame global path search or random draw is added for copies. Owner IDs derive from the existing director spawn counter.

All six states, remaining timers, locked angle, copy lifetimes and owner links survive pause and Continue. Validation rejects malformed state, foreign type/boss/elite combinations, duplicate authentic IDs, orphan copies, excess copies and damaging or malformed echoes. Existing saves without Mimics retain their ordinary enemies; no replacement migration is applied. Story elite selection now excludes every tagged special archetype, so it continues to select an ordinary chapter enemy.

## Files modified

- New `src/systems/spectral-mimic.mjs`: state/configuration, interruption, validation and bounded deterministic copy candidates.
- New `src/systems/spectral-mimic-renderer.mjs`: real/echo markers, split progress, state cues and locked aim line; drawing does not mutate combat.
- `src/systems/spawn-director.mjs`: optional budgeted Mimic cohorts, count/phase limits, cost and plan validation.
- `src/engine/runtime.js`: variant spawning, copy creation/cleanup, movement and projectile adapters, attack poses, reward-free echo hits, authentic interruption, save validation and Story elite selection.
- New `tests/mimic.test.mjs` and `tests/mimic-integration.cjs`; `tests/gameplay.cjs` and `scripts/check-project.cjs` load the actual modules and run their checks.
- `README.md`, `docs/IMPLEMENTATION-PLAN.md`, this report, workspace `CURRENT-PROJECT.md` and `work/package-framework.cjs`: current status, backlog and build verification. `work/integrate-mimic.cjs` is a one-time editing helper, not a runtime dependency.

## Validation

**300 checks passed:** 198 runtime integration checks, 10 lantern, 11 combat, 9 director, 11 Eater, 12 runner, 13 Stalker, 13 archer, 14 brute and 9 Mimic module checks. The 20 new checks cover full split/aim warnings, locked firing direction/muzzle, all four modes and six realms, normal attacks from all six classes, reward-free echo hits, independent owners, hit/stun/death/cover cancellation, crowd/placement caps, arrival grace, every saved state, orphan/corrupt saves, deterministic budgeted spawning, pause and frame-rate timing at 20/30/60/144 Hz. Existing Story, boss, weapon, resource and archetype regressions pass.

Native Canvas illusion and aim renders were inspected in `tests/mimic-illusion-field.png` and `tests/mimic-aim-field.png`. Render tests confirm state remains intact and subsequent frames continue. Simulation-only timing records remain in `tests/native-load-benchmark.json` and `tests/archer-load-benchmark.json`; they exclude rendering and are not target-device FPS.

Production TypeScript/Vite, Capacitor sync, Android debug and Windows x64 builds passed. Windows folder: `release/windows-mimic/win-unpacked/`. The packaging helper compares embedded Windows production files and Android entry bundles with the same `dist/` and records actual results in `tests/framework-validation.json`. Windows remains unsigned and Android debug-signed. Live UI, device performance, crowded marker readability and human difficulty acceptance remain open.

## Next priority

Implement **Void Warden danger-zone states** with full placement warnings, safe physical Story positions, interruption/recovery, bounded live zones and compatible saves. Strategic chokepoint assignment, broader avoidance, class timing mechanics, interactive hazards, evolution/events and Nightfall scoring remain on the ordered backlog.
