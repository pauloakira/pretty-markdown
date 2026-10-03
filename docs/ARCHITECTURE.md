# Architecture & Engineering Guidelines

This document defines the software-engineering patterns, architecture, and conventions the
`pretty-markdown` codebase follows. It complements [DESIGN.md](../DESIGN.md) (what we're
building) by describing **how** we build it. Keep it current as the code evolves.

---

## 1. Architectural style — Layered / Clean Architecture

The frontend is organized into four layers. **Dependencies point inward only**: an outer
layer may depend on an inner one, never the reverse. The Domain layer has zero framework
imports (no React, no Tauri).

```
Presentation  ──►  Application  ──►  Domain  ◄──  Infrastructure
 (React UI)        (orchestration)   (models +        (adapters that
                                      interfaces)      implement Domain
                                                       interfaces)
```

| Layer | Contains | May import | Must NOT import |
|-------|----------|-----------|-----------------|
| **Domain** | Entities (`Document`, `Tab`, `Workspace`), value objects, interfaces (`MathRenderer`, `FileSystem`, `SessionStore`) | nothing (pure TS) | React, Tauri, any adapter |
| **Application** | Services (`DocumentService`, `TabManager`), use-case commands, orchestration | Domain | React, Tauri, concrete adapters |
| **Infrastructure** | Adapters implementing Domain interfaces (`TauriFileSystem`, `KatexRenderer`, `MathJaxRenderer`, `CompositeMathRenderer`, `TauriSessionStore`) | Domain | Application, Presentation |
| **Presentation** | React components, hooks, view-state | Application, Domain (types) | Infrastructure directly* |

\* Presentation receives infrastructure implementations via **dependency injection** (a
composition root), not by importing concrete classes.

### Dependency Inversion in practice

Domain declares the interface; Infrastructure implements it; the composition root wires them:

```ts
// domain/ports/MathRenderer.ts        (interface — the "port")
export interface MathRenderer {
  render(tex: string, opts: { display: boolean }): RenderResult;
}

// infrastructure/math/KatexRenderer.ts (adapter)
export class KatexRenderer implements MathRenderer { /* ... */ }

// app composition root wires concrete adapters into services once, at startup.
```

This keeps the domain testable in isolation and lets us swap KaTeX/MathJax for a full TeX
engine later without touching Application or Presentation code.

---

## 2. Design patterns we use

| Pattern | Where | Why |
|---------|-------|-----|
| **Ports & Adapters (Hexagonal)** | `MathRenderer`, `FileSystem`, `SessionStore` interfaces + Tauri/KaTeX/MathJax adapters | Decouple domain from frameworks; enable testing with fakes |
| **Strategy** | Each concrete `MathRenderer` is an interchangeable strategy | Pick rendering engine at runtime |
| **Composite / Chain of Responsibility** | `CompositeMathRenderer` tries KaTeX → MathJax in order | The fallback pipeline, behind one interface |
| **Command** | User intents (`OpenDocumentCommand`, `CloseTabCommand`, `SaveCommand`) | Encapsulate actions; enables undo, keybinding maps, testability |
| **Observer / Pub-Sub** | `TabManager` state → Presentation subscribes | React re-renders on workspace changes without prop-drilling |
| **Repository / Service** | `DocumentService` mediates file I/O + rendering | One place for document lifecycle logic |
| **Memoization / Cache** | Per-tab render cache keyed by block hash | Incremental rendering; skip unchanged blocks |
| **Factory** | Tab creation, renderer construction at the composition root | Centralize wiring |

Apply patterns **only where they remove real duplication or coupling** — avoid speculative
abstraction. A pattern that doesn't yet earn its keep is just indirection.

---

## 3. Folder structure

```
src/
├─ domain/                 # pure TS — no framework imports
│  ├─ entities/            # Document, Tab, Workspace
│  ├─ values/             # RenderResult, ViewState, ...
│  └─ ports/               # MathRenderer, FileSystem, SessionStore (interfaces)
├─ application/
│  ├─ services/            # DocumentService, TabManager
│  └─ commands/            # OpenDocument, CloseTab, Save, ToggleMode, ...
├─ infrastructure/
│  ├─ fs/                  # TauriFileSystem
│  ├─ math/                # KatexRenderer, MathJaxRenderer, CompositeMathRenderer
│  ├─ markdown/            # markdown-it pipeline + math plugin
│  └─ persistence/         # TauriSessionStore
├─ presentation/
│  ├─ components/          # TabBar, Reader, Editor, Toolbar, Find
│  ├─ hooks/               # useTabs, useDocument, useCommands
│  └─ theme/               # tokens, light/dark/serif
├─ composition/            # composition root: wire adapters → services → app
└─ main.tsx                # entry

src-tauri/                 # Rust core (file assoc, FS, session, future TeX engine)
```

---

## 4. Coding conventions

- **Language:** TypeScript everywhere, `strict` mode on. No `any` — use `unknown` + narrowing.
- **Modules:** one primary export per file; named exports preferred over default exports.
- **Immutability:** treat domain entities as immutable; produce new state rather than mutating.
- **Errors:** model expected failures as values (`Result<T, E>` / discriminated unions), not
  thrown exceptions. Reserve `throw` for programmer errors. Math render failures are values.
- **Pure core:** Domain and Application contain no side effects beyond the injected ports.
- **Naming:** `PascalCase` types/components, `camelCase` functions/vars, `SCREAMING_SNAKE` consts.
- **No barrels across layers** that would let an inner layer import an outer one.
- **Comments** explain *why*, not *what*; match surrounding density.

---

## 5. State management

- **Workspace/tab state** lives in `TabManager` (Application), exposed to React via a thin
  store/subscription hook. The UI is a function of that state.
- **Per-tab view state** (scroll, mode, font size, cursor) is owned by the tab, not global.
- Keep React state local to components when it never leaves the component; promote to the
  Application layer only when shared or persisted.

---

## 6. Testing strategy

| Level | Target | Tooling |
|-------|--------|---------|
| **Unit** | Domain entities, Application services with fake ports | Vitest |
| **Component** | Presentation components in isolation | Vitest + Testing Library |
| **Integration** | Render pipeline (markdown → math → html), tab lifecycle | Vitest |
| **E2E** (later) | App flows in the built Tauri app | Playwright / Tauri driver |

Principles: test behavior through public interfaces, not internals. Fakes for ports (an
in-memory `FileSystem`, a stub `MathRenderer`) over mocks where possible. Every bug fix
gets a regression test. Aim for fast, deterministic tests — no real file system in unit tests.

---

## 7. Quality gates & workflow

- **Formatting/linting:** Prettier + ESLint (TS, React hooks rules); `cargo fmt` + `clippy` for Rust.
- **Type check:** `tsc --noEmit` must pass; CI blocks on type errors.
- **Commits:** Conventional Commits (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`).
- **Branches:** feature branches → PR → review → merge to `main`. Keep `main` releasable.
- **Checkpoints:** for multi-file work, commit at logical milestones, not all at the end.
- **Definition of done:** types pass, lint clean, tests green, docs updated when behavior changes.

---

## 8. Performance principles

- **Incremental over full re-render** — hash blocks, re-render only what changed.
- **Lazy mount** inactive tabs; keep their state in memory, off the DOM.
- **Synchronous-first math** (KaTeX) on the hot path; async (MathJax) only on fallback.
- Measure before optimizing; keep the perf targets in [DESIGN.md](../DESIGN.md) §4 honest.

---

## 9. Decision log

Record notable architectural decisions here (lightweight ADR style) as the project evolves.

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-06-28 | Tauri + React + TS, KaTeX→MathJax, reader-first, multi-tab | See DESIGN.md §2 |
| 2026-06-28 | Layered/clean architecture with ports & adapters | Keep domain framework-independent, swappable renderers |
| 2026-06-28 | Custom markdown-it math plugin emits tokens; rendering delegated to injected `MathRenderer` | Keep the parser independent of the math engine, per the Strategy/Composite design |
| 2026-06-28 | Native Rust `read_text_file` command for file reads; `tauri-plugin-dialog` for the open dialog | Avoid fs-plugin scope config; keep the `FileReader` adapter thin |
| 2026-06-28 | `mathPlugin` uses local structural types for parser state instead of `@types/markdown-it` deep paths | Those types aren't reachable through `export =`; structural views stay decoupled and assignable |
| 2026-06-28 | Workspace modeled as immutable state + pure ops; `TabManager` holds it and exposes a useSyncExternalStore-shaped store | Single source of truth (Observer); pure ops are trivially testable and return same ref when unchanged |
| 2026-06-28 | Tabs lazy-mount via React `key={tab.id}`; scroll restored on mount, persisted on unmount | Keeps inactive tabs off the DOM while preserving per-tab scroll; matches DESIGN §3.4 |
| 2026-06-28 | Per-tab rendered HTML cached by tab id in the presentation hook | Switching back to a tab is instant without re-running the markdown/math pipeline |
| 2026-06-28 | MathJax fallback uses `mathjax-full` with SVG output + lite adaptor; `formatError` throws | Self-contained output (no font CSS); synchronous; parse failures become failure values for the error chip |
| 2026-06-28 | Macros scoped per `render()` pass (fresh copy of preamble); KaTeX persists in-doc `\gdef` | Document-wide defs without leaking across tabs; MathJax gets the static preamble |
| 2026-06-28 | Copy-as-LaTeX via a global `copy` handler reading `data-tex` off the `.pm-math` wrapper | Source LaTeX on the clipboard when a selection sits within one formula; no change otherwise |
| 2026-06-28 | MathJax split into its own Vite chunk; still eagerly loaded | Keeps the main app chunk small; lazy-loading on first fallback is deferred (sync renderer interface) |
| 2026-06-28 | Container lifted into a React context (`ContainerProvider`/`useContainer`) | One shared composition root for all hooks (was: `useWorkspace` built its own) |
| 2026-06-28 | Settings persisted in localStorage; applied live as CSS variables (`--reading-width`, `--reader-font-scale`) | Simple offline persistence; the reader is themed by variables, so changes are instant |
| 2026-06-28 | Find-in-page wraps matches in `<mark>` and scrolls via container `scrollTop` (replaced the CSS Custom Highlight API + `scrollIntoView`) | The Highlight API didn't paint and `scrollIntoView` didn't move nested overflow in WKWebView; `<mark>` + manual scroll are universally reliable |
| 2026-06-28 | `Reader` sets document HTML imperatively (ref + `innerHTML`) instead of `dangerouslySetInnerHTML` | React owned the subtree and re-applied its HTML on every find keystroke, wiping the `<mark>` nodes and resetting scroll. Imperative content keeps React out of that subtree so find's DOM mutations survive. Verified live in the webview — unit tests can't catch this React/innerHTML interaction |
| 2026-06-28 | M4 editor: CodeMirror 6, uncontrolled (created once per tab via `key`); edits flow out via an update listener | CM owns its own state/undo; React stays out of the editor's DOM. Trade-off: undo history resets on tab switch (editor remounts) |
| 2026-06-28 | Editing updates tab content immediately; the live preview re-renders on a 120ms debounce | Immediate content update keeps dirty/save correct and cheap; debouncing only the expensive markdown+math render keeps typing smooth. True per-block incremental rendering is deferred |
| 2026-06-28 | Reader-mode HTML memoized by content string (not tab id) | Content now changes (editing), so the cache must key on content; edit mode renders its own preview and skips this path |
| 2026-06-28 | Session restore stores file paths (not content) as JSON in the app config dir; content re-read from disk on launch | Tiny payload; always shows current on-disk content. Trade-off: unsaved edits aren't preserved — the quit prompt warns when tabs are dirty. New `SessionRepository`/`AppWindow` ports keep Tauri out of the domain |
| 2026-06-28 | Window close intercepted via `AppWindow.onCloseRequested` (preventDefault) → React prompt → `destroy()` | Lets the app show a "reopen tabs?" modal before quitting; needs `core:window:allow-destroy`. Cmd+W still closes tabs (we intercept it), so the window close is the red button / Cmd+Q |
| 2026-10-03 | Session is **autosaved** (debounced, only when paths/active/mode/scroll change); ⌘Q goes through our own app-menu item (`quit-requested` → prompt → `exit_app`); launch-time restore **merges** with files opened first | Supersedes prompt-only saving: macOS ⌘Q/Dock Quit call `terminate:` and tao has no cancellable `applicationShouldTerminate:`, so `prevent_exit()` can't hold them — the prompt never ran and a months-old session was restored every launch. Restore used to *skip* when a Finder-opened file beat it, which autosave would have made destructive |
| 2026-06-28 | File associations: Rust captures the macOS `Opened` event + CLI args, buffers in `PendingFiles`, emits `open-files`; frontend listens + drains on launch | Handles both cold-start (drain queue) and while-running (event); `openDocument` dedupes so a double-delivered path just focuses the tab |
| 2026-06-28 | File-watch via a single `notify` watcher; clean tabs reload silently, dirty tabs show a Reload/Keep banner; `Tab.revision` remounts the editor on reload | Own saves are ignored (disk == content). Watching file paths directly (not dirs) — atomic-rename saves by some editors are a known gap |
| 2026-06-28 | Math plugin accepts both dialects: `$…$`/`$$…$$` and `\(…\)`/`\[…\]`, with the LaTeX rule registered *before* markdown-it's `escape` | `\(` is a valid markdown escape, so `escape` ate the backslash and leaked `(x)` as literal text. Documents from LaTeX/Pandoc/AI assistants are common in this app's audience; an unclosed `\(` still falls through to `escape` |
| 2026-06-28 | PDF export via print-to-PDF: inject the rendered HTML into `#print-root`, a `@media print` sheet shows only that, then `window.print()` | KaTeX/MathJax output is vector, so print → "Save as PDF" gives crisp, selectable PDFs — unlike html2canvas rasterization or weak Rust HTML→PDF. `DocumentExporter` port leaves room for a native dialog-free adapter later |
