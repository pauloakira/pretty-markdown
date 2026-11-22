import type MarkdownIt from "markdown-it";
import type StateCore from "markdown-it/lib/rules_core/state_core.mjs";
import type Token from "markdown-it/lib/token.mjs";
import { parseExcerptHref, type ExcerptLink } from "../../domain/values/Excerpt";

/**
 * Renders excerpts (docs/RESEARCH_READER.md) as excerpt blocks: a quote whose last line
 * links back to its page,
 *
 *     > The exponential map is surjective.
 *     > — [p. 133](Geometric%20Methods.pdf#page=133&ex=7f3a9c&color=yellow&rect=…)
 *
 * becomes
 *
 *     <blockquote class="excerpt excerpt--yellow" data-excerpt="7f3a9c" data-source="…" data-page="133">
 *       <p>The exponential map is surjective.</p>
 *       <p class="excerpt__source"><a href="…"><span aria-hidden="true">↗ </span>p. 133 · Geometric Methods</a></p>
 *     </blockquote>
 *
 * Only a link with an excerpt id counts, and only on a line of its own after a dash, so a
 * quote that merely ends in a link stays an ordinary quote. The link keeps its href and
 * its text (the reader may have reworded it); the document's name is added after it.
 */
export function excerptBlocks(md: MarkdownIt): void {
  md.core.ruler.push("excerpt_blocks", (state) => {
    // Backwards, so the tokens added or removed in one quote don't shift the ones still
    // to be visited.
    for (let i = state.tokens.length - 1; i >= 0; i -= 1) {
      if (state.tokens[i].type === "blockquote_close") renderExcerpt(state, i);
    }
  });
}

/** A dash that opens the source line: an em dash, or the en dash `--` becomes. */
const SOURCE_DASH = /^\s*[—–]\s*$/;

function renderExcerpt(state: StateCore, close: number): void {
  const { tokens } = state;
  const inline = tokens[close - 2];
  if (tokens[close - 1]?.type !== "paragraph_close" || inline?.type !== "inline") return;
  const children = inline.children ?? [];

  const source = sourceLine(children);
  if (!source) return;
  const open = openingOf(tokens, close);
  if (open < 0) return;

  const quote = tokens[open];
  quote.attrJoin("class", `excerpt excerpt--${source.link.color}`);
  quote.attrSet("data-excerpt", source.link.id);
  quote.attrSet("data-source", source.link.source);
  quote.attrSet("data-page", String(source.link.page));

  // The quote's own text: everything before the line break that starts the source line.
  // When the source line was a paragraph of its own (a blank `>` line before it), that
  // paragraph goes.
  const text = children.slice(0, source.start);
  const at = close - 3; // paragraph_open
  const dropParagraph = text.length === 0;
  if (!dropParagraph) inline.children = text;

  const sourceTokens = sourceParagraph(state, source, children, quote.level + 1);
  tokens.splice(dropParagraph ? at : close, dropParagraph ? 3 : 0, ...sourceTokens);
}

interface SourceLine {
  readonly link: ExcerptLink;
  /** Index in the paragraph's children where the source line starts (its line break). */
  readonly start: number;
  /** Indices of the link's opening and closing tokens. */
  readonly linkOpen: number;
  readonly linkClose: number;
}

/**
 * The paragraph's last line, if it's "— [text](excerpt link)": a dash, then an excerpt
 * link, then nothing but white space.
 */
function sourceLine(children: Token[]): SourceLine | null {
  let end = children.length - 1;
  while (end >= 0 && children[end].type === "text" && children[end].content.trim() === "") end -= 1;
  if (children[end]?.type !== "link_close") return null;

  let linkOpen = end - 1;
  while (linkOpen >= 0 && children[linkOpen].type !== "link_open") linkOpen -= 1;
  if (linkOpen < 1) return null;
  const link = parseExcerptHref(children[linkOpen].attrGet("href") ?? "");
  if (!link) return null;

  const dash = children[linkOpen - 1];
  if (dash.type !== "text" || !SOURCE_DASH.test(dash.content)) return null;
  const lineBreak = linkOpen - 2;
  if (lineBreak >= 0 && !["softbreak", "hardbreak"].includes(children[lineBreak].type)) return null;

  return { link, start: Math.max(lineBreak, 0), linkOpen, linkClose: end };
}

/** The `blockquote_open` matching the `blockquote_close` at `close`. */
function openingOf(tokens: Token[], close: number): number {
  const level = tokens[close].level;
  for (let i = close - 1; i >= 0; i -= 1) {
    if (tokens[i].type === "blockquote_open" && tokens[i].level === level) return i;
  }
  return -1;
}

/** `<p class="excerpt__source">` holding the source link, as block tokens. */
function sourceParagraph(state: StateCore, source: SourceLine, children: Token[], level: number): Token[] {
  const open = new state.Token("paragraph_open", "p", 1);
  open.attrSet("class", "excerpt__source");
  open.block = true;
  open.level = level;

  const linkOpen = children[source.linkOpen];
  linkOpen.attrJoin("class", "excerpt__link");
  const arrowOpen = new state.Token("excerpt_arrow_open", "span", 1);
  arrowOpen.attrSet("aria-hidden", "true");
  const arrow = new state.Token("text", "", 0);
  arrow.content = "↗ ";
  const arrowClose = new state.Token("excerpt_arrow_close", "span", -1);
  const documentName = new state.Token("text", "", 0);
  documentName.content = ` · ${displayName(source.link.source)}`;

  const inline = new state.Token("inline", "", 0);
  inline.level = level + 1;
  inline.content = "";
  inline.children = [
    linkOpen,
    arrowOpen,
    arrow,
    arrowClose,
    ...children.slice(source.linkOpen + 1, source.linkClose),
    documentName,
    children[source.linkClose],
  ];

  const close = new state.Token("paragraph_close", "p", -1);
  close.block = true;
  close.level = level;
  return [open, inline, close];
}

/** "papers/Geometric Methods.pdf" → "Geometric Methods". */
function displayName(source: string): string {
  const name = source.slice(source.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}
