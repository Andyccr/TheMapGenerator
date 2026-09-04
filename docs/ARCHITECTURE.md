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
| Controller | `src/ui/app.js` + `src/editors/` | Tools mutate; App owns undo, camera, persistence. |
| View | `src/renderers/canvasRenderer.js` | Pan/zoom, hit-test, PNG blit. |

Data never imports generators, editors, or renderers. Generators never import the DOM. The renderer never assigns `cell.height`.

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
  view: { x, y, scale },
  generatedAt: "ISO-8601"
}
```

### MapGenerator

```js
class MapGenerator {
  generate(config: GenerateConfig, onProgress?: (stage: string) => void): WorldData
  recomputeFromElevation(world: WorldData): WorldData
  carveRiver(world: WorldData, cellIds: number[]): WorldData
  regenerateSociety(world: WorldData, seed?: string): WorldData
  regenerateNames(world: WorldData): WorldData
  rebuildRoutesAndMarkers(world: WorldData): WorldData
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

Sculpt tools change `height` only. They **must not** hand-edit `riverId` or `biome`. The generator rebuilds those so water cannot be left inconsistent. Thematic paint (`src/editors/paint.js`) is the exception for biome / culture / faith / realm / province ids — it must not call `recomputeFromElevation`.

### Renderer

```js
class CanvasRenderer {
  draw(world, options): void
  screenToWorld(x, y): {x, y}
  hitTest(world, x, y): cellId
  pan / zoomAt / fit / renderExport
}
```

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

`MapGenerator.generate` accepts an optional `onProgress(stage)` callback. The UI runs it in `src/workers/generateWorker.js` so the tab stays responsive, and falls back to the main thread if workers cannot start.

## Persistence

- `localStorage` key `fwmg-autosave-v1` (debounced). Refresh restores this save instead of generating a new world.
- Export/import one JSON document
- PNG at 1× / 2× / 3× via an offscreen canvas

No network calls after the page loads.
