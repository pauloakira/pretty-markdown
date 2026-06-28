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
- [ ] Adjustable font size, find-in-page, smooth scroll. *(carried forward)*

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
- [ ] Dirty-save prompt on close. *(deferred to M4 — needs the editor's dirty state)*

## M4 — Editor
- CodeMirror 6 edit mode with markdown highlighting.
- Split pane source ⇆ live preview, incremental rendering.
- Synced scrolling.
- Save / save-as, dirty-state indicator.

## M5 — App polish
- OS file associations (double-click `.md`).
- Recent files, restore last session (open tabs + active tab + scroll).
- File-watch: reload when the file changes on disk.

## Post-v1 (deferred)
- Full TeX engine / TikZ (opt-in renderer).
- Export to PDF.
- Plugin/theme system.
