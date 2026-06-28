import type { RenderResult } from "../values/RenderResult";

/** Custom macros: name → LaTeX expansion, e.g. `{ "\\RR": "\\mathbb{R}" }`. */
export type MacroMap = Record<string, string>;

export interface MathRenderOptions {
  /** true → display/block math (centered, larger); false → inline. */
  readonly display: boolean;
  /** Document-scoped macros (preamble + in-document `\gdef`). */
  readonly macros?: MacroMap;
}

/**
 * Port: turns a LaTeX string into HTML. Implemented by infrastructure adapters
 * (KaTeX, MathJax, and — composed together — the KaTeX→MathJax fallback).
 *
 * Synchronous by design: KaTeX is sync on the hot path, and MathJax's programmatic
 * `convert` (lite adaptor) is also synchronous, so the fallback fits one interface.
 */
export interface MathRenderer {
  render(tex: string, opts: MathRenderOptions): RenderResult;
}
