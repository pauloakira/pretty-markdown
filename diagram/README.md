# Diagrams

UML diagrams for pretty-markdown, written in [Mermaid](https://mermaid.js.org) so they
render natively on GitHub and stay text-based / version-controlled alongside the code.

| File | Diagram |
|------|---------|
| [`use-case.md`](use-case.md) | Use case diagram — actors and what they can do |
| [`sequence-open-document.md`](sequence-open-document.md) | Sequence — open a document in a new tab, render math with KaTeX→MathJax fallback |
| [`sequence-edit-live-preview.md`](sequence-edit-live-preview.md) | Sequence — edit mode incremental live preview |

## Viewing them

- **GitHub** renders the Mermaid blocks automatically — just open the file.
- **VS Code** — install the *Markdown Preview Mermaid Support* extension, then open preview.
- **Locally** — paste a block into <https://mermaid.live>.

> Note: Mermaid has no native use-case diagram type, so `use-case.md` is modeled as a
> flowchart — stadium nodes are use cases, dotted edges are `include` / `extend` relations.
