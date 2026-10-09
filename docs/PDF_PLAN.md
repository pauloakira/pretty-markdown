# PDF reading — implementation plan

> Status: **Phases 1–2 done** (2026-10-05); Phases 3–4 not started. Decisions are recorded in
> [ARCHITECTURE.md §9](ARCHITECTURE.md#9-decision-log). Update
> [DESIGN.md](../DESIGN.md) and [ROADMAP.md](../ROADMAP.md) as each phase lands.

## 1. Goal

Let pretty-markdown open and read **PDF files** in the same tabs as markdown documents.
Reading a paper's PDF next to your markdown notes should feel native: same tab bar, tab
groups, find bar, session restore, and file watching.

### In scope (MVP)

- Open `.pdf` files from the open dialog, Finder ("Open With" / double-click), recent
  files, and session restore.
- Continuous vertical scrolling over all pages, with selectable and copyable text.
- Zoom: in/out, reset, fit to width.
- Page indicator ("3 / 42") with go-to-page.
- Find in page (⌘F) across the whole document.
- Clickable links: internal links jump to the page, external ones open in the default browser.
- Restore page, position and zoom across tab switches and app launches.
- Reload automatically when the file changes on disk (e.g. you recompile LaTeX).
- PDFs work with tab groups, *Group tabs by folder*, and recent files exactly like
  markdown tabs.

### Out of scope (for now)

- Editing PDFs, filling forms, signing.
- Annotations and highlights (planned separately: [PDF_HIGHLIGHTS_PLAN.md](PDF_HIGHLIGHTS_PLAN.md)).
- Printing or exporting PDFs (a PDF tab hides **Export PDF**).
- Becoming the system's default PDF app. We register as a viewer only.

## 2. Engine decision

| Option | Verdict |
|---|---|
| **pdf.js** (`pdfjs-dist`, Mozilla) running in the web view | **Chosen.** Mature (it's Firefox's viewer), offline, and renders the same on every platform. Its viewer components give us page virtualization, a text layer for selection, find, links and zoom. Apache-2.0, compatible with our MIT license. |
| The web view's built-in PDF display (`<embed src="file.pdf">`) | Rejected. It's a black box: no integration with our find bar, theme, tab groups or session restore. Behavior differs per platform, and WebKitGTK on Linux has no built-in viewer. |
| PDFium on the Rust side (`pdfium-render`), rasterizing pages to images | Rejected. A large native binary per platform, and text selection and search would have to be rebuilt by hand. |

We use pdf.js's **viewer layer** (`pdfjs-dist/web/pdf_viewer.mjs`: `PDFViewer`, `EventBus`,
`PDFLinkService`, `PDFFindController`) rather than drawing pages ourselves. It already
solves virtualization, the text layer, zoom anchoring and search.

## 3. User-facing behavior

| Area | Markdown tab (today) | PDF tab |
|---|---|---|
| Toolbar | file name · Export PDF · Save · Read/Edit | file name · page `3 / 42` (editable) · zoom `− 110% +` · Fit width |
| ⌘E (toggle edit) | Reader ⇄ editor | No-op |
| ⌘S / ⌘⇧S | Save / Save as | No-op (never "unsaved") |
| ⌘P | Export PDF | No-op (out of scope) |
| ⌘F | Find in the rendered HTML | Find across all pages (pdf.js) |
| ⌘+ / ⌘− / ⌘0 | (not used yet) | Zoom in / out / reset to fit width |
| Tab title | file name | file name (PDF metadata title as a tooltip, if present) |
| Theme | follows light/dark | Viewer chrome follows the theme. Pages stay white by default, with an optional "Dark pages" toggle (Phase 4) |
| File changed on disk | silent reload (clean) or banner (unsaved edits) | Silent reload, keeping page and zoom |

## 4. Architecture changes, by layer

The layering rules still hold (see [ARCHITECTURE.md](ARCHITECTURE.md)): the domain has no
framework imports, pdf.js stays in infrastructure, and adapters are wired up only in
`src/composition/container.ts`.

### 4.1 Domain

- **`Document` becomes two kinds of document** (`src/domain/entities/Document.ts`):
  ```ts
  type Document = MarkdownDocument | PdfDocument;
  interface MarkdownDocument { kind: "markdown"; path: string | null; name: string; content: string }
  interface PdfDocument      { kind: "pdf";      path: string;        name: string }
  ```
  A PDF's bytes are **not** stored in the workspace. They're large, binary and never
  edited, so the viewer loads them by path. `createDocument` becomes
  `createMarkdownDocument`, and a new `createPdfDocument(path)` is added.
  `documentKindForPath(path)` picks the kind by extension.
- **`isTabDirty`**: always `false` for PDF tabs. `Tab.savedContent` only applies to
  markdown. Either make it optional or move it onto the markdown branch; decide when
  implementing, and prefer whatever keeps `markSaved`/`updateContent` simplest.
- **`ViewState`** gains PDF position fields:
  ```ts
  interface PdfView { page: number; pageOffset: number /* 0..1 within the page */; zoom: number | "page-width" }
  interface ViewState { scrollTop: number; mode: EditorMode; pdf?: PdfView }
  ```
  We save **page + offset within the page + zoom**, not a raw `scrollTop`, because the
  pixel offset is meaningless once the zoom changes. New domain ops:
  `setPdfView(ws, id, view)`.
- **Workspace operations** that assume markdown (`updateContent`, `reloadContent`,
  `markSaved`, `setMode`) become no-ops for PDF tabs. Add unit tests for that.
- **Session v3** (`src/domain/values/Session.ts`): tabs gain an optional
  `pdf: { page, pageOffset, zoom }`. Like v1, v2 sessions are still read. The kind isn't
  stored because it comes from the path. `toSession`/`parseSession` and their tests are
  updated.

### 4.2 Application

- **`DocumentService.load(path)`** chooses by kind. Markdown reads text as today. PDF
  checks that the file is readable (cheap: size/magic bytes via the port) and returns a
  `PdfDocument`. `open()` uses a picker filter that includes `.pdf`
  (`FilePicker.pickMarkdownFile` → rename to `pickDocument`).
- **`TabManager`**: add `setPdfView(id, view)`. `openDocument` dedupes by path as before.
- **`SessionService.restore`** restores PDF tabs with their `pdf` view state. Missing files
  are pruned exactly like markdown.

### 4.3 Infrastructure

- **Rust:** a new command `read_file_bytes(path) -> Result<tauri::ipc::Response, String>`
  that returns **raw bytes** (an `ArrayBuffer` in JS, with no JSON/base64 overhead, so
  50 MB PDFs stay fast). It goes next to `read_text_file` in `src-tauri/src/lib.rs`.
  Rejected alternative: the asset protocol (`convertFileSrc`). It needs filesystem scope
  configuration, and the command keeps all file access in one place.
- **`FileReader` port:** add `readBytes(path): Promise<Result<Uint8Array>>`. Implement
  it in `TauriFileSystem`.
- **`src/infrastructure/pdf/PdfJsViewer.ts`** (new): wraps pdf.js's `PDFViewer`,
  `EventBus`, `PDFLinkService` and `PDFFindController` behind our own interface (§4.4).
  It owns worker setup, document loading, zoom, page navigation, search and teardown.
- **pdf.js assets:** the worker (`pdf.worker.min.mjs`, imported with Vite's `?url`),
  **`cmaps/`** and **`standard_fonts/`** are copied from `pdfjs-dist` into the build, so
  CJK text and PDFs with unembedded fonts render offline. *This is the most common pdf.js
  mistake. Test it with a CJK PDF and a non-embedded-font PDF.*
- **Lazy loading:** load the viewer with a dynamic `import()` the first time a PDF opens,
  in its own Vite chunk like MathJax. Markdown startup stays exactly as fast as today.

### 4.4 Presentation

- **`PdfViewer` interface** (`src/presentation/pdf/PdfViewer.ts`). The presentation
  layer owns this contract; infrastructure implements it, and the container provides a
  factory, so React never imports pdf.js and tests can use a fake:
  ```ts
  interface PdfViewer {
    mount(container: HTMLElement, bytes: Uint8Array, initial: PdfView): Promise<Result<{ pageCount: number; title?: string }>>;
    setZoom(zoom: number | "page-width"): void;
    goToPage(page: number): void;
    onViewChange(cb: (view: PdfView) => void): () => void;   // debounced, for persistence
    find: FindTarget;                                          // see below
    destroy(): void;
  }
  ```
- **`PdfReader` component** (new, next to `Reader`): mounts the viewer for the active PDF
  tab (`key={tab.id}`, the same lazy-mount pattern as markdown tabs). It restores
  `viewState.pdf` and persists view changes through `TabManager.setPdfView`, debounced
  like the reader's scroll persistence (`SCROLL_SETTLE_MS`).
- **Document cache:** keep the loaded document for the **3 most recently used** PDF tabs
  in a small cache with least-recently-used eviction, so switching back to a recent PDF is
  instant and memory stays bounded. Pages are re-rendered for the visible area only.
- **`DocumentToolbar`:** branches on the document kind (§3). New small controls: a page
  number field and a zoom group.
- **Find: introduce a `FindTarget` interface** that both engines implement:
  ```ts
  interface FindTarget { search(q: string): Promise<FindState>; next(): FindState; previous(): FindState; clear(): void }
  ```
  `FindController` (HTML `<mark>` approach) already matches this shape, with a sync result
  wrapped in a promise. The PDF implementation drives `PDFFindController`, whose match
  counts arrive asynchronously through `updatefindmatchescount` events. `useFind` takes
  the active target instead of building a `FindController` from a DOM root. The `FindBar`
  UI doesn't change.
- **Keyboard (`useTabKeyboard`):** add ⌘+/⌘−/⌘0, routed to the PDF viewer when a PDF tab
  is active. Edit/save/export shortcuts do nothing on PDF tabs.
- **External links:** routed to `tauri-plugin-opener` (already a dependency) so they open
  in the user's browser, never inside the app's web view.
- **File watching (`useFileWatch`):** PDF tabs are watched too. On change, reload the
  bytes and remount the viewer at the saved `PdfView`. There's no conflict banner, since
  PDF tabs can't have unsaved edits.

### 4.5 Packaging

- `tauri.conf.json` → `bundle.fileAssociations`: add `{ "ext": ["pdf"], "name": "PDF Document", "role": "Viewer" }`.
  Viewer only, so we appear in "Open With" without taking over the user's default PDF app.
- The welcome screen copy and `INSTALL.md` verification steps mention PDFs.

## 5. Performance and memory

- **Rendering:** pdf.js's `PDFViewer` renders only visible (and nearby) pages and frees
  canvases that scroll far away. Keep its defaults unless profiling says otherwise.
- **Parsing** happens in the pdf.js web worker, so the UI thread stays free.
- **Memory:** cap the cache at 3 parsed documents and call `destroy()` on eviction and
  when a tab closes.
- **Startup:** no cost for markdown users, thanks to the lazy chunk.
- **Targets** (to confirm in Phase 3): a 300-page paper opens to the first page within
  1 s, scrolling stays at 60 fps, and switching to a cached PDF tab takes under 100 ms.

## 6. Testing strategy

- **Domain unit tests:** both document kinds, `isTabDirty` for PDFs, markdown-only ops
  doing nothing on PDF tabs, `setPdfView`, and session v3 round-trips plus v2 → v3 parsing.
- **Application tests:** `DocumentService.load` chooses by extension; restore prunes
  missing PDFs and keeps their view state.
- **App-level test** (like `src/App.session.test.tsx`): a fake `PdfViewer` from the
  container covers opening a PDF tab, the toolbar branching, ⌘E/⌘S doing nothing, find
  routing to the PDF target, and quit → relaunch restoring page and zoom.
- **Real web view checks:** canvas, the text layer, worker loading and font assets can
  only be verified in the running app. Use a fixtures set: a LaTeX paper, a large
  (300+ page) PDF, a scanned PDF with no text layer, a CJK PDF, a PDF with unembedded
  fonts, and one with internal links and an outline.

## 7. Phases

Each phase is its own PR, with checkpoint commits inside it (see the repo's
commit-at-checkpoints convention).

### Phase 1: Foundation (no UI) ✅ (2026-10-05)
- The two document kinds, `ViewState.pdf`, `setPdfView`, markdown-only ops doing nothing
  on PDFs, session v3.
- `read_file_bytes(path, maxBytes?)` command, `FileReader.readBytes`, `DocumentService`
  choosing by kind. A PDF is validated by reading only its first 1 KB (the `%PDF-` header),
  so restore drops missing or invalid PDFs cheaply.
- **Done when:** all domain and application tests pass, and v2 sessions still restore.

**As built, versus the plan:**
- **Picker filter and `pickMarkdownFile` → `pickDocument` rename moved to Phase 2.** With
  no viewer yet, letting the open dialog pick PDFs would ship a dead end, and `main` must
  stay releasable.
- **PDF tabs show a placeholder** (`PdfPending`), and the toolbar, find, edit, save and
  export are off for them. A PDF can still reach a tab (Finder → Open With → Other…, or a
  restored session), and this keeps it from being treated as markdown. Phase 2 replaces
  the placeholder with the viewer.
- **`Tab.savedContent` is `string | null`** (null for PDFs). That was the smallest change
  that keeps `markSaved`/`updateContent` simple.
- **Fixed along the way:** restore kept the saved `activeIndex` unchanged even when tabs
  before the active one were dropped, so the wrong tab could come back active. It now
  shifts left for each dropped tab.
- **Verified in the real app:** an isolated dev build (separate app identifier, so it can't
  touch the real session) restored a v3 session with two real PDFs from iCloud Drive
  (paths with spaces and `~`), a fake `.pdf`, and a markdown note. The PDFs came through
  the raw-bytes IPC, the fake was dropped, and the saved page and zoom round-tripped.

### Phase 2: Viewer ✅ (2026-10-05)
- Open-dialog filter includes `.pdf` (and `pickMarkdownFile` → `pickDocument`), moved here
  from Phase 1. The `PdfPending` placeholder is removed.
- `pdfjs-dist` dependency, worker + `cmaps` + `standard_fonts` assets, lazy chunk.
- `PdfJsViewer` adapter, `PdfViewer` interface, `PdfReader` component, toolbar branch,
  zoom controls and shortcuts, page indicator, go-to-page, text selection/copy, links.
- **Done when:** the fixtures render correctly in the real app (including CJK and
  unembedded fonts), links behave correctly, and markdown startup time is unchanged.

**As built, versus the plan:**
- **pdf.js 6.4, legacy build.** It transpiles newer JavaScript features; WKWebView's
  engine is the user's macOS Safari version, which can lag behind the modern build.
- **Four asset folders, not two.** pdf.js 6 also needs `wasm/` (JPEG 2000 and JBIG2
  decoders, colour management) and `iccs/` (ICC profiles). A small Vite plugin
  (`pdfjsAssets` in `vite.config.ts`) serves them from `node_modules` in dev and copies
  them to `dist/pdfjs/` on build (4.3 MB). They're fetched from `/pdfjs/…`, so they work
  under Tauri's `tauri://` protocol.
- **Bundle sizes.** The main bundle grew by about 7 KB. pdf.js (713 KB, plus 224 KB of
  CSS) and its worker (1.3 MB) load only when the first PDF tab is shown.
- **No `isEvalSupported` option.** pdf.js 6 removed it because it no longer compiles PDF
  functions with `eval`. PDF JavaScript stays off: the viewer has no scripting manager.
- **Position persistence moved here from Phase 3.** `PdfReader` records the view debounced
  while reading, immediately on tab switch, and the app flushes it on quit (`pdfViewRef`).
  A tab switch or relaunch reopens at the same page and zoom.
- **External links** go through a new `LinkOpener` port (Tauri opener plugin) and never
  navigate the web view. In-document links are handled by pdf.js.
- **Fixed while testing in a browser and the real web view:**
  - pdf.js's CSS sets `:root { color-scheme: light dark }`, which overrode our Light
    theme. Our rule is now `:root:not([data-theme="dark"])`, which is more specific.
  - Views were reported via `requestAnimationFrame`, which stalls in hidden windows. A
    16 ms timer plus our own scroll listener now report them.
  - The final view was measured after React detached the container (all zeros, so it
    "landed" on the last page). The adapter now keeps the last measured view.
  - Zoom steps within 3% of the current scale are skipped, so fit-width at 150.4% zooms
    out to 125%, not to an invisible 150%.
  - The gap above a page now counts as that page (go-to-page parks the viewport there).
  - A container with no size at mount (hidden window) defers the initial view until it
    has a real size, instead of fitting to zero.
- **Verified:**
  - In a Chromium preview against real PDFs and a generated fixture with a non-embedded
    Japanese font: the bundled cMaps decode 日本語テキスト, standard fonts load, external
    and internal links work, and a 4.9 MB PDF paints its first page in about 370 ms.
  - In the **real WKWebView production build** (a separately named copy, so the user's
    app and session were untouched): a 2.9 MB iCloud PDF loaded through the raw-bytes
    IPC, the worker ran from `tauri://`, and an in-range saved position (page 7, offset
    0.5, 125%) was restored exactly.
- **Smoothness and sharpness, tuned with the user in the real app** (temporary probe:
  frame cadence, page draw times, wheel events, canvas geometry):
  - **GPU canvases (`enableHWA: true`).** pdf.js's API default creates CPU-backed
    (`willReadFrequently`) canvases, which WebKit scrolled with stutter and flicker.
    pdf.js's own viewer turns this on.
  - **Pre-drawing.** A momentum wheel (here about 360 px per event, around 18,000 px/s)
    outruns pdf.js's "visible + 1" drawing. Measured frames were fine (about 13 ms); the
    problem was pages appearing before they were drawn. The adapter now pre-draws 4 pages
    ahead in the scroll direction and 1 behind, through pdf.js's own queue
    (`preRenderPages`).
  - **Page geometry.** Our global `* { box-sizing: border-box }` squeezed each page canvas
    into its 9 px border (drawn for 1665 px, shown at 1647, a ~1% non-uniform stretch). The
    toolbar's 33.6 px height also put pages off the pixel grid. Together they made glyphs
    look warped. Fixed by restoring the content box inside the viewer and giving the
    toolbar a whole-pixel height.
  - **At least 2× drawing** (`OutputScale.pixelRatio`), so standard (1×) displays get
    supersampled, smoother glyphs. Retina is unchanged.
- **Known edge case (Phase 3):** an out-of-range saved page (the PDF got shorter) clamps to
  the last page in Chromium but landed a few pages earlier in WKWebView.

### Phase 3: Integration
- `FindTarget` refactor plus PDF find, file watching, file association, the document
  cache, and the out-of-range restore edge case above. (Page/zoom persistence through tab
  switches and quit/relaunch already landed in Phase 2. Recent files work for PDFs opened
  from the dialog.)
- App-level tests with the fake viewer, and a real web view pass over the fixtures.
- **Done when:** §1's MVP list is complete and the performance targets in §5 are met.

### Phase 4: Polish (optional)
- Outline / table-of-contents sidebar (pdf.js `getOutline()`), page thumbnails,
  "Dark pages" toggle (an inversion filter on page canvases, off by default), rotation.

## 8. Risks

| Risk | Mitigation |
|---|---|
| Missing `cmaps`/`standard_fonts`, so text renders wrong offline | Bundle them; CJK and unembedded-font PDFs are part of the fixtures |
| Worker fails to load in the packaged app (works in dev only) | Load the worker through Vite's `?url` import; test the packaged `.app`, not just `tauri dev` |
| Find UX diverges between markdown and PDF | One `FindTarget` interface and one `FindBar` |
| Memory growth with many large PDFs | Cache of 3 with `destroy()` on eviction and close; check in Activity Monitor with the 300-page fixture |
| Dark theme makes white pages glaring | Optional "Dark pages" toggle (Phase 4); inversion is off by default because it distorts images |
| Scanned PDFs have no text, so search and selection do nothing | Expected for a reader; show "No text found in this PDF" instead of zero matches. OCR is out of scope |
| WKWebView canvas limits at very high zoom | Clamp zoom (e.g. 25%–400%); pdf.js already scales canvases down past its max size |

## 9. Open questions

1. **MVP cut:** ship after Phase 3, or include the outline sidebar (Phase 4) in the first
   release? An outline matters most for long papers.
2. **Naming:** "pretty-markdown" undersells a markdown + PDF reader. Keep it, or rename
   before the repo goes public?
3. **⌘+/⌘− for markdown:** should the same shortcuts also scale the markdown reader's font
   (the existing `--reader-font-scale` setting), for consistency?
4. **Default zoom:** fit to width (recommended for papers) or 100%?

## 10. Future

- **Highlights and annotations:** planned in [PDF_HIGHLIGHTS_PLAN.md](PDF_HIGHLIGHTS_PLAN.md).
  Highlights are saved into the PDF itself, not a sidecar file, so they also work on iPad
  and in other readers.
- **LaTeX workflow:** SyncTeX jumps between a `.tex`/`.md` source and its compiled PDF.
- **Search across open tabs** (markdown and PDF together).
- **Side-by-side view:** markdown notes next to the PDF they annotate.
