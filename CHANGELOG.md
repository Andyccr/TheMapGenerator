# Changelog

## 2.1.0

- Editor mutations left the generator layer: founding/deleting towns is `src/editors/settlements.js`; drawing an extra road is `src/editors/routes.js`; `pruneRoutes` / `removeRoutesThrough` are `src/data/routes.js`.
- Landform recipe JSON lives in `src/data/landforms.js`. App overlays steps only through `MapGenerator.applyLandformSteps` and no longer imports `landforms.js`, `rng.js`, or `civilization.js`.
- Stage labels, style ids, and map extents live in catalogs. Undo is `src/ui/history.js`; loading chrome is `src/ui/jobChrome.js`. Architecture tests require App to import only `MapGenerator` from generators.

## 2.0.0

- Architecture: landform / stance / route / recipe-step labels live in `src/data/catalogs.js`. Diplomacy JSON helpers (`tiesFor`, `setStance`, `pruneDiplomacy`) live in `src/data/diplomacy.js`. Generators keep only placement algorithms and re-export for existing tests.
- `src/ui/format.js` imports `data/` only — no generators. Dialogs, inspect chrome, and the landform recipe list are `src/ui/dialogs.js`, `inspectPanel.js`, and `recipePanel.js`. Canvas HUD (compass, scale, grid, measure, draft, highlight) is `src/renderers/hud.js`.
- Architecture tests now fail if any UI helper besides `app.js` / `generateClient.js` imports `generators/`.

## 1.9.0

- First visit opens a welcome instead of generating a huge map: quick start (medium-coarse), examples, or generate with the current settings. Empty canvas has the same shortcuts.
- Generation, rerolls, wind, and recipe-apply can be cancelled (Esc or the overlay button). Jobs no longer stack.
- Replacing a world (generate / example) always confirms. Overwriting a slot confirms. Confirm buttons use the action’s own label.
- Autosave reports failure instead of claiming success. Ctrl+S flushes autosave; Shift+Ctrl+S exports JSON. Drop a `.json` file onto the window to import.
- GitHub Actions Pages publish now includes `icon.svg` and the web app manifest. `file://` shows a banner; noscript and a skip link are present.

## 1.8.0

- Inspector and roster HTML live in `src/ui/format.js`; tool hints are the single Chinese source on each tool class.
- Create a culture or faith on land, or found a realm on a town, then paint to expand. Recolor any named entity that has a color.
- Inspector lists roads through a cell and can delete one route; roster has a 商路 tab.
- **应用风向** restamps climate and biomes only. Height recompute keeps hand-drawn routes, markers, river names, diplomacy, and culture/faith/province paint.
- Worker op `climate`. Tests glob `src`. Manifest icon is `icon.svg`.

## 1.7.0

- Architecture: one catalog for biome / marker / culture / faith / feature labels; the canvas renderer no longer imports generator modules.
- Generation reports climate as its own stage. Recipe-apply and name reroll run in the worker. Dead `addBurg` / `removeBurg` shortcuts (which rebuilt the whole road net) are gone — editors own those mutations.
- Contracts in `types.js` match the real MapGenerator, editor context, and renderer APIs. Persistence docs describe IndexedDB as primary.

## 1.6.0

- Every generated layer is editable: paint biome / culture / faith / realm / province, and change them in the inspector.
- Entity names (including rivers and features) and neighbor diplomacy stances can be rewritten without a reroll.
- Landform recipes can be applied onto the current heightmap; autosave state is visible on the map.
- Erase can drop a road without regenerating the rest of the network. Empty paint pigment samples a cell (eyedrop) and does not push undo until a stroke actually paints.

## 1.5.0

- Campaign workshop: click-to-stamp hills / pits / ranges, click two towns to draw a road or sea lane, population hinterland layer.
- PNG export is a folio plate (title, seed, legend) rather than a bare canvas.
- Example worlds in the header so a first visit can open a finished-looking atlas.
- Rename tool no longer throws when clicking a settlement (`s` was undeclared).

## 1.4.0

- Landform templates are recipes of heightmap steps (hill / pit / range / strait / sink / raise / mask). The left panel lists them; you can add, delete, and reset before generating.

## 1.3.0

- Shareable query strings (`?seed=&landform=&extent=&style=`) so a map can be opened from a link. Header **链接** copies it. Opening a seed URL skips autosave restore.
- Atlas labels: continent and sea names at fit view, realm names at capitals. Zoom in for towns.
- Neighbor diplomacy (ally / peace / rival / war) in the inspector and nation roster.
- Staged generation checklist, confirm before replacing an edited world, burg rank editor in the inspector.
- Cache-busting asset query, web app manifest, Open Graph tags.

## 1.2.0

- Landform templates: continents, pangea, archipelago, island, peninsula, isthmus, inland sea, lakes. Tectonics still carve belts; the template decides the silhouette.
- Religions (folk per culture, organized creeds from great cities) and a dedicated layer.
- Named geographic features: continents, islands, lakes, seas.
- IndexedDB autosave so large maps survive refresh; six named slots beside JSON export.
- Map status bar, header panel toggles, longer toasts, print stylesheet, document title follows the map name.
- Fixed missing `loadLocal` export that blanked the page after the 1.1 persistence wiring.

## 1.1.0

- Cultures, routes, markers, provinces, and layer presets (height / temperature / precipitation / cultural / political).
- Independent society re-roll, search roster, measure tool, notes, help overlay.
- Autosave restores on refresh instead of silently generating a new world.
- Generation runs in a module worker with staged progress; UI no longer freezes the tab.
- Label collision, collapsible panels, in-app dialogs instead of `window.prompt`.
- Pull-request CI (`npm test`).

## 1.0.0

- Plate tectonics, hydrology, climate, biomes, settlements, Canvas 2D atlas with LOD zoom.
