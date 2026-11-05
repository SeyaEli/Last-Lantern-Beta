# Combat animation pass

The direction is readable, weighty pixel combat, using [Otherworld Legends' official presentation](https://www.chillyroom.com/en/game-news/11/79) as a quality reference. Last Lantern retains its own characters and existing complete-body art. No ChillyRoom sprites or animations are copied.

- All 31 weapon clips use timing by weapon family. Anticipation holds a readable silhouette, the strike passes quickly through the smear, and recovery settles back into the stance. The damage release and weapon muzzle use the same contact phase and body offset.
- Grounded locomotion remains tied to travelled distance. Contact poses last longer than passing poses, with alternating footfall dust. It stops when the player stops or reaches a wall.
- Struck enemies briefly hold their reaction pose, then recoil away from the attacker. This is a local presentation hold: enemies, projectiles, cooldowns, input and damage keep updating normally. Burn ticks do not retrigger it.
- Melee releases have tapered ribbons; hit sparks fan away from the source. Fatal blows pass their reaction to the corpse and add settling dust. These effects never change position or deal damage.
- Skill anticipation gathers energy around the hero, boss windups compress the body slightly, and boss releases recoil. Existing skill telegraphs and damage geometry remain authoritative.
- Dashes retain complete-body afterimages and add ground launch/landing puffs. Invulnerability now softly pulses the hero instead of making them disappear on alternate frames.

`src/systems/combat-motion.mjs` owns the presentation helpers. WeakMaps keep all transient state out of Continue saves. At most 72 added motion events can be live. Reduced-motion mode removes recoil, contact holds and walking dust, and reduces spark counts.

Validation: `npm test` includes animation timing/continuity checks and six integration scenarios for cosmetic-only damage, pause, Continue, event bounds, footsteps, dash landing and corpse reactions. Existing tests cover all weapon release frames and all eighteen hero skills. `npm run build` checks the browser bundle.

To render the six-hero demonstration in PowerShell:

```powershell
$env:LAST_LANTERN_MOTION_PREVIEW='1'
npm test
```

The preview runs the real game update/render functions through footwork, normal attacks, skills, dodging and a finishing blow. The implementation improves the animation system; it does not claim to replace every frame with newly hand-drawn animation of commercial-game fidelity.
