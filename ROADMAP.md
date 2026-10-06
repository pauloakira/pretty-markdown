# pretty-markdown — Roadmap

Reader-first build plan. Each milestone is independently shippable.

## M0 — Scaffold ✅
- [x] Tauri + React + TypeScript project.
- [x] Vite dev setup, basic window, open-file dialog wired through Tauri.
- [x] Layered folder structure + composition root; typecheck/test/build scripts.

## M1 — Reader MVP (the "feels like a PDF reader" milestone) ✅
- [x] Open a `.md` file → rendered, read-only view.
- [x] markdown-it pipeline (CommonMark + GFM-ish: tables, linkify, typographer).
- [x] KaTeX math rendering for `$...$` / `$$...$$` via a custom math plugin.
- [x] Clean reading typography, light/dark theme.
- [x] Find-in-page (`⌘F`/`Ctrl+F`): highlight all, count, next/prev, smooth scroll.
- [x] Settings (persisted): reading width (side margins) + font size, live-applied.

## M2 — Robust math ✅
- [x] MathRenderer abstraction with KaTeX → MathJax fallback (full TeX packages, SVG output).
- [x] Inline error chips instead of page-breaking failures.
- [x] Custom macro / preamble support (preamble fed to both renderers; in-document `\gdef`
      persists per document). *(Settings-UI/front-matter source for the preamble: later.)*
- [x] Copy a formula → its **LaTeX source** goes to the clipboard.

> Perf note: MathJax is eagerly loaded (own chunk). Lazy-loading it on first fallback is a
> future optimization.

## M3 — Multi-tab workspace ✅
- [x] Tab bar UI; `TabManager` owning open tabs + active tab (single source of truth).
- [x] Open-in-new-tab (dedupe: reopening a path focuses its tab), close, switch, drag-reorder.
- [x] Per-tab isolated state (scroll position, render cache); lazy mount/unmount via `key`.
- [x] Keyboard shortcuts (`⌘T`, `⌘W`, `⌘⇧[`/`⌘⇧]`, `Ctrl+Tab`, `⌘1–9`); middle-click to close.
- [x] Dirty-save prompt on close. *(delivered in M4 with the editor's dirty state)*

## M4 — Editor ✅
- [x] CodeMirror 6 edit mode with markdown highlighting (per-tab, themed to match the app).
- [x] Split pane source ⇆ live preview (debounced render) with proportional synced scrolling.
- [x] Save / Save-as (`⌘S` / `⌘⇧S`), native write command, dirty-state indicator (tab + toolbar).
- [x] Reader/Edit toggle (`⌘E`) and dirty-save-on-close prompt (deferred from M3).
- [ ] True incremental (per-block) rendering — currently a debounced full re-render. *(optimization)*
- [ ] Preserve editor undo history across tab switches (editor remounts per tab). *(later)*

## M5 — App polish ✅
- [x] Restore last session — reopen tabs (paths + active tab + mode + scroll) on launch,
      with a "reopen tabs?" prompt on close (window button or ⌘Q). Autosaved as you work, so
      it's current even after Dock → Quit or a crash. Stored as JSON in the app config dir.
- [x] OS file associations — double-click a `.md` in Finder opens it (launch + while running).
- [x] Recent files list on the welcome screen (persisted, click to reopen).
- [x] File-watch: reload on external change (silent when clean; Reload/Keep banner when dirty).

## Post-v1
- [x] Export to PDF — print-to-PDF (`⌘P` / toolbar): document-only print layout, vector
      math (KaTeX fonts / MathJax SVG), page-break rules. *(Phase 1; native dialog-free
      export with page numbers is a possible Phase 2.)*
- [x] Tab groups (Chrome-style): named/colored groups, collapse, tab & chip menus, drag
      tabs into/out of groups, drag a whole group by its chip, *Group tabs by folder*,
      persisted in the session. *(Not yet: keyboard shortcuts for groups.)*
- [x] Links in markdown: web/mail links open in the default browser (never navigate the
      app), `#heading` links scroll within the document (GitHub-style heading ids).
      *(Not yet: open relative `.md` links as a new tab.)*
- [ ] PDF reading — open PDFs in tabs (pdf.js): zoom, page navigation, find, links, session
      restore, file watching. Planned in phases; see [docs/PDF_PLAN.md](docs/PDF_PLAN.md).
      - [x] Phase 1 — foundation: document kinds, PDF view state, session v3, byte reading.
      - [x] Phase 2 — viewer: pdf.js (lazy), zoom/page controls, links, position memory.
      - [ ] Phase 3 — integration (find, file watching, file association) · [ ] Phase 4 — polish.
- [ ] Full TeX engine / TikZ (opt-in renderer).
- [ ] Plugin/theme system.
