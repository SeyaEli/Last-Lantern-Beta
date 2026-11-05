# Forge risk, recipes and field supplies

Weapons and armor retain their existing stats, seven-star limit and final Awakened upgrade. Every attempt now requires gold and a material recipe. The review dialog shows the actual chance, owned/required quantities, next stats and optional support before anything is spent.

| Target | Base chance | Type-specific fragments | Ember dust | Boss cores | Dawn essence |
|---|---:|---:|---:|---:|---:|
| 1★ | 100% | 4 | 0 | 0 | 0 |
| 2★ | 90% | 7 | 1 | 0 | 0 |
| 3★ | 80% | 11 | 2 | 0 | 0 |
| 4★ | 65% | 16 | 3 | 0 | 0 |
| 5★ | 50% | 23 | 5 | 1 | 0 |
| 6★ | 35% | 32 | 8 | 1 | 0 |
| 7★ | 25% | 44 | 12 | 2 | 0 |
| Awakened | 20% | 60 | 18 | 2 | 1 |

Existing gold costs still scale with item rarity. Weapons consume weapon fragments; armor consumes armor fragments. Failed attempts spend gold and materials, keep all earned stars, and add 10 percentage points to this item's next attempt. Five failures guarantee the next attempt. Success resets this item's failure count. Other items have separate counts.

- An Ember catalyst adds 15 percentage points and is consumed on the attempt. It cannot be selected when the attempt is already guaranteed.
- A Preservation ward keeps all recipe materials on failure. Gold is always spent. The ward is consumed only on failure; catalysts are not protected.
- Missing resources, invalid rolls, unowned equipment and maximum upgrades cannot charge the player. Forge management is blocked during active expeditions.

## Material sources

Ordinary enemies have a 40% chance to drop a weapon or armor fragment, depending on the enemy. Elites give three of each fragment and two dust. Every boss gives eight of each fragment, six dust and one boss core. Each chapter's final boss also gives one dawn essence. Mimic echoes give no materials, and dead enemies cannot be rewarded twice.

Materials are banked immediately, including when a run ends in defeat. The shop sells small fragment/dust bundles. Boss cores and dawn essence must be earned in battle.

## Shop and battle pack

Weapons, Supplies, Camp upgrades and Forge share a category bar. Supplies includes:

| Supply | Gold | Effect |
|---|---:|---|
| Crimson draught | 250 | Restore 35% maximum HP |
| Refined lantern oil | 300 | Restore 35 fuel |
| Emberfang tonic | 900 | +15% outgoing damage for 120 active seconds |
| Ironbark tonic | 900 | +15 percentage points of damage protection for 120 active seconds, capped at 65% |
| Ember catalyst | 1,500 | +15 percentage points on one forge attempt |
| Preservation ward | 2,000 | Preserve recipe materials on a failed attempt |
| Fragment cache | 1,000 | Eight weapon or armor fragments |
| Ember dust pouch | 800 | Six dust |

Use the Pack button or **I** in battle; **R** drinks a health draught. The pack pauses combat. Battle supplies share an eight-second active-time cooldown. Full health/fuel cannot waste a supply; active tonics do not stack. Buffs do not modify permanent gear or base stats. Escape, P or Return to battle closes the pack and resumes play.

Inventory, per-item failure counts, active buffs and supply cooldowns survive save/resume. Older saves receive eight of each fragment, four dust, two draughts and one oil flask exactly once; existing equipment and currency stay intact. Inventory and new expedition fields are validated during import.

## Verification

`npm test` includes deterministic successful/failed forging, pity, catalyst/ward spending, recipes, migration, purchases, potion/tonic effects, active clocks, Continue, reward deduplication and anti-farming checks. `scripts/verify-screens.cjs` exercises Supplies and forge review/attempt/result flows at five viewport sizes and reaches saved Awakened weapon and armor states through the actual buttons.

`scripts/verify-supplies.cjs` verifies catalyst chance updates, a protected failed attempt, purchases, every supply page at four viewport sizes, nine loaded illustrated items, tonic consumption, pack keyboard dismissal and save/resume.

## Item artwork

All nine shop products have individual transparent painted illustrations in `public/assets/supplies/`. Their bindings live in `SUPPLY_ART_FILES` and `src/ui/supply-art.ts`; the field pack and forge support controls reuse the same assets. Cards retain their compact size, with shorter artwork on small landscape screens. Hidden shop pages defer image loading.

Artwork was generated using the built-in image generation tool. The exact final prompts are recorded in [supply-art-prompts.json](supply-art-prompts.json). The generated alpha channels are preserved, and the original generated images remain in the user's generated-images folder.
