# pretty-markdown — Design

## 1. Problem & goals

Markdown readers/editors handle LaTeX math poorly: formulas break on real input, or the
reading experience feels like a code editor rather than a document viewer. We want:

1. **Reader experience like a PDF viewer** — open a file, it renders beautifully, fast
   scroll, find-in-page, clean typography.
2. **Robust LaTeX** — math that doesn't silently fail on real-world formulas.
3. **Edit & compile** — edit markdown and see it rendered live.
4. **Native, offline, fast** — feels like a real app, not a browser tab.

## 2. Locked decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Platform | **Tauri desktop** | Native file-open & file associations, offline, ~10MB binary vs Electron's ~150MB. |
| Frontend | **React + TypeScript** | Largest ecosystem for CodeMirror/markdown; easy to extend. |
| Math | **KaTeX → MathJax fallback** | Instant for the common case, ~99% coverage for the long tail, fully offline. |
| First milestone | **Reader first** | Fastest path to something that *feels* great; editor builds on the same render pipeline. |

A full TeX engine (Tectonic/WASM, TikZ via dvisvgm) is **out of scope for v1** but the
renderer is abstracted behind an interface so it can be added later as an opt-in.

## 3. Architecture

```
┌──────────────────────────────────────────────────────────┐
│  Tauri core (Rust)                                         │
│   • File I/O, watch-for-changes                            │
│   • OS file associations (double-click .md → open)         │
│   • Recent files, window state                             │
│   • (future) embedded TeX engine, native fast search       │
├──────────────────────────────────────────────────────────┤
│  Frontend (React + TS)                                     │
│                                                            │
│   Source ──► markdown-it ──► AST ──► React render          │
│                  │                                         │
│                  └─ math tokens ──► MathRenderer            │
│                                       ├─ KaTeX (sync)       │
│                                       └─ MathJax (fallback) │
│                                                            │
│   Modes:  [Reader]   full-width rendered document          │
│           [Edit]     split pane: CodeMirror ⇆ live preview │
└──────────────────────────────────────────────────────────┘
```

### 3.1 Rendering pipeline

1. Parse markdown with `markdown-it`, plus a math plugin that emits `math_inline` /
   `math_block` tokens for `$...$` and `$$...$$`.
2. Render markdown tokens to React elements.
3. Each math token goes through the **MathRenderer** abstraction:
   - Try **KaTeX** (synchronous, instant). On `ParseError`, fall back to **MathJax**.
   - Render errors are shown inline (red, with the source) rather than crashing the doc.
4. **Incremental rendering:** hash markdown blocks; on edit, only re-render changed blocks
   so large documents stay smooth on every keystroke.

```ts
interface MathRenderer {
  render(tex: string, opts: { display: boolean }): RenderResult; // {html} | {error}
}
// KatexRenderer, MathJaxRenderer, (future) TexEngineRenderer
// CompositeRenderer tries each in order until one succeeds.
```

### 3.2 Reader vs Edit modes

- **Reader mode** — no editor; rendered document at comfortable reading width, generous
  line-height, proper math spacing. Toolbar: open, find, font size, toggle to edit.
- **Edit mode** — CodeMirror 6 (markdown highlighting) on the left, live preview on the
  right, with synced scrolling. Same render pipeline as reader mode.

### 3.3 LaTeX robustness strategy

- KaTeX handles inline/display math and AMS environments instantly.
- MathJax catches macros/constructs KaTeX rejects.
- **Custom macros / preamble:** support a `\newcommand` block (document front-matter or a
  settings file) fed to both renderers so users can define their own commands.
- Math errors never break the page — they render inline as a clearly-marked error chip.

## 4. Performance targets

- Open a 50-page document and first paint < 500ms.
- Keystroke-to-preview latency < 50ms on a 5,000-line document (via incremental render).
- Cold app start < 1s.

## 5. Out of scope for v1

- Full TeX engine / TikZ diagrams (interface ready, not implemented).
- Real-time collaboration.
- Mobile.
- Export to PDF (planned, post-v1 — likely via the existing render pipeline → print).

## 6. Open questions

- Markdown flavor: CommonMark + GFM (tables, task lists, strikethrough) — assumed yes.
- Theming: light/dark + a serif "reading" theme; user-adjustable font size. Confirm scope.
- Sync-scroll algorithm in edit mode: source-line ↔ rendered-block mapping.
