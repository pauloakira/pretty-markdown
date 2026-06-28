# Diagrams

UML diagrams for pretty-markdown, written in [PlantUML](https://plantuml.com) so they stay
text-based and version-controlled alongside the code.

| File | Diagram |
|------|---------|
| [`use-case.puml`](use-case.puml) | Use case diagram — actors and what they can do |
| [`sequence-open-document.puml`](sequence-open-document.puml) | Sequence — open a document in a new tab, render math with KaTeX→MathJax fallback |
| [`sequence-edit-live-preview.puml`](sequence-edit-live-preview.puml) | Sequence — edit mode incremental live preview |

## Rendering them

**VS Code:** install the *PlantUML* extension, open a `.puml`, `Alt+D` to preview.

**CLI** (needs Java + Graphviz):

```bash
brew install plantuml        # macOS
plantuml diagram/*.puml      # outputs PNGs next to the sources
```

**Online:** paste the file contents into <https://www.plantuml.com/plantuml>.
