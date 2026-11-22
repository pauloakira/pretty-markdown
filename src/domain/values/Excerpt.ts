import { isHighlightColor, type HighlightColor } from "./Highlight";

/**
 * A passage the reader took from a document into their notes: the quoted text plus where
 * it came from, so the notes can link back to it (docs/RESEARCH_READER.md).
 *
 * In the notes file an excerpt is a plain Markdown quote whose last line is a link to its
 * page, e.g.
 *
 *     > The exponential map is surjective.
 *     > — [p. 133](Geometric%20Methods.pdf#page=133&ex=7f3a9c&color=yellow)
 *
 * Everything the app needs rides in that link, so the file reads as ordinary Markdown in
 * any editor, and `#page=` is the standard way to open a PDF at a page.
 */
export interface Excerpt {
  /** Short and stable; tells excerpts of the same passage apart, e.g. "7f3a9c". */
  readonly id: string;
  /** The source document's path relative to the notes file, e.g. "Geometric Methods.pdf". */
  readonly source: string;
  /** 1-based page number. */
  readonly page: number;
  /** The quoted text, on one line. */
  readonly text: string;
  readonly color: HighlightColor;
}

/** Where an excerpt link points: what `excerptHref` encodes. */
export interface ExcerptLink {
  readonly id: string;
  readonly source: string;
  readonly page: number;
  readonly color: HighlightColor;
}

/** Excerpt ids are short lowercase hex, so they survive in URLs and Markdown untouched. */
const ID_PATTERN = /^[0-9a-f]{4,32}$/;

export function isExcerptId(value: string): boolean {
  return ID_PATTERN.test(value);
}

/**
 * A new excerpt id from `random` (values in [0, 1), like `Math.random`; injected so the
 * domain stays deterministic under test). Six hex digits: 16.7 million values, plenty for
 * one notes file.
 */
export function newExcerptId(random: () => number): string {
  let id = "";
  for (let i = 0; i < 6; i += 1) id += Math.floor(random() * 16).toString(16);
  return id;
}

/** The link target for an excerpt: its source, page, id and colour. */
export function excerptHref(link: ExcerptLink): string {
  return `${encodeSource(link.source)}#page=${link.page}&ex=${link.id}&color=${link.color}`;
}

/**
 * Read an excerpt link back. Null for any other link, including a plain `file.pdf#page=3`
 * a person typed: without an excerpt id it's just a link.
 */
export function parseExcerptHref(href: string): ExcerptLink | null {
  const hash = href.indexOf("#");
  if (hash <= 0) return null;
  const params = new URLSearchParams(href.slice(hash + 1));
  const id = params.get("ex");
  const page = Number(params.get("page"));
  if (id === null || !isExcerptId(id) || !Number.isInteger(page) || page < 1) return null;
  const color = params.get("color");
  const source = decodeSource(href.slice(0, hash));
  if (source === null) return null;
  return { id, source, page, color: isHighlightColor(color) ? color : "yellow" };
}

/**
 * Text taken from a PDF, made fit for one line of a quote: line breaks and runs of spaces
 * become single spaces. A hyphen at a line end joins the word again: dropped before a
 * lower-case letter (a word split to fit the line), kept before a capital (a name such
 * as Baker-Campbell).
 */
export function normalizeExcerptText(text: string): string {
  return text
    .replace(/(\p{L})-\s*\n\s*(\p{Ll})/gu, "$1$2")
    .replace(/(\p{L})-\s*\n\s*(\p{Lu})/gu, "$1-$2")
    .replace(/\s+/g, " ")
    .trim();
}

/** The excerpt as Markdown: a quote of its text, then a line linking to its page. */
export function excerptToMarkdown(excerpt: Excerpt): string {
  return `> ${escapeQuoteText(excerpt.text)}\n> — [p. ${excerpt.page}](${excerptHref(excerpt)})`;
}

/**
 * Escape what Markdown (and the math plugin) would otherwise read as syntax: emphasis,
 * code, HTML, `$…$` math, tables, a link's `](` or `][`, and a list or heading marker at
 * the start. Ordinary punctuation is left alone, so the quote still reads well in other
 * editors. A lone `[` is not escaped: `\[` opens display math in the LaTeX dialect.
 */
export function escapeQuoteText(text: string): string {
  const escaped = text.replace(/[\\`*_<>$|~]|\](?=[([])/g, "\\$&");
  return escaped.replace(/^(#|[+\-=]|\d+[.)])/, (marker) =>
    marker.length === 1 ? `\\${marker}` : `${marker.slice(0, -1)}\\${marker.slice(-1)}`,
  );
}

/** Undo `escapeQuoteText` (any backslash-escaped ASCII punctuation, as Markdown does). */
export function unescapeQuoteText(text: string): string {
  return text.replace(/\\([!-/:-@[-`{-~])/g, "$1");
}

/**
 * Spaces, `#`, `%` and `?` would break the URL, and parentheses the Markdown link around
 * it (`encodeURIComponent` leaves those alone); slashes stay.
 */
function encodeSource(source: string): string {
  return source
    .split("/")
    .map((part) => encodeURIComponent(part).replace(/[()]/g, (c) => (c === "(" ? "%28" : "%29")))
    .join("/");
}

function decodeSource(raw: string): string | null {
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}
