# Menu artwork

The seven opening-menu illustrations use the reference image supplied by the user, stored at `public/assets/ui/reference-menu.png`.

`src/ui/fantasy-skin.ts` defines an SVG viewport for each entry and clips only the outside scenery. The painted medallions, scenes, lettering, and frames stay together at their original proportions. The previous stretched generic banner and line icons are no longer used for these entries.

Each entry remains a native button with its live label and caption available to assistive technology. Those labels are visually hidden only after the source illustration loads. No new image generation was used for this revision.

On portrait screens the opening layout reserves space for the vertical illustrated menu. Inventory cards and gameplay remain separate views.
