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

## 3. Ocean, lakes, rivers

1. Height `< 0` **and** connected to a map-border cell ⇒ ocean (Patel).
2. Remaining height `< 0` ⇒ lake.
3. Barnes priority-flood fills depressions so every land cell has a downhill path to sea (O’Leary / Planchon–Darboux).
4. Each cell’s `downslope` is the lowest-`filledHeight` neighbor. Flux accumulates from high to low.
5. Cells above a flux threshold become river polylines.

Because routing uses `filledHeight`, **a river cannot climb a ridge**. Editing tools that change height must call `recomputeFromElevation` so this invariant is restored.

## 4. Climate and biomes

- Temperature = latitude (north is cold) minus elevation lapse.
- Precipitation starts high, then an upwind walk (length scales with map span) adds **rain shadow** when it hits higher / mountain cells (Turner).
- Moisture also bleeds from rivers and lakes (Patel).
- Biome = Whittaker lookup on `(temperature, moisture)`, with ocean / lake / beach / ice specials.

## 5. Civilizations

Score land cells for river, coast, lake, moisture; penalize mountains, ice, scorched desert. Poisson-ish spacing and town counts scale with map hypot so a continent is not stuck with a dozen towns. Capitals seed cost-distance realms where mountains cost extra, so borders hug ridges instead of ignoring them.

## Editing as controlled mutation

| Tool | Mutation | Rebuild |
| --- | --- | --- |
| Raise / Lower | `height` brush | hydrology, climate, biomes, realm flood |
| River | force a monotonic height channel | same |
| Move | `settlement.cellId` (land only) | none |
| Rename | `settlement.name` | none |

Editors never write `biome` or `rivers` by hand.

## 6. Cartographic LOD (draw-only)

Zoom does **not** resample the mesh. `WorldData.cells` stay put. The renderer switches bands from relative zoom (`scale / fitScale`):

| Band | Zoom | Paint |
| --- | --- | --- |
| 全图 overview | fit | baked raster, merged biomes, thick coasts, major rivers, capitals |
| 地区 regional | ~1.3–2.5× | sharper raster or vectors, full biomes, more rivers, mountain marks |
| 近景 local | closer | live polygons, hillshade, tributaries, villages, optional cell grain |

Coasts and realm borders are chained polylines cached beside the raster. Editing height invalidates the cache via a cheap height checksum; it never rewrites cell ids or biomes for decoration.
