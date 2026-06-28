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

## Status

🚧 Design phase. No implementation yet.
