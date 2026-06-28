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
