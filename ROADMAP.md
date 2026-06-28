# pretty-markdown — Roadmap

Reader-first build plan. Each milestone is independently shippable.

## M0 — Scaffold
- Tauri + React + TypeScript project.
- Vite dev setup, basic window, open-file dialog wired through Tauri.

## M1 — Reader MVP (the "feels like a PDF reader" milestone)
- Open a `.md` file → rendered, read-only view.
- markdown-it pipeline (CommonMark + GFM).
- KaTeX math rendering for `$...$` / `$$...$$`.
- Clean reading typography, light/dark theme, adjustable font size.
- Find-in-page, smooth scroll.

## M2 — Robust math
- MathRenderer abstraction with KaTeX → MathJax fallback.
- Inline error chips instead of page-breaking failures.
- Custom `\newcommand` / preamble support.

## M3 — Editor
- CodeMirror 6 edit mode with markdown highlighting.
- Split pane source ⇆ live preview, incremental rendering.
- Synced scrolling.
- Save / save-as, dirty-state indicator.

## M4 — App polish
- OS file associations (double-click `.md`).
- Recent files, restore last session/window state.
- File-watch: reload when the file changes on disk.

## Post-v1 (deferred)
- Full TeX engine / TikZ (opt-in renderer).
- Export to PDF.
- Plugin/theme system.
