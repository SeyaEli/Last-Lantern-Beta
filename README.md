# Last Lantern — Windows and Android framework project

**Forge and supplies:** enhancements now require material recipes and can fail, with per-item pity, optional catalysts and preservation wards. The Supplies shop sells potions, oil, timed tonics and material bundles; the in-battle Pack button opens usable supplies. See [docs/FORGE-AND-SUPPLIES.md](docs/FORGE-AND-SUPPLIES.md) for odds, recipes, rewards and controls.

**Void Warden implemented:** a limited caster marks a fixed ground seal with a full warning. Leave the ring, stun the caster or break Story sight to counter it. Safe-floor placement, escape checks, owner cleanup and Continue support are included. See [docs/VOID-WARDEN.md](docs/VOID-WARDEN.md) for changed files, tests and remaining work. **324 automated checks pass**; device playtesting remains open.

**Spectral Mimic implemented:** a limited Specter variant creates harmless targetable echoes. Follow the filled diamond to identify the real enemy; hit or stun it to collapse its copies and interrupt the hex. See [docs/SPECTRAL-MIMIC.md](docs/SPECTRAL-MIMIC.md) for changed files, tests and remaining work. Device playtesting remains open.

**Brute states implemented:** heavy enemies guard while waiting, mark a locked charge lane, rush once and recover. Sidestep, stun them or use Story cover; Continue preserves the single-hit flag and pending elite attacks. See [docs/BRUTE-STATES.md](docs/BRUTE-STATES.md) for changed files, tests, tuning and remaining work. Device playtesting remains open.

**Cover archer implemented:** ranged enemies seek physical Story cover, hide, peek, show a locked aim warning, fire once and recover. Breaking sight, close pressure, stun or death cancels pending volleys. Existing chapter patterns and artwork are preserved. See [docs/COVER-ARCHER.md](docs/COVER-ARCHER.md) for changed files, tests, tuning and remaining work. Device playtesting remains open.

**Shadow Stalker implemented:** a Woods Wisp variant circles outside your lantern light and retreats when illuminated. Dim or low oil permits a warned pounce; steady Normal oil holds it back, while fueled Bright can repel an active pounce. Ordinary Wisps and the other chapters retain their behavior. See [docs/SHADOW-STALKER.md](docs/SHADOW-STALKER.md) for changed files, tuning, tests and remaining work. Device playtesting and human balance tuning remain open.

**Runner states implemented:** the existing fast enemies mark a locked rush lane, give a full warning, charge once and recover. Sidestep, dash, shield, use Story cover or stun them. Names, chapter art, director costs, brute and boss behavior are preserved. See [docs/RUNNER-STATES.md](docs/RUNNER-STATES.md).

Interruptible **Lantern Eater** implemented: a visible charge precedes its fuel siphon. Attack, dash, shield, move out of range, break Story line of sight, or switch to Bright to stop it. Fuel-sensitive seeded encounters and bounded 12-oil death drops complete that code increment. See [docs/LANTERN-EATER.md](docs/LANTERN-EATER.md).

Seeded spawn director implemented. Enter a seed in expedition preparation, or choose **Play Survival** for a separate 180-second challenge with six timed threat phases. Existing modes keep their wave progression. See [docs/SPAWN-DIRECTOR.md](docs/SPAWN-DIRECTOR.md) for configuration, tests and limits.

Boss interruption freeze fixed: a missing Canvas ellipse argument stopped rendering when a boss was stunned. Forest milestone bosses also no longer fall back to quarry/frost artwork. See [docs/BOSS-FREEZE-FIX.md](docs/BOSS-FREEZE-FIX.md). Existing expeditions can Continue.

The next combat-fairness increment is implemented: swept projectile collisions, cover ordering, shared damage rules and dodge/i-frame checks. See [docs/COMBAT-INCREMENT.md](docs/COMBAT-INCREMENT.md) for modified files, tests, limits and review instructions. No new controls are required.

The gameplay specification audit and prioritized checklist are in [docs/IMPLEMENTATION-PLAN.md](docs/IMPLEMENTATION-PLAN.md). The first implemented increment adds carried lantern fuel, modes and reachable oil flasks; see [docs/LANTERN-INCREMENT.md](docs/LANTERN-INCREMENT.md) for changed files, tests and remaining work. Press **L**, controller **Y**, or the **Light** button during an expedition. Fuel rules are configurable in `src/systems/lantern.mjs`.

This is the editable framework version of Last Lantern. Phaser 3 owns the scene lifecycle, frame timing and controller polling. Vite builds the application, with TypeScript for the scene and platform layer. Electron packages Windows, and Capacitor supplies the native Android project.

The existing Canvas combat renderer and gameplay rules are preserved in `src/engine/runtime.js`. This is a migration foundation: gameplay has not been rewritten into Phaser physics or individual Phaser sprites. Existing menus remain DOM components, and the engine is JavaScript behind a typed interface. New systems can now be added in separate modules without editing a giant HTML file.

## Start developing

Use Node 22.12+ (Node 24 recommended):

```sh
npm ci
npm run dev
```

`npm run build` creates the offline web assets in `dist/`. `npm test` checks asset paths and runs 324 checks across native engine integration and the lantern, combat, director, Eater, runner, Stalker, archer, brute, Mimic and Warden modules. `npm run preview` serves the production build. This source folder can be uploaded as a Git repository; keep `node_modules`, `dist`, `release`, native build caches and archives out of Git.

## Windows

```sh
npm run desktop
npm run desktop:build
```

The default packaged game is `release/windows/win-unpacked/Last Lantern.exe`; the latest Warden test build is `release/windows-warden/win-unpacked/Last Lantern.exe`. Keep the entire `win-unpacked` folder together: the EXE needs its adjacent files. F11 or Alt+Enter toggles fullscreen. The renderer has no Node access and uses an isolated sandbox. No web server or Internet connection is needed to play the packaged game.

## Android

Install Android Studio, Android SDK 36 and JDK 21. The build helper detects Android Studio's bundled Java on Windows, avoiding an older system Java installation.

```sh
npm run android:debug
npm run android:open
```

The testing APK is `android/app/build/outputs/apk/debug/app-debug.apk`. Install it on your own Android device for testing. This debug-signed APK is not a store release. Generate a signed release bundle in Android Studio for distribution, keep the signing key private, and choose your permanent application ID before publishing.

## Source map

- `src/game/LanternScene.ts`: Phaser scene, frame ownership and combat controller input.
- `src/engine/contracts.ts`: interface between framework and gameplay.
- `src/engine/runtime.js`: preserved combat, story, economy, enemies and bosses.
- `src/engine/assets.json`: named asset registry; `public/assets/` contains 188 separate images.
- `src/platform/lifecycle.ts`: pause/save on backgrounding, Android Back handling.
- `src/styles/`: game UI and mobile safe-area styles.
- `electron/main.cjs`: Windows window, fullscreen and local asset protocol.
- `android/`: native Android Studio project.
- `vercel.json`: Vite deployment settings for this project root.

Keyboard and touch controls are preserved. Controller combat supports left stick/D-pad movement, A skill, B dash, X interaction and Start pause. Menu navigation currently uses mouse/touch/keyboard; full controller menu navigation is not yet implemented.

## Existing saves

Save data uses the same `last-lantern-v2` format. Within the same browser origin, existing saves remain compatible. Windows, Android and your hosted website have separate storage: export from the old game and import through the new game's Import button to transfer progress. There is no automatic cross-device sync. Native app updates should retain app storage; uninstalling or clearing application data can remove it.

## Steam release preparation

The Windows folder is a build you can test and later use as the basis for your Steam depot. This conversion does not upload to Steam or add Steamworks achievements, cloud saves, ownership checks, overlay initialization, or a Steam App ID. Those require your Steamworks project and a deliberate integration. Verify controller/menu flows, test real hardware, and prepare the store/depot configuration before release.

## Verification limits

TypeScript/Vite compilation, Windows packaging, Android debug compilation and 324 automated checks passed for the current increment. Native Canvas Warden warning and eruption renders were inspected. The game was not launched for a new browser, Windows UI or physical Android performance test during this increment. The packaged builds are unsigned Windows / debug-signed Android testing builds. Live device performance, memory pressure, audio interruptions and release signing still need validation.

Framework references: [Phaser](https://docs.phaser.io/), [Electron security](https://www.electronjs.org/docs/latest/tutorial/security/), [Capacitor Android](https://capacitorjs.com/docs/android).

## Official game logo

The supplied Last Lantern logo is preserved at `public/branding/last-lantern-logo.png` and used on the title screen, loading screen and header. Web icons, Windows ICO, Android launcher icons and native splash images derive from that exact artwork. Run `npm run branding` to regenerate platform sizes after replacing the master image. No background removal or lettering redraw is applied.

The in-app title, loading screen and header now use `last-lantern-logo-transparent.png`, a built-in imagegen background-removal variant. The original master remains unchanged. The title emblem is constrained to 440px on desktop and 380px on mobile, with its left edge aligned to the story and actions. Platform launcher icons retain their original supplied artwork.

Story update: The Debt of Dawn now follows Elia’s disappearance across six acts and thirty guardian revelations. Each hero has dialogue, Nox has a chapter-specific conversation, and twelve people/proof consequences feed later introductions and the journal. The two endings reflect the completed journey’s choices. Existing expedition saves remain compatible; start a new Story expedition to read the whole arc in order. Windows story build: release/windows-story/win-unpacked/.
