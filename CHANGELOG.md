# Changelog

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
