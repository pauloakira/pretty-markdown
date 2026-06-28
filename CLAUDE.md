# CLAUDE.md — pretty-markdown

Guidance for working in this repository. Read the linked docs before making structural changes.

## Project context

`pretty-markdown` is a **desktop markdown reader & editor built for documents with LaTeX
math**. The goal: read like a great PDF viewer (open a file, it renders beautifully, fast
scroll, find-in-page), with robust LaTeX and a clean editing mode. Math support is the
reason this project exists — it must never silently break on real formulas.

**Core features:** reader mode, robust LaTeX (KaTeX with MathJax fallback), edit-and-compile
with live preview, and **multi-tab** (several documents open at once, like a browser).

**Stack:** Tauri (Rust core) · React + TypeScript · CodeMirror 6 · markdown-it · KaTeX → MathJax.

**Build order (reader-first):** M0 scaffold → M1 reader MVP → M2 robust math → M3 multi-tab
→ M4 editor → M5 polish. See [ROADMAP.md](ROADMAP.md).

## Key documents — read these first

| Doc | What it covers |
|-----|----------------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | **Engineering patterns, architecture, conventions we follow** — read before writing or restructuring code |
| [DESIGN.md](DESIGN.md) | Product design, locked decisions, render pipeline, multi-tab model, perf targets |
| [ROADMAP.md](ROADMAP.md) | Milestone build plan |
| [diagram/](diagram/) | Mermaid UML — use-case and sequence diagrams |

## Architecture in one breath

Layered / clean architecture, dependencies pointing inward:
**Presentation (React) → Application (services, commands) → Domain (entities + ports) ← Infrastructure (Tauri/KaTeX/MathJax adapters)**.
The Domain layer has **no framework imports**. Renderers, file system, and persistence are
behind interfaces (ports) so they're swappable and testable. See
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full pattern catalog and folder layout.

## Working conventions

- TypeScript `strict`; no `any`. Model expected failures as values (`Result`/unions), not throws.
- Keep the Domain layer pure. Wire concrete adapters only at the composition root.
- Conventional Commits. Keep `main` releasable. Commit at logical checkpoints, not all at the end.
- Update the relevant doc (and the decision log in ARCHITECTURE.md §9) when behavior or
  structure changes.
