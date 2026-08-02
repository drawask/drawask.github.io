# CadChat

Open a DWG/DXF in the browser, explore the drawing, then copy a clean pack and chat about it with any AI.

**Site (GitHub Pages):** https://hussain-mushtaque.github.io/cadchat/

Personal project. No company hosting.

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

## Publish (GitHub Pages)

Hosting is on **your personal GitHub account**, not Vercel / company infra.

1. Repo Settings → **Pages**
2. Source: **GitHub Actions**
3. Push to `main` (workflow `.github/workflows/deploy-pages.yml` builds and deploys)

Live URL: `https://hussain-mushtaque.github.io/cadchat/`

## Notes

- Files stay in the browser (the app does not upload drawings to a server).
- DWG has SVG playground preview. DXF currently exports data without SVG preview.
- `@mlightcad/libredwg-web` is GPL-3.0, so this project is GPL-3.0 as well.
