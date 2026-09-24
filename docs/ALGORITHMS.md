# Algorithms

Geographic plausibility is the product of **process**, not of prettier noise. The pipeline follows three public lines of work:

- Martin O’Leary — [Generating fantasy maps](https://mewo2.com/notes/terrain/) (irregular mesh, primitives then erosion, depression fill, cities on rivers)
- Amit Patel — [Polygonal map generation](https://www.redblobgames.com/maps/mapgen2/) (dual mesh, ocean-vs-lake flood, Whittaker biomes, moisture from fresh water)
- Scott Turner — *Here Dragons Abound* (wind, shading, and the argument that tectonics should make **chains**, not blobs)

## 1. Polygon mesh

Sites are a **jittered pointy-top hex lattice**, then Lloyd iterations (two on small maps, one when the grid is dense). Dual vertices are circumcenters of each site and two adjacent neighbors — Patel’s dual-mesh idea without a full Delaunay library.

```js
const cc = circumcenter(cell, neighborA, neighborB);
polygon.push([cc.x, cc.y]);
polygon = clipPolygon(polygon, 0, 0, width, height);
```

Jitter stays small (~0.22 spacing) so the hex dual remains a valid triangulation. That avoids the “clumpy random points” O’Leary starts from *and* the hexagonal grid look of an unjittered lattice.

## 2. Plate tectonics

Plates are Voronoi seeds with a velocity and a continental/oceanic flag. Strain on a shared edge is the closing speed of relative velocity along the edge normal:

- both continental, closing → folded mountain chain
- mixed, closing → coastal range on the continental side (subduction cartoon)
- opening → rift, lower elevation

Simplex **fbm is only ±0.09 of relief**, plus a cell-scale wrinkle so finer grids show more micro-relief. Continents come from plates, not from a noise threshold, so you do not get Swiss-cheese landmasses.

Mountain-belt decay, coastal plains, and continental shelves are measured in **world units**, then converted to graph hops with the current `cellSize`. A 2560×1600 map at cell size 7 keeps the same physical shelf width as a small test map.

After tectonics, an optional **landform recipe** (Azgaar-style template) reshapes the coastline with sequenced hills, pits, ranges, and straits. Built-in presets (`pangea`, `archipelago`, `island`, …) are just stored recipes; the default `continents` template has no extra steps so old seeds stay stable. `setLandFraction` then re-picks sea level for the template's land ratio.

## 3. Ocean, lakes, rivers

1. Height `< 0` **and** connected to a map-border cell ⇒ ocean (Patel).
2. Remaining height `< 0` ⇒ lake.
3. Barnes priority-flood fills depressions so every land cell has a downhill path to sea (O’Leary / Planchon–Darboux).
4. Each cell’s `downslope` is the lowest-`filledHeight` neighbor. One thermal slump first sheds a capped slice off slopes steeper than 0.08. Flux then accumulates from high to low.
5. A capped stream-power incision (`E ∝ A^0.45 S`) wears steep, high-flux cells and deposits a fraction downstream. Cells already near sea level are left alone.
6. After climate, flux is weighted by precipitation, so wet belts feed larger rivers than the subtropical desert belt. Cells above a flux threshold become river polylines. Low-gradient reaches meander. A descending sweep assigns Strahler order; width uses mouth flux and that order. Each land cell is labeled with its drainage basin.

Because routing uses `filledHeight`, **a river cannot climb a ridge**. Editing tools that change height must call `recomputeFromElevation` so this invariant is restored.

## 4. Climate and biomes

- Temperature = latitude (north is cold) minus elevation lapse, pulled toward mild on the coast (continentality from one ocean-distance BFS). `tempRange` grows inland and poleward.
- Precipitation starts from a **latitude band** (wet equator, dry subtropics, wet storm track, dry pole). Surface wind is a three-cell circulation (trades, westerlies, polar easterlies) plus the user's wind bias. An upwind walk (capped at 12 steps, and it stops once the shadow is saturated) adds **rain shadow** (Turner). Coasts keep a moisture floor.
- Moisture bleeds from rivers and lakes (Patel) in four neighbor passes. That pass runs after the rivers are laid, so the channel itself raises moisture before biomes are chosen. A wind restamp reuses the rivers already on the map.
- Biome = Whittaker lookup on `(temperature, moisture)`, with ocean / lake / beach / ice specials.
- Applying wind restamps temperature, moisture, and biomes only. Height edits rebuild rivers from the new rain.

## 5. Civilizations

Cultures expand first. A handful of hearths pick a type (河畔 / 沿海 / 山地 / 草原 / 林猎 / 沙海) and a phonology; cost-distance flood prefers matching biomes. Towns are still scored toward rivers and coasts (O'Leary), but their names come from the local culture so neighboring places sound related. Capitals seed political realms afterward — culture and state are not the same layer. Realms then split into **provinces** seated at secondary towns; the flood cannot cross a kingdom border.

Population is a cartographic estimate from type, moisture, and water access. It is for the inspector and roster, not a simulation.

Folk religions follow culture; a few **organized** creeds expand from the largest cities with a limited cost radius so they read as state churches. Connected land and water components become named **features** (continents, islands, lakes, seas). Neighboring realms roll a **diplomacy** stance (ally / peace / rival / war) for the inspector — not a turn-based sim.

## 6. Routes and markers

Roads are A* on the cell graph: mountains cost extra, rivers are cheap corridors, ocean is impassable. Sea lanes only run between coastal towns when the overland path is long. Trails link villages.

Markers are the GM pins: volcanoes on peaks, ruins in the wild, lights on capes, mines near towns, shrines in forest, dragon lairs on remote high peaks. They live in `WorldData.markers` and can be placed or erased by tools.

Rivers pick names from the culture at mid-course.

## Editing as controlled mutation

| Tool | Mutation | Rebuild |
| --- | --- | --- |
| Raise / Lower | `height` brush while drawing; full rebuild on release | hydrology, climate, biomes, culture/realm flood, routes |
| 印戳 | one hill / pit / range blob at the click | same |
| 涂色 | biome / culture / religion / realm / province ids | none |
| 应用到当前图 | landform steps on existing heights | hydrology, climate, society flood |
| River | force a monotonic height channel | same |
| 连路 | append a `routes[]` path between two towns | none |
| 建城 / 擦除 | settlements, markers, or routes through a cell | prune dead roads only (no network reroll) |
| 地标 | `markers[]` | none |
| Move | `settlement.cellId` (land only) | none |
| Rename | name fields | none |
| 测距 | none (overlay) | none |
| 行程 | append a sealed `journeys[]` chronicle (march prefers roads; voyage only if faster) | none |
| 重掷文明 | cultures, towns, realms, routes, markers | terrain untouched |
| 重掷地名 | names only | none |
| 重掷商路与地标 | routes + markers | none |

Sculpt tools never write `biome` or `rivers` by hand; hydrology rebuilds those. The paint tool writes thematic ids (biome / culture / faith / realm / province) without touching height or rivers. Society can be re-rolled without remeshing.

## 7. Cartographic LOD (draw-only)

Zoom does **not** resample the mesh. `WorldData.cells` stay put. The renderer switches bands from relative zoom (`scale / fitScale`):

| Band | Zoom | Paint |
| --- | --- | --- |
| 全图 overview | fit | baked raster, merged biomes, thick coasts, major rivers, capitals |
| 地区 regional | ~1.3–2.5× | sharper raster or vectors, full biomes, more rivers, mountain marks |
| 近景 local | closer | live polygons, hillshade, tributaries, villages, optional cell grain |

Coasts and realm borders are chained polylines cached beside the raster. Editing height invalidates the cache via a cheap height checksum; it never rewrites cell ids or biomes for decoration.
