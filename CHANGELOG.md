# Changelog

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
