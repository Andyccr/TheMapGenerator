# Contributing

This is a **static** browser app: `index.html` + `src/` is the product. Do not add a backend, a bundler requirement, or runtime npm dependencies.

## Layout

Four layers, no cycles:

| Folder | May import | Must not |
| --- | --- | --- |
| `src/data/` | util | generators, editors, renderers, ui, DOM |
| `src/generators/` | data, util | DOM, canvas, editors, renderers |
| `src/editors/` | data, generators (mutation helpers), util | canvas drawing, renderers |
| `src/renderers/` | data, util | `generators/`, write `cell.height` |
| `src/ui/` | everything | algorithms that belong in generators |

Shared names (biomes, marker glyphs, culture/faith/feature labels) live in `src/data/catalogs.js`. Hit-testing hashes live in `src/util/spatialIndex.js` so the canvas renderer never imports a generator module.

## Checks

```bash
npm test
python3 -m http.server 8080   # then click through generate / layers / tools
```

`npm test` is Node's built-in runner. It recursively runs `src/**/__tests__/*.test.js`.

Heavy generation belongs in `MapGenerator` so it can run in `src/workers/generateWorker.js`.

## Pull requests

- Keep WorldData plain JSON (no class methods on the save file).
- Hydrate new optional fields in `hydrateWorld` so old saves still open.
- Landform presets live in `src/generators/landforms.js` as recipes; keep `continents` step-free so tectonic seeds stay stable.
- Prefer Chinese UI copy; keep algorithm comments in English if you wish.
