# SketchBoard ✏️

A hand-drawn style virtual whiteboard (Excalidraw-like) built with **React + TypeScript**.
Draw diagrams, flowcharts, wireframes and sketches, lay them out on real paper sizes (A5 → A2, Letter, Legal, Tabloid),
and print or export them — optionally converted to **pure black & white** for printers.

| | |
|---|---|
| **Hand-drawn look** | Every shape is rendered with [rough.js](https://roughjs.com) using a per-element seed, so the wobble is stable and identical for every collaborator. |
| **No account** | Open the page and draw. Work is auto-saved to the browser (local storage). |
| **Page sizes** | Full-screen infinite canvas by default. Pick A5, A4, A3, A2, US Letter, Legal or Tabloid (portrait/landscape, **margins per side** — top, right, bottom, left, or one preset for all) in *Page setup* and the paper frame appears centred, showing exactly what prints. |
| **Pages, header & footer** | With a paper size chosen the board becomes a paged document: pages stack vertically and are added automatically as you draw below the last one. Header & footer (left / centre / right) with `{title}`, `{page}`, `{pages}`, `{date}` tokens and page numbers (1 · Page 1 · Page 1 of 3 · 1 / 3) are shown on every page, printed and exported. |
| **Pages panel** | PDF-viewer style strip in the sidebar (first tab): live thumbnails of every page, the page in view highlighted, “Page _n_ of _N_” box to type a page, ↑/↓ buttons, `PageUp`/`PageDown`. Click a thumbnail to jump — the page flashes an outline on the board. Pin it to keep it open. |
| **Print** | Vector print (crisp at any DPI) in **Black & white**, **Grayscale** or **Colour**, “page as drawn” or “fit drawing to page”. “Save as PDF” works from the browser dialog. |
| **Export** | PNG (1×–4×, transparent or white), SVG, the native `.sketchboard` JSON file, and `.excalidraw`. Copy PNG to clipboard. |
| **Excalidraw** | Open / drag & drop `.excalidraw` files (and paste shapes copied in Excalidraw). Save as Excalidraw from the menu or Export dialog — tables, bold/italic and highlighter survive a round trip. |
| **Live collaboration** | End-to-end encrypted rooms (AES-GCM). The key lives in the link’s `#fragment`, so the relay server never sees your drawing. Live cursors with names. |
| **Workspace (saved drawings)** | Menu → *Workspace*: save the board to the SketchBoard server (stored as files in its `storage/` folder), browse every saved drawing with previews, open, rename, delete, download as `.sketchboard` or `.excalidraw`, and create share links. `Ctrl+Shift+S` saves changes to the open drawing; edits made elsewhere meanwhile are detected (no silent overwrites). |
| **Export to link** | Menu → *Export to link*: a read-only, end-to-end encrypted snapshot link (`#json=id,key`). Whoever opens it gets their own copy; the server can't read it. |
| **Libraries** | Sidebar → *Libraries*. **Personal library**: add the selection (or the whole canvas), rename, remove, export as `.sketchboardlib` or `.excalidrawlib`, import either format (or drop the file on the board), and “Browse Excalidraw libraries” adds any library from libraries.excalidraw.com. **SketchBoard library**: 62 ready-made items — Database (cylinder, entity table, 1-N / N-M relations, cache, replica, document store), UML (class, interface, abstract, enum, inheritance, realization, association, dependency, aggregation, composition, note, actor, use case), **Callouts** (speech, rounded, oval and thought bubbles, comment, warning, two-person dialogue, burst — text already inside), Flowchart, Forms & UI (text/password input, checkbox(es), radio group, buttons, dropdown, toggle, text area, list, slider, search, login form) and Architecture. Click to add or drag onto the board. |
| **Sidebar** | Toggle next to *Share*: pages, find text on the canvas, libraries, encrypted chat, full-screen presentation. Pin to dock it, or let it float. |
| **Mobile & PWA** | Touch drawing, pinch-zoom, double-tap for text, bottom-sheet style panel, safe-area aware layout. Installable as an app (Android, iOS, Windows/macOS/ChromeOS), works offline, auto-update prompt, opens `.sketchboard` and `.excalidraw` files from the OS. |
| **Pen & stylus** | Pressure-sensitive pen (Apple Pencil, S Pen, Surface/Wacom) with palm rejection and *Pen mode* (pen draws, fingers pan/zoom). Highlighter, stroke eraser, laser pointer (visible to collaborators; trail either fades as you draw or **stays until you release** the pen/mouse, 4 sizes — options in the panel while the laser is active), **draw to shape** (rough strokes snap to rectangles, ellipses, diamonds, triangles, lines). All under the ⋯ *More tools* button. |
| **Images** | Insert (⋯ → Image or `9`), paste (`Ctrl+V` — screenshots, copied pictures) or drag & drop. Large photos are downsized; data is kept in IndexedDB, embedded in `.sketchboard` files, synced to collaborators, and converted to grayscale/B&W for print. |
| **Shapes gallery** | Toolbar *Shapes* (`S`): ~59 shapes — basic (triangle, hexagon, cross, heart, cloud, cylinder, cube, lightning…), stars & bursts, block arrows (incl. chevron, U-turn), **callouts / speech bubbles** (rectangle, rounded, oval, thought bubble — drag the yellow handle to aim the tail) and a full **flowchart** set (process, decision, data, document, terminator, preparation, manual input, delay, database, off-page connector…). Searchable; change a shape later from the panel. |
| **Precision eraser** | `Shift+E` (or the eraser panel): rubs out only the part of a pen / highlighter / line stroke it touches, splitting strokes where you cut through. Four sizes. The eraser button remembers which eraser you used. |
| **Code blocks** | `C` (or ⋯ → Code block): syntax-highlighted code in a window-style card — 18 languages (JS/TS, Python, Java, C#, C/C++, Go, Rust, Kotlin, PHP, Ruby, SQL, JSON, YAML, HTML/XML, CSS, Shell…), light/dark theme, line numbers, title. **Mark lines** in yellow / green / red / blue: click a line number, or type `3, 5-7`. Live highlighting while typing, Tab/Shift+Tab indent, auto-indent on Enter. Prints in B/W, exports, searchable. |
| **Tables** | Table tool (`G`): drag to size or click for 3×3. Type straight into cells — `Tab`/`Shift+Tab` move, `Tab` on the last cell adds a row, `Alt+↑/↓` move up/down. Text wraps and rows grow. Drag grid lines to resize columns/rows. Panel: rows × columns, insert/delete row/column at the current cell, equal widths, cell padding, header row + colour, banded rows, cell fill, text colour, font/size/alignment, border colour/width/style/sloppiness. Prints & exports; search finds text in cells. |
| **Text** | H1 / H2 / H3 / Paragraph presets, 20 fonts (hand-written, sans, serif, mono) **plus any Google Font or installed font by name**, preset or custom px size, **bold**, *italic*, underline, alignment. |
| **Editing** | Select, multi-select, marquee, move, resize (Shift = keep ratio, Alt = from centre), **rotate** (round handle above the selection, Shift snaps to 15°; angle box and ±90° buttons in the panel; `Shift+R` / `Shift+Alt+R`), Alt-drag duplicate, endpoint editing for lines/arrows, copy/paste, duplicate, lock, z-order, undo/redo, grid, dark mode, B/W preview. |

## Quick start

```bash
# 1. web app
cd web
npm install
npm run dev            # http://localhost:5173

# 2. SketchBoard server (live collaboration + workspace storage), in another terminal
cd collab-server
npm install
npm run dev            # ws://localhost:3002 and http://localhost:3002/api
```

Saved drawings go to **`collab-server/storage/`** (a separate folder in the directory the server runs from; change it with
`STORAGE_DIR=/path`). Each drawing is a folder with `scene.sketchboard`, `meta.json` and a `thumbnail.png`; share links are
in `storage/links/`. The folder is git-ignored. Drawing works without the server; only the workspace, links and live
collaboration need it.

Or with Docker: `docker compose up --build` → app on http://localhost:8080, server on :3002, drawings in `./storage`.

Other scripts (inside `web/`): `npm run build`, `npm run typecheck`, `npm test` (Vitest unit tests).

### Installing as an app (PWA)
The service worker only runs in production builds, so test with `npm run build && npm run preview` (or deploy behind HTTPS — required for PWAs except on `localhost`).
* **Android / Chrome / Edge (desktop):** menu → *Install app* (or the install icon in the address bar).
* **iPhone / iPad:** Safari → Share → *Add to Home Screen* (the app shows these steps under menu → *Install app*).
* Offline: the app shell is precached on first visit; drawings are stored on the device. Live collaboration needs a connection.
* Updates: when a new version is deployed the app shows *“A new version is ready — Reload”*.
* Bump `VERSION` in `web/public/sw.js` when you change caching logic; hashed assets update automatically.

Point the app at a deployed server with `VITE_COLLAB_SERVER_URL=wss://collab.example.com` (and, if the HTTP API lives elsewhere, `VITE_API_URL=https://api.example.com`) — see `web/.env.example`.

### Hosting on GitHub Pages
`.github/workflows/deploy-pages.yml` tests, builds and publishes the web app on every push to `main`.
1. Push the repo to GitHub, then **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Push to `main` (or run the workflow from the **Actions** tab). The app appears at `https://<user>.github.io/<repo>/`, e.g. https://arpangroup.github.io/sketchboard-whiteboard/.

Pages only serves static files, so by default live collaboration, the workspace and export-to-link are switched off and explain why; drawing, printing, files, Excalidraw import/export, the library and the installable app all work. To turn them on, run `collab-server` on any host with HTTPS (Render, Fly.io, a VPS…), start it with `ALLOWED_ORIGINS=https://<user>.github.io`, and add a repository **variable** (Settings → Secrets and variables → Actions → Variables) `SKETCHBOARD_SERVER_URL=wss://your-server.example.com`, then re-run the workflow. It must be `wss://` — browsers block `ws://` from an HTTPS page.

To try a sub-folder build locally: `BASE_PATH=/sketchboard-whiteboard/ VITE_NO_SERVER=true npm run build && npm run preview` (inside `web/`).

## Using it

| Tool | Key | | Action | Shortcut |
|---|---|---|---|---|
| Select | `V` / `1` | | Undo / Redo | `Ctrl+Z` / `Ctrl+Shift+Z` |
| Rectangle | `R` / `2` | | Duplicate | `Ctrl+D` |
| Diamond | `D` / `3` | | Copy / Paste | `Ctrl+C` / `Ctrl+V` |
| Ellipse | `O` / `4` | | Print | `Ctrl+P` |
| Arrow | `A` / `5` | | Export | `Ctrl+Shift+E` |
| Line | `L` / `6` | | Save / Open file | `Ctrl+S` / `Ctrl+O` |
| | | | Save to workspace | `Ctrl+Shift+S` |
| Draw | `P` / `7` | | Zoom to fit / page | `Shift+1` / `Shift+2` |
| Text | `T` / `8` | | Pan | `Space`+drag, scroll, middle mouse |
| Eraser | `E` / `0` | | Zoom | `Ctrl`+scroll, pinch |
| Highlighter | `M` | | Bold / Italic / Underline | `Ctrl+B` / `I` / `U` |
| Laser pointer | `K` | | Draw to shape on/off | `Shift+S` |
| Insert image | `9` | | Paste image / text | `Ctrl+V` |
| Table | `G` | | Next / previous cell | `Tab` / `Shift+Tab` |
| Hand | `H` | | Keep tool active | `Q` |

Press `?` in the app for the full list.

### Printing in black & white
Click **Print** (top right) → choose paper, orientation, *Page as drawn* or *Fit drawing to page*, and **Black & white**.
In B/W every stroke and text becomes black; fills are graded so text stays readable — near-white tints print as plain paper,
pastels as light hatching and strong colours as hatching (no ink-hungry solid blocks). Use the main menu → *Preview → B/W* to see this on screen while you draw.

## Project layout

```
sketchboard/
├── web/                     React + TypeScript app (Vite)
│   └── src/
│       ├── core/            types, geometry, Store (observer), constants
│       ├── elements/        element model: factory + one Strategy handler per element type
│       ├── scene/           Scene (repository), History (undo/redo), reconcile (CRDT-lite merge)
│       ├── tools/           State-pattern tools: selection, shapes, linear, freedraw, text, eraser, hand
│       ├── renderer/        CanvasRenderer, ShapeCache, colour-mode strategies
│       ├── export/          PNG, SVG, print service, export regions
│       ├── page/            paper sizes & page geometry
│       ├── persistence/     StorageAdapter (local storage), file open/save, validation
│       ├── collab/          CollabSession, transport, E2E crypto, wire protocol
│       ├── cloud/           workspace API client, WorkspaceService, encrypted share links, thumbnails
│       ├── library/         personal LibraryStore, library file formats, built-in items (ItemBuilder)
│       ├── pwa/             service-worker registration, install prompt, update + offline state, file launch
│       ├── actions/         Command pattern: every user action + keyboard shortcut
│       ├── editor/          Editor facade/mediator tying it all together
│       └── ui/              React components (toolbar, properties, dialogs…)
├── collab-server/           Node server: WebSocket relay (zero-knowledge) + workspace REST API (src/storage)
└── docs/ARCHITECTURE.md     HLD, LLD, UML, data model, APIs, patterns, trade-offs, scaling
```

See **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** for the full design.

---