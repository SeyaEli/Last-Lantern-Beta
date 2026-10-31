# Boss interruption freeze and forest appearance fix

Reproduced the reported Story wave-20 freeze in the native gameplay harness. On the first frame after a Sunburst stun, the boss stagger-guard renderer called Canvas `ellipse` with six arguments instead of the required seven. The exception occurred during drawing, leaving the game loop stopped while DOM controls such as Map and Quest remained clickable.

Fixed the missing start-angle argument in `src/engine/runtime.js`. An AST audit of runtime and lantern-renderer ellipse calls found no other calls missing required arguments. The boss AI itself was not permanently stunned; its simulation had stopped because rendering threw.

The first forest guardian also used `enemy2_4` (a lava creature from the quarry) as fallback artwork because a dedicated `enemy1_4` image does not exist. Forest milestone fallbacks now stay within the existing forest assets. Briar Sentinel uses the existing forest guardian body with a moss palette and thorn shoulder details. This reuses existing art rather than claiming a new bespoke sprite sheet. Boss names, stats, wave schedule, abilities, classes, maps and save state are preserved.

Changed files: `src/engine/runtime.js`, `tests/boss-regression.cjs`, `tests/gameplay.cjs`, this report and the README. Generated test reports and refreshed build archives are updated by verification/packaging.

`npm test` passes **131 checks**: 110 integration, 10 lantern module, 11 combat module. Four new regression checks render staggered bosses in all 30 encounters, prohibit cross-realm forest art fallbacks, resume a staggered boss through Continue and Map/Quest overlays, and run 420 successive update/render frames of the first Story boss with repeated Sunbursts. The first regression reproduced the exact six-argument exception before the fix and passes after it. A native gameplay frame was inspected after the appearance correction.

The production web build, Windows x64 packaging and Android debug build use the standard project commands. These are automated/native checks; live browser/device playtesting was not performed. Existing saves can Continue without resetting progress. Close the previous Windows game before running the updated package from a newly extracted folder.
