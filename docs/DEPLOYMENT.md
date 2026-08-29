# Deploy to GitHub Pages

The app is a Vite static build. There is no backend to configure.

## Local

```bash
npm install
npm test
npm run dev      # http://localhost:5173
npm run build    # writes dist/
npm run preview  # serve dist locally
```

`vite.config.js` sets `base: './'` so asset URLs work on project pages *and* on `username.github.io` user pages.

## GitHub Pages via Actions (recommended)

1. In the repository: **Settings → Pages → Build and deployment → Source = GitHub Actions**.
2. Push to `main`. The workflow in `.github/workflows/pages.yml` runs tests, builds, and publishes `dist/`.
3. The site URL is `https://<user>.github.io/<repo>/`.

## GitHub Pages via `/docs` (manual)

```bash
npm run build
rm -rf docs-site && cp -r dist docs-site
```

Then either:

- copy `dist/` contents to a `gh-pages` branch, or
- set Pages to deploy from `/docs` after copying `dist/*` into `docs/` (do not mix with the design docs in `/docs` — prefer Actions).

## Project-site base path

If you ever switch `base` away from `./`, set it to the repo name:

```js
export default defineConfig({ base: "/TheMapGenerator/" });
```

Relative `./` is the safer default.

## AGPL

This project is licensed under the GNU Affero General Public License v3. Serving the built app on Pages is “remote network interaction”: keep the repository public (or otherwise offer Corresponding Source) as AGPL §13 requires.
