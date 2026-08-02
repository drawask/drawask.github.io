# CadChat (DrawAsk)

Open a DWG/DXF in the browser, explore the drawing, then copy a clean pack and chat about it with any AI.

**Live:** https://drawask.github.io/

Repo: https://github.com/drawask/drawask.github.io

## Features

- Local DWG parsing (LibreDWG WASM) and DXF parsing (`dxf-parser`)
- **View** tab + full-screen playground: pan/zoom, layer toggles, region select, readable labels
- **Ask AI** tab: scoped Markdown/JSON/CSV using the same hidden layers + region
- Smart extract: content vs structural layers, labeled table detection, geometry summaries
- One-click **Copy for chat** (optional question prepended)

## Run locally

```bash
npm install
npm run dev
```

Open the URL Vite prints (default `http://localhost:5173`).

## Publish

Hosted on GitHub Pages for the **drawask** organization (personal project, not company infra).

Push to `main` → workflow `.github/workflows/deploy-pages.yml` deploys to https://drawask.github.io/

## Notes

- Files stay in the browser (the app does not upload drawings to a server).
- DWG has SVG playground preview. DXF currently exports data without SVG preview.
- `@mlightcad/libredwg-web` is GPL-3.0, so this project is GPL-3.0 as well.
