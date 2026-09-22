# Architecture

Fantasy World Map Generator is a **static** browser app. There is no server, no API, and no runtime npm dependency. GitHub Pages serves `index.html` and `src/` directly. Vite is optional, only for local hot reload.

## Four layers

```
UI / App  (controller)
   │
   ├── data/          WorldData — plain JSON, zero methods
   ├── generators/    seed → WorldData  (and elevation → rebuilt water/climate)
   ├── editors/       pointer events → controlled mutations of WorldData
   └── renderers/     WorldData → Canvas 2D pixels  (never writes cells)
```

This is MVC with an extra generator stage:

| Role | Module | Rule |
| --- | --- | --- |
| Model | `src/data/worldData.js` | Serializable snapshot. Import/export *is* the model. |
| Factory | `src/generators/mapGenerator.js` | The only place algorithms run in sequence. |
| Controller | `src/ui/app.js` + `src/editors/` | Tools mutate; App owns undo, camera, persistence. Dialogs / inspect / recipe list / DOM wiring are sibling UI modules. |
| View | `src/renderers/canvasRenderer.js` | Pan/zoom, hit-test, PNG blit. Screen HUD in `hud.js`. |

Data never imports generators, editors, or renderers. Generators never import the DOM, and they do not re-export catalogs or JSON helpers from `data/`. The renderer never assigns `cell.height`, and never imports `generators/` — shared labels live in `src/data/catalogs.js` (biomes, markers, cultures, faiths, features, landforms, stances, route kinds, recipe-step names), hit-testing in `src/util/spatialIndex.js`. Pairwise diplomacy JSON helpers live in `src/data/diplomacy.js`; `generators/diplomacy.js` only *places* ties.

## Core contracts

See JSDoc in `src/types.js`. The TypeScript migration path is: rename to `.ts`, replace `@typedef` with `export interface`.

### WorldData

Plain object, versioned. This is the save file.

```js
{
  version: 1,
  meta: { seed, width, height, cellSize, plateCount, seaLevel, wind, style, societySeed, mapName, landform, landformSteps },
  cells: [ { id, x, y, polygon, neighbors, height, biome, cultureId, provinceId, religionId, featureId, ... } ],
  plates: [ { id, continental, vx, vy, cx, cy } ],
  rivers: [ { id, cellIds, points, width, name } ],
  settlements: [ { id, cellId, name, type, regionId, cultureId, population, note } ],
  regions: [ { id, name, color, capitalId, cultureId } ],
  cultures: [ { id, name, color, type, originId, phonologyId } ],
  routes: [ { id, kind, fromId, toId, cellIds, points } ],
  markers: [ { id, cellId, type, name, note } ],
  provinces: [ { id, name, color, regionId, seatId } ],
  religions: [ { id, name, type, cultureId, color, originId } ],
  features: [ { id, name, type, size, originId, cx, cy } ],
  diplomacy: [ { a, b, stance } ],
  journeys: [ { id, name, cellIds, points, days, leagues, mode, legs } ],
  view: { x, y, scale },
  generatedAt: "ISO-8601"
}
```

### MapGenerator

```js
class MapGenerator {
  generate(config: GenerateConfig, onProgress?: (stage: string) => void): WorldData
  recomputeFromElevation(world: WorldData, onProgress?: (stage: string) => void): WorldData
  recomputeClimate(world: WorldData): WorldData
  carveRiver(world: WorldData, cellIds: number[]): WorldData
  regenerateSociety(world: WorldData, societySeed?: string): WorldData
  regenerateNames(world: WorldData): WorldData
  rebuildRoutesAndMarkers(world: WorldData): WorldData
  applyLandformSteps(world: WorldData, steps: object[]): WorldData
}
```

### EditorTool

```js
{
  id: string,
  hint: string,
  apply(world, pointerEvent, context): void
}
```

Sculpt tools change `height` only. They **must not** hand-edit `riverId` or `biome`. The generator rebuilds those so water cannot be left inconsistent. Thematic paint (`src/editors/paint.js`) is the exception for biome / culture / faith / realm / province ids — it must not call `recomputeFromElevation`. `recomputeFromElevation` rebuilds hydrology and climate, prunes drowned towns/routes/ocean markers, and re-floods realms from remaining capitals. It does **not** regenerate routes, markers, or diplomacy, and it does not re-flood culture / faith / province paint. `recomputeClimate` restamps temperature, moisture, and biomes from `meta.wind` only.

Founding or deleting a town is an editor mutation (`src/editors/settlements.js` + `src/data/routes.js` `pruneRoutes`). Drawing an extra road is `src/editors/routes.js` (pathfind stays in generators). A campaign journey is `src/editors/journeys.js`; day counts live in `src/data/journeys.js` and the march/voyage choice in `src/generators/travel.js`. Placing a marker is `src/editors/markers.js`. The river tool carves through `EditorContext.carveRiver`; stamp asks `recomputeNow`. The generator does not secretly regenerate the road network on those clicks. Landform recipe JSON lives in `src/data/landforms.js`; `MapGenerator.applyLandformSteps` is the only App entry that overlays those steps.

### Renderer

```js
class CanvasRenderer {
  draw(world, options): void
  screenToWorld(x, y): {x, y}
  hitTest(world, x, y): cellId
  pan / zoomAt / fit / centerOn / renderExport / legendItems
}
```

`world.view` is camera state. The renderer may write it. Cells are read-only.

## Rendering: Canvas 2D, not SVG

**Recommendation: Canvas 2D** for terrain, with screen-space chrome (compass, hover card) on top.

| | Canvas 2D | SVG |
| --- | --- | --- |
| 3–5k filled polygons at 60 fps while painting | Comfortable | DOM nodes + style recalc stutter |
| Pan/zoom | One `setTransform` | Transform thousands of elements |
| Hit-testing | Spatial hash + point-in-polygon | Native, but expensive at this count |
| High-res PNG export | `canvas.toBlob` | `XMLSerializer` + `foreignObject` hacks |
| Crisp labels at every zoom | Must redraw text | Scales “for free” |

Style presets include atlas, physical, political, cultural, provinces, height, temperature, precipitation, parchment, and night. Overlay toggles (rivers, routes, markers, relief) are draw-only; they never rewrite cells.

`MapGenerator.generate` reports `mesh → tectonics → hydrology → climate → society → routes`. The UI runs generate / society / routes / recompute / names / climate in `src/workers/generateWorker.js` so the tab stays responsive, and falls back to the main thread if workers cannot start. Live raise/lower preview still recomputes on the main thread (a worker round-trip per brush stroke would hitch). Inspect HTML lives in `src/ui/format.js` and **must not import generators** — labels and diplomacy lookups come from `data/`. Modal chrome is `src/ui/dialogs.js`; inspector selects are `src/ui/inspectPanel.js`; the landform step list is `src/ui/recipePanel.js`; undo lives in `src/ui/history.js`; loading chrome in `src/ui/jobChrome.js`; DOM listeners in `src/ui/bindings.js`. GM-created cultures / faiths / realms live in `src/editors/entities.js`. `runGeneratorJob` returns a promise with `.cancel()` that terminates the worker and does **not** fall back to the main thread. Only `app.js` and `generateClient.js` in `ui/` may import `generators/`, and **App may import only `MapGenerator`**.

## Persistence

- **IndexedDB** database `fwmg-v1` holds the full WorldData autosave and named slots. Maps near the cell cap would overflow `localStorage`. Failed writes surface in the save-state HUD instead of claiming success.
- `localStorage` key `fwmg-autosave-v1` is a small peek/fallback copy; `fwmg-slots-index-v1` stores slot labels.
- Export/import one JSON document
- PNG at 1× / 2× / 3× via an offscreen canvas

No network calls after the page loads.
