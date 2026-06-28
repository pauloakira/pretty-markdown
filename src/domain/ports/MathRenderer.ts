import type { RenderResult } from "../values/RenderResult";

export interface MathRenderOptions {
  /** true → display/block math (centered, larger); false → inline. */
  readonly display: boolean;
}

/**
 * Port: turns a LaTeX string into HTML. Implemented by infrastructure adapters
 * (KaTeX, MathJax, and — composed together — the KaTeX→MathJax fallback).
 *
 * Synchronous by design: KaTeX is sync on the hot path, and MathJax v3's
 * `tex2chtml` is also synchronous once started, so the fallback fits one interface.
 */
export interface MathRenderer {
  render(tex: string, opts: MathRenderOptions): RenderResult;
}
