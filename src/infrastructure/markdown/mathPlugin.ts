import type MarkdownIt from "markdown-it";
import type { MathRenderer } from "../../domain/ports/MathRenderer";

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
}

/**
 * markdown-it plugin that recognises `$...$` (inline) and `$$...$$` (block) math and
 * emits `math_inline` / `math_block` tokens carrying the raw LaTeX. Rendering is then
 * delegated to the injected {@link MathRenderer}, keeping the parser independent of the
 * math engine (see ARCHITECTURE.md §2). Tokenisation adapted from waylonflinn's
 * `markdown-it-katex` (MIT).
 */
export function mathPlugin(md: MarkdownIt, options: MathPluginOptions): void {
  const { renderer } = options;

  md.inline.ruler.after("escape", "math_inline", mathInline);
  md.block.ruler.after("blockquote", "math_block", mathBlock, {
    alt: ["paragraph", "reference", "blockquote", "list"],
  });

  md.renderer.rules.math_inline = (tokens, idx) =>
    toHtml(renderer, tokens[idx].content, false);
  md.renderer.rules.math_block = (tokens, idx) =>
    toHtml(renderer, tokens[idx].content, true) + "\n";
}

function toHtml(renderer: MathRenderer, tex: string, display: boolean): string {
  const result = renderer.render(tex, { display });
  if (result.ok) return result.html;
  // Render errors never break the page — show the source as a clearly-marked chip.
  const cls = display ? "math-error math-error--block" : "math-error";
  return `<span class="${cls}" title="${escapeAttr(result.error)}">${escapeHtml(
    result.source,
  )}</span>`;
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

function mathBlock(
  state: StateBlock,
  start: number,
  end: number,
  silent: boolean,
): boolean {
  let pos = state.bMarks[start] + state.tShift[start];
  let max = state.eMarks[start];

  if (pos + 2 > max) return false;
  if (state.src.slice(pos, pos + 2) !== "$$") return false;

  pos += 2;
  let firstLine = state.src.slice(pos, max);
  if (silent) return true;

  let found = false;
  let lastLine = "";
  if (firstLine.trim().slice(-2) === "$$") {
    firstLine = firstLine.trim().slice(0, -2); // single-line `$$ ... $$`
    found = true;
  }

  let next = start;
  while (!found) {
    next += 1;
    if (next >= end) break;
    pos = state.bMarks[next] + state.tShift[next];
    max = state.eMarks[next];
    if (pos < max && state.tShift[next] < state.blkIndent) break;
    if (state.src.slice(pos, max).trim().slice(-2) === "$$") {
      const lastPos = state.src.slice(0, max).lastIndexOf("$$");
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
  token.markup = "$$";
  return true;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;");
}
