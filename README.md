# pretty-markdown

A beautiful, fast markdown **reader and editor** built for documents with LaTeX math.

Most markdown tools treat math as an afterthought — it breaks on real formulas, or the
reading experience feels like a code editor. `pretty-markdown` aims to feel like a great
PDF reader: open a `.md` file and it just renders beautifully, with robust LaTeX support
and a clean editing mode when you want it.

## Goals

- **Reads like a PDF viewer** — open, scroll, search; clean typography; no editor chrome in the way.
- **Robust LaTeX** — instant rendering for common math, automatic fallback for the long tail.
- **Edit & compile** — split-pane source/preview with live, incremental rendering.
- **Multi-tab** — keep several documents open and switch between them, like a browser.
- **Native & offline** — small desktop app, real file associations, no network required.

## Stack

| Layer | Choice |
|-------|--------|
| Shell | [Tauri](https://tauri.app) (Rust core + web frontend) |
| Frontend | React + TypeScript |
| Editor | [CodeMirror 6](https://codemirror.net) |
| Markdown | `markdown-it` + math plugin |
| Math | [KaTeX](https://katex.org) (default) → [MathJax 3](https://www.mathjax.org) (fallback) |

See [DESIGN.md](DESIGN.md) for the full architecture, [ROADMAP.md](ROADMAP.md) for the build
plan, and [diagram/](diagram/) for the UML use-case and sequence diagrams.

## Development

```bash
npm install        # install JS deps (also fetches Rust crates on first tauri run)
npm run tauri dev  # run the desktop app (Vite + Tauri)
npm run dev        # run just the web frontend (no native shell)
npm run typecheck  # tsc --noEmit
npm test           # vitest
npm run build      # type-check + bundle the frontend
```

There's a sample document at [samples/welcome.md](samples/welcome.md) to open and test math
rendering.

## Status

✅ **M0 scaffold** + **M1 reader MVP** — open a `.md` file and read it rendered, with KaTeX
math, light/dark themes, and inline error chips for bad formulas. Next: M2 (MathJax
fallback), then M3 (multi-tab). See [ROADMAP.md](ROADMAP.md).
