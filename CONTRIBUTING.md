# Contributing

This is a **static** browser app: `index.html` + `src/` is the product. Do not add a backend, a bundler requirement, or runtime npm dependencies.

## Layout

Four layers, no cycles:

| Folder | May import | Must not |
| --- | --- | --- |
| `src/data/` | nothing in generators/editors/renderers/ui | DOM |
| `src/generators/` | data, util | DOM, canvas |
| `src/editors/` | data, generators (mutation helpers) | canvas drawing |
| `src/renderers/` | data, util, display constants | write `cell.height` |
| `src/ui/` | everything | algorithms that belong in generators |

## Checks

```bash
npm test
python3 -m http.server 8080   # then click through generate / layers / tools
```

`npm test` is Node's built-in runner. Test files live in `src/**/__tests__/` and are listed in `package.json`.

Heavy generation belongs in `MapGenerator` so it can run in `src/workers/generateWorker.js`.

## Pull requests

- Keep WorldData plain JSON (no class methods on the save file).
- Hydrate new optional fields in `hydrateWorld` so old saves still open.
- Prefer Chinese UI copy; keep algorithm comments in English if you wish.
