import type MarkdownIt from "markdown-it";
import type { MacroMap, MathRenderer } from "../../domain/ports/MathRenderer";

/**
 * Minimal structural views of markdown-it's parser state — just the fields our rules
 * read. The real `StateInline`/`StateBlock` have a superset of these, so our rule
 * functions remain assignable to markdown-it's `RuleInline`/`RuleBlock` (contravariance),
 * while we stay decoupled from the library's deep type paths.
 */
interface MathToken {
  content: string;
  markup: string;
  block: boolean;
  map: [number, number] | null;
}

interface StateInline {
  src: string;
  pos: number;
  pending: string;
  push(type: string, tag: string, nesting: number): MathToken;
}

interface StateBlock {
  src: string;
  bMarks: number[];
  eMarks: number[];
  tShift: number[];
  blkIndent: number;
  line: number;
  push(type: string, tag: string, nesting: number): MathToken;
  getLines(begin: number, end: number, indent: number, keepLastLF: boolean): string;
}

export interface MathPluginOptions {
  readonly renderer: MathRenderer;
  /** Supplies the document-scoped macros for the current render pass (optional). */
  readonly getMacros?: () => MacroMap;
}

/**
 * markdown-it plugin that recognises math in both common dialects and emits
 * `math_inline` / `math_block` tokens carrying the raw LaTeX:
 *
 *   - `$…$` / `$$…$$`   — the markdown convention;
 *   - `\(…\)` / `\[…\]` — the LaTeX convention, which Pandoc, LaTeX exports and most AI
 *     assistants emit. Without this, such documents leak their source as literal text.
 *
 * Rendering is delegated to the injected {@link MathRenderer}, keeping the parser
 * independent of the math engine (see ARCHITECTURE.md §2). Tokenisation adapted from
 * waylonflinn's `markdown-it-katex` (MIT).
 */
export function mathPlugin(md: MarkdownIt, options: MathPluginOptions): void {
  const { renderer, getMacros } = options;

  // `\(` and `\[` must be matched *before* markdown-it's `escape` rule, which would
  // otherwise consume the backslash and leave a literal "(" behind.
  md.inline.ruler.before("escape", "math_inline_latex", mathInlineLatex);
  md.inline.ruler.after("escape", "math_inline", mathInline);

  const blockOpts = { alt: ["paragraph", "reference", "blockquote", "list"] };
  md.block.ruler.after("blockquote", "math_block", dollarMathBlock, blockOpts);
  md.block.ruler.after("math_block", "math_block_latex", bracketMathBlock, blockOpts);

  md.renderer.rules.math_inline = (tokens, idx) =>
    toHtml(renderer, tokens[idx].content, false, getMacros?.());
  md.renderer.rules.math_block = (tokens, idx) =>
    toHtml(renderer, tokens[idx].content, true, getMacros?.()) + "\n";
}

/**
 * Render a formula and wrap it in a `.pm-math` element carrying the source LaTeX in
 * `data-tex`. The wrapper makes the original source available to the copy-as-LaTeX
 * handler (see presentation/clipboard/latexCopy) and keeps render errors inline.
 */
function toHtml(
  renderer: MathRenderer,
  tex: string,
  display: boolean,
  macros: MacroMap | undefined,
): string {
  const result = renderer.render(tex, { display, macros });
  const inner = result.ok
    ? result.html
    : `<span class="math-error" title="${escapeAttr(result.error)}">${escapeHtml(
        result.source,
      )}</span>`;
  const cls = display ? "pm-math pm-math--block" : "pm-math";
  return `<span class="${cls}" data-tex="${escapeAttr(tex.trim())}">${inner}</span>`;
}

/** A `$` can open/close inline math depending on surrounding characters. */
function isValidInlineDelim(state: StateInline, pos: number): {
  canOpen: boolean;
  canClose: boolean;
} {
  const prevChar = state.src.charCodeAt(pos - 1);
  const nextChar = state.src.charCodeAt(pos + 1);
  let canOpen = true;
  let canClose = true;

  // Closing `$` may not follow whitespace or precede a digit (avoids `$5` currency).
  if (
    prevChar === 0x20 /* space */ ||
    prevChar === 0x09 /* tab */ ||
    (nextChar >= 0x30 /* 0 */ && nextChar <= 0x39 /* 9 */)
  ) {
    canClose = false;
  }
  // Opening `$` may not precede whitespace.
  if (nextChar === 0x20 || nextChar === 0x09) {
    canOpen = false;
  }
  return { canOpen, canClose };
}

function mathInline(state: StateInline, silent: boolean): boolean {
  if (state.src[state.pos] !== "$") return false;

  let res = isValidInlineDelim(state, state.pos);
  if (!res.canOpen) {
    if (!silent) state.pending += "$";
    state.pos += 1;
    return true;
  }

  // Scan for the closing `$`, skipping escaped `\$`.
  const start = state.pos + 1;
  let match = start;
  for (;;) {
    match = state.src.indexOf("$", match);
    if (match === -1) break;
    let pos = match - 1;
    let backslashes = 0;
    while (state.src[pos] === "\\") {
      pos -= 1;
      backslashes += 1;
    }
    if (backslashes % 2 === 0) break; // even backslashes → `$` is not escaped
    match += 1;
  }

  if (match === -1) {
    if (!silent) state.pending += "$";
    state.pos = start;
    return true;
  }
  if (match - start === 0) {
    if (!silent) state.pending += "$$";
    state.pos = start + 1;
    return true;
  }

  res = isValidInlineDelim(state, match);
  if (!res.canClose) {
    if (!silent) state.pending += "$";
    state.pos = start;
    return true;
  }

  if (!silent) {
    const token = state.push("math_inline", "math", 0);
    token.markup = "$";
    token.content = state.src.slice(start, match);
  }
  state.pos = match + 1;
  return true;
}

/**
 * LaTeX-style math: `\(…\)` inline and `\[…\]` display. Runs before the `escape` rule, so
 * an unclosed `\(` falls through and still escapes to a literal "(" as markdown expects.
 */
function mathInlineLatex(state: StateInline, silent: boolean): boolean {
  const src = state.src;
  const start = state.pos;
  if (src.charCodeAt(start) !== 0x5c /* \ */) return false;

  const opener = src[start + 1];
  if (opener !== "(" && opener !== "[") return false;

  const display = opener === "[";
  const closer = display ? "\\]" : "\\)";
  const contentStart = start + 2;
  const closeAt = src.indexOf(closer, contentStart);
  if (closeAt === -1) return false; // unclosed — let `escape` handle the backslash

  if (!silent) {
    // Display math inside a paragraph still renders as a block-level formula.
    const token = state.push(display ? "math_block" : "math_inline", "math", 0);
    token.markup = display ? "\\[" : "\\(";
    token.content = src.slice(contentStart, closeAt);
  }
  state.pos = closeAt + closer.length;
  return true;
}

/**
 * Builds a block rule for display math delimited by `open`/`close` (`$$…$$` or `\[…\]`),
 * spanning one or more lines.
 */
function makeMathBlockRule(open: string, close: string) {
  return function mathBlockRule(
    state: StateBlock,
    start: number,
    end: number,
    silent: boolean,
  ): boolean {
    let pos = state.bMarks[start] + state.tShift[start];
    let max = state.eMarks[start];

    if (pos + open.length > max) return false;
    if (state.src.slice(pos, pos + open.length) !== open) return false;

    pos += open.length;
    let firstLine = state.src.slice(pos, max);
    if (silent) return true;

    let found = false;
    let lastLine = "";
    if (firstLine.trim().slice(-close.length) === close) {
      firstLine = firstLine.trim().slice(0, -close.length); // single-line `$$ … $$`
      found = true;
    }

    let next = start;
    while (!found) {
      next += 1;
      if (next >= end) break;
      pos = state.bMarks[next] + state.tShift[next];
      max = state.eMarks[next];
      if (pos < max && state.tShift[next] < state.blkIndent) break;
      if (state.src.slice(pos, max).trim().slice(-close.length) === close) {
        const lastPos = state.src.slice(0, max).lastIndexOf(close);
        lastLine = state.src.slice(pos, lastPos);
        found = true;
      }
    }

    state.line = next + 1;

    const token = state.push("math_block", "math", 0);
    token.block = true;
    token.content =
      (firstLine.trim() ? firstLine + "\n" : "") +
      state.getLines(start + 1, next, state.tShift[start], true) +
      (lastLine.trim() ? lastLine : "");
    token.map = [start, state.line];
    token.markup = open;
    return true;
  };
}

const dollarMathBlock = makeMathBlockRule("$$", "$$");
const bracketMathBlock = makeMathBlockRule("\\[", "\\]");

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;");
}
