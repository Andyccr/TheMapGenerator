# MVP plan

Build in this order. Each step is a shippable static page.

## Step 1 — Mesh + land + Canvas (done in this prototype)

- Jittered hex dual mesh from a seed
- Plate-based elevation, sea level, coastal flood
- Canvas fill of land/ocean, pan and zoom
- **First editor:** raise/lower brush that mutates `height` and rebuilds hydrology

Done when: a seed produces a continent with mountain *chains*, not noise speckles, and painting a ridge updates the coastline.

## Step 2 — Water that obeys gravity (done)

- Depression fill, flux, river polylines
- Lakes as inland basins
- Plausibility tests: rivers never climb

Done when: every river ends in ocean or a lake, and none cross a ridge.

## Step 3 — Climate, biomes, towns (done)

- Latitude temperature, rain shadow, Whittaker biomes
- Settlements scored toward water
- Style presets (atlas, physical, political, parchment, night)

Done when: the far north is not tropical, and most towns sit on rivers or coasts.

## Step 4 — Realms, archive, polish (done at prototype level)

- Cost-distance political regions
- JSON export/import, LocalStorage, high-res PNG
- Rename / move settlement, river-carve tool

## Step 5 — After this prototype

Shipped: cultures, routes, markers, provinces, religions, named features, landform templates with editable heightmap recipes (hill / pit / range / strait), click-to-stamp blobs, click-to-link roads, paint and inspector edits for every thematic layer, diplomacy stance editor, population layer, folio PNG export, example worlds, layer presets, independent society re-roll, search roster, measure, redo, help, autosave restore (IndexedDB + slots), worker generation (including recompute, names, and climate, all cancellable), notes, label collision, status bar, neighbor diplomacy in the inspector. First visit uses a welcome / quick-start instead of a long generate. Shared display catalogs live in `src/data/catalogs.js`. Diplomacy and route JSON helpers live in `src/data/`. Landform recipes live in `src/data/landforms.js`; applying them goes through `MapGenerator.applyLandformSteps`. Founding a town or drawing an extra road is an editor mutation, not a generator pass. App imports only `MapGenerator` from `generators/`. Generators do not re-export `data/` catalogs. DOM listeners live in `src/ui/bindings.js`. Every generated layer can be edited without a full regenerate: paint, inspector selects, names (including rivers), stances, recipe-apply-to-current-map, create culture/faith/realm, recolor, delete a single route, and apply wind without touching height. Height recompute keeps hand-drawn roads, markers, and diplomacy.

Shipped in 2.3.0: campaign journeys (road-preferring march or a faster sea lane, sealed with a day chronicle) and spatial-hash brushes so raise / lower / paint no longer scan the whole mesh per stroke.

Still later:
- Religions as a full simulation (heresy, theocracy)
- Emblems, military, a turn-based diplomacy sim
- 3D globe view
- IndexedDB `.map` interchange with Azgaar
- True Delaunay/Voronoi (Delaunator) at 20k+ cells
- Hydraulic erosion pass (O’Leary)
- SVG overlay for selectable labels
- TypeScript conversion of `src/types.js`

Do not start a mesh rewrite until the four-layer folders still have no circular imports.
