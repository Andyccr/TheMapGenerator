# Architecture

Fantasy World Map Generator is a **static** browser app. There is no server, no API, and no runtime npm dependency. Vite bundles ES modules into `dist/` for GitHub Pages.

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
  meta: { seed, width, height, cellSize, plateCount, seaLevel, wind, style },
  cells: [ { id, x, y, polygon, neighbors, height, biome, ... } ],
  plates: [ { id, continental, vx, vy, cx, cy } ],
  rivers: [ { id, cellIds, points, width } ],
  settlements: [ { id, cellId, name, type, regionId } ],
  regions: [ { id, name, color, capitalId } ],
  view: { x, y, scale },
  generatedAt: "ISO-8601"
}
```

### MapGenerator

```js
class MapGenerator {
  generate(config: GenerateConfig): WorldData
  recomputeFromElevation(world: WorldData): WorldData
  carveRiver(world: WorldData, cellIds: number[]): WorldData
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

Sculpt tools change `height` only. They **must not** hand-edit `riverId` or `biome`. The generator rebuilds those so water cannot be left inconsistent.

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

SVG is the right call for a few hundred labelled paths (O’Leary’s original maps, Azgaar’s UI overlays). This project targets **medium maps with thousands of polygons** and **live sculpting**, so Canvas is the primary view. A later hybrid — Canvas terrain, SVG labels — is compatible with the renderer contract because labels already live in `WorldData.settlements`.

## Persistence

- `localStorage` key `fwmg-autosave-v1` (debounced)
- Export/import one JSON document
- PNG at 1× / 2× / 3× via an offscreen canvas

No network calls after the page loads.
