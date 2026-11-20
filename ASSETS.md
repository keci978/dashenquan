# Game image delivery

Keep original PNG/WebP artwork in `source-assets/`. Do not serve the originals.
Run `python3 scripts/build-runtime.py` after editing art, JavaScript, or styles. It generates resized transparent WebP assets with content-hashed filenames, the URL manifest, the single game runtime, and the hashed stylesheet.

Application code resolves image names with `assetUrl('logical-name')`; use logical `.webp` references in source CSS. The builder resolves CSS and static HTML references. `dist/assets/` is generated and must not be edited directly. Add newly generated artwork to `source-assets/` and rebuild.

The first scene preloads only the correct Beijing-time day/night yard background. The current-phase room and the first animation frames warm after page load; shop and lottery art warm when those controls are approached or opened. Images in inventory lists use native lazy loading.

Run `npm test` for game-rule and asset-delivery checks. Image budgets are enforced by `tests/asset-delivery.cjs`; `asset-report.json` records dimensions and byte sizes. The image optimizer skips unchanged sources on subsequent builds.
