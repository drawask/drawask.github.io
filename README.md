# CadChat

Open a DWG/DXF in the browser, explore the drawing, then copy a clean pack and chat about it with any AI.

**Live:** connect this repo to [Vercel](https://vercel.com) for a free `*.vercel.app` URL.

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

## Deploy

1. Push to GitHub (this repo)
2. Import the repo in [Vercel](https://vercel.com/new)
3. Framework: Vite · Build: `npm run build` · Output: `dist`

## Notes

- Files stay in the browser (nothing uploaded to a server by the app itself).
- DWG has SVG playground preview. DXF currently exports data without SVG preview.
- `@mlightcad/libredwg-web` is GPL-3.0, so this project is GPL-3.0 as well.
