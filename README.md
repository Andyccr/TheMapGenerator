# Fantasy World Map Generator

A **static**, client-side atlas workshop for writers, game masters, and cartographers. Generate a geographically plausible world from a seed, paint the terrain, rename the towns, and export a JSON save or a high-resolution PNG. There is no backend. The build is a handful of files you can host on GitHub Pages.

Licensed under the [GNU Affero General Public License v3](LICENSE).

## Rendering choice: Canvas 2D

Use **Canvas 2D** as the map view, not SVG.

Thousands of biome polygons plus live sculpting plus pan/zoom is a pixel problem. Canvas applies one transform and fills paths. SVG would create thousands of DOM nodes and stutter when a brush invalidates layout. Hit-testing is a spatial hash plus point-in-polygon. PNG export is `canvas.toBlob`. SVG remains a good *future* overlay for selectable labels; it is the wrong primary renderer for this density. Full rationale: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Quick start

```bash
npm install
npm test
npm run dev
```

Open the printed URL, click **Generate world**, scroll to zoom, drag to pan. **Raise** / **Lower** is the MVP editor: paint land, release, and rivers re-route downhill.

## Project layout

```
index.html
package.json
vite.config.js          # base: './' for GitHub Pages
src/
  main.js               # entry
  styles.css
  types.js              # JSDoc contracts (WorldData, MapGenerator, EditorTool, Renderer)
  data/worldData.js     # JSON factory / clone / parse  — no logic
  generators/           # seed → WorldData
    mapGenerator.js     # pipeline orchestrator
    mesh.js             # jittered hex dual mesh
    noise.js            # simplex fbm (detail only)
    tectonics.js        # plates, strain, elevation
    hydrology.js        # ocean flood, depression fill, rivers
    climate.js          # latitude, rain shadow, Whittaker biomes
    civilization.js     # towns and realms
    names.js            # seed-local phonology
  editors/tools.js      # controlled mutations
  renderers/
    canvasRenderer.js   # read-only view + pan/zoom
    styles.js           # atlas / physical / political / parchment / night
  persistence/storage.js
  ui/app.js             # controller
docs/
  ARCHITECTURE.md
  ALGORITHMS.md
  MVP.md
  DEPLOYMENT.md
```

## Core interfaces

```js
/** Pure JSON. This object is the save file. */
WorldData {
  version: 1,
  meta, cells, plates, rivers, settlements, regions, view, generatedAt
}

class MapGenerator {
  generate(config) -> WorldData
  recomputeFromElevation(world) -> WorldData
}

EditorTool { id, hint, apply(world, pointer, ctx) }

class Renderer {
  draw(world, options)
  screenToWorld / hitTest / pan / zoomAt / renderExport
}
```

Typedefs live in `src/types.js` so a later TypeScript pass is mechanical.

## How a world is born

1. **Mesh** — jittered hex lattice, Lloyd relax, dual circumcenters (Patel).
2. **Plates** — moving continental/oceanic plates; mountains on convergent margins (Turner).
3. **Noise** — low-amplitude simplex wrinkle, never the landmass itself (O’Leary’s critique of fractal islands).
4. **Water** — border flood ⇒ ocean; leftover basins ⇒ lakes; priority-flood ⇒ every cell drains; flux ⇒ rivers that **cannot climb**.
5. **Climate** — north is cold; windward slopes wet; leeward ridges dry; Whittaker biomes.
6. **People** — towns near rivers and coasts; realms grow around capitals with mountain-expensive borders.

Details and code sketches: [docs/ALGORITHMS.md](docs/ALGORITHMS.md). Stepwise MVP: [docs/MVP.md](docs/MVP.md).

## Editing

| Tool | What it is allowed to change |
| --- | --- |
| Pan | Camera only |
| Raise / Lower | `cell.height`, then full hydrology recompute |
| River | Monotonic channel heights, then recompute |
| Move | `settlement.cellId` onto land |
| Rename | `settlement.name` |

## Deploy

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). Short version: enable GitHub Pages from **Actions**, push `main`, use the workflow in `.github/workflows/pages.yml`.

## Inspirations

- Martin O’Leary, *Generating fantasy maps* — https://mewo2.com/notes/terrain/
- Amit Patel, *Polygonal Map Generation for Games* — https://www.redblobgames.com/maps/mapgen2/
- Scott Turner, *Here Dragons Abound* — tectonic and wind-pattern essays on plausible cartography
