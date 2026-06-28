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

## M2 — Robust math
- [ ] MathRenderer abstraction with KaTeX → MathJax fallback. *(KaTeX + Composite done; MathJax adapter pending)*
- [x] Inline error chips instead of page-breaking failures.
- [ ] Custom `\newcommand` / preamble support.

## M3 — Multi-tab workspace
- Tab bar UI; `TabManager` owning open tabs + active tab.
- Open-in-new-tab, close (with dirty-save prompt), switch, reorder.
- Per-tab isolated state (scroll, mode, render cache); lazy mount/unmount.
- Keyboard shortcuts (`⌘T`, `⌘W`, tab switching).

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
