import { fileName } from "../entities/Document";
import {
  excerptToMarkdown,
  parseExcerptHref,
  unescapeQuoteText,
  type Excerpt,
} from "./Excerpt";
import type { HighlightColor } from "./Highlight";

/**
 * A document's notes file: plain Markdown next to the document, named after it
 * ("Geometric Methods.pdf" → "Geometric Methods.notes.md"). It holds the reader's
 * excerpts as quotes, under headings they choose, with their own writing in between.
 * New excerpts go under "## Unsorted" until the reader files them
 * (docs/RESEARCH_READER.md).
 *
 * These functions edit the file's text and nothing else: whatever the reader wrote stays
 * exactly as it was.
 */

/** The heading new excerpts are added under. */
export const UNSORTED_HEADING = "Unsorted";

/** The notes file for the document at `documentPath`, in the same folder. */
export function notesPathFor(documentPath: string): string {
  const name = fileName(documentPath);
  const folder = documentPath.slice(0, documentPath.length - name.length);
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  return `${folder}${stem}.notes.md`;
}

/** Whether `path` is a notes file (by name), e.g. to label its tab or skip it elsewhere. */
export function isNotesPath(path: string): boolean {
  return /\.notes\.md$/i.test(path);
}

/** A new notes file for the document called `documentName`, ready for excerpts. */
export function newNotesFile(documentName: string): string {
  const dot = documentName.lastIndexOf(".");
  const title = dot > 0 ? documentName.slice(0, dot) : documentName;
  return `# Notes on ${title}\n\n## ${UNSORTED_HEADING}\n`;
}

/**
 * The notes with `excerpt` added at the end of the "Unsorted" section, which is created
 * at the end of the file if it isn't there. `notes` null means the file doesn't exist
 * yet: it's started with `newNotesFile(documentName)`.
 */
export function addExcerpt(notes: string | null, excerpt: Excerpt, documentName: string): string {
  const text = notes ?? newNotesFile(documentName);
  const eol = lineEnding(text);
  const lines = splitLines(text);
  const block = excerptToMarkdown(excerpt).split("\n");

  const section = findSection(lines, UNSORTED_HEADING);
  if (section === null) {
    const body = trimTrailingBlank(lines);
    const before = body.length === 0 ? [] : [...body, ""];
    return joinLines([...before, `## ${UNSORTED_HEADING}`, "", ...block], eol);
  }
  const head = trimTrailingBlank(lines.slice(0, section.end));
  const tail = lines.slice(section.end);
  const after = tail.length === 0 ? [] : ["", ...tail];
  return joinLines([...head, "", ...block, ...after], eol);
}

/**
 * The notes cut into what the Notes panel shows: excerpt cards, each an excerpt with the
 * reader's **note** on it, and the text around them (titles, headings, anything before
 * the first excerpt). An excerpt's note is everything written after its quote up to the
 * next excerpt or heading, so a paragraph typed under a quote in any editor belongs to it.
 */
export type NotesSegment =
  | { readonly kind: "text"; readonly markdown: string }
  | {
      readonly kind: "excerpt";
      readonly excerpt: Excerpt;
      /** The quote's own Markdown (its `>` lines, link included). */
      readonly quote: string;
      /** The reader's note on it, as Markdown; "" when there's none. */
      readonly note: string;
    };

export function segmentNotes(notes: string): NotesSegment[] {
  const lines = splitLines(notes);
  const segments: NotesSegment[] = [];
  let at = 0;
  const pushText = (from: number, to: number) => {
    const markdown = trimBlankEnds(lines.slice(from, to)).join("\n");
    if (markdown !== "") segments.push({ kind: "text", markdown });
  };
  for (const card of cards(lines)) {
    pushText(at, card.start);
    segments.push({
      kind: "excerpt",
      excerpt: card.excerpt,
      quote: lines.slice(card.start, card.quoteEnd).join("\n"),
      note: trimBlankEnds(lines.slice(card.quoteEnd, card.end)).join("\n"),
    });
    at = card.end;
  }
  pushText(at, lines.length);
  return segments;
}

/**
 * The notes with the note on excerpt `id` replaced by `note` (the reader's Markdown;
 * blank lines at its ends are dropped, and an empty note removes it). Unchanged if the
 * excerpt isn't there.
 */
export function setNote(notes: string, id: string, note: string): string {
  const lines = splitLines(notes);
  const card = cards(lines).find((c) => c.excerpt.id === id);
  if (card === undefined) return notes;
  const written = trimBlankEnds(splitLines(note).map((line) => line.trimEnd()));
  const rest = lines.slice(card.end);
  const updated = [
    ...lines.slice(0, card.quoteEnd),
    ...(written.length > 0 ? ["", ...written] : []),
    ...(rest.length > 0 ? ["", ...rest] : []),
  ];
  return joinLines(updated, lineEnding(notes));
}

/** What `takeExcerpt` removed, to put it back (Undo). */
export interface TakenExcerpt {
  readonly notes: string;
  /** The removed lines: the quote and its note. */
  readonly block: readonly string[];
  /** The line the block started at, where Undo puts it back. */
  readonly at: number;
}

/**
 * The notes without excerpt `id` and its note, with what was removed. Null if it isn't
 * there, e.g. the reader already deleted it by hand.
 */
export function takeExcerpt(notes: string, id: string): TakenExcerpt | null {
  const lines = splitLines(notes);
  const card = cards(lines).find((c) => c.excerpt.id === id);
  if (card === undefined) return null;
  let start = card.start;
  // The blank line before it goes too, so no double gap is left behind.
  if (start > 0 && lines[start - 1].trim() === "") start -= 1;
  const block = trimBlankEnds(lines.slice(card.start, card.end));
  const rest = lines.slice(card.end);
  const kept = [...lines.slice(0, start), ...(start > 0 && rest.length > 0 ? [""] : []), ...rest];
  return { notes: joinLines(trimLeadingBlank(kept), lineEnding(notes)), block, at: start };
}

/** The notes without excerpt `id` and its note. Unchanged if it isn't there. */
export function removeExcerpt(notes: string, id: string): string {
  return takeExcerpt(notes, id)?.notes ?? notes;
}

/** Put back what `takeExcerpt` removed, at the line it was taken from (or the end). */
export function restoreExcerpt(notes: string, taken: Pick<TakenExcerpt, "block" | "at">): string {
  const lines = splitLines(notes);
  const at = Math.min(taken.at, lines.length);
  const before = trimTrailingBlank(lines.slice(0, at));
  const after = trimLeadingBlank(lines.slice(at));
  const updated = [
    ...before,
    ...(before.length > 0 ? [""] : []),
    ...taken.block,
    ...(after.length > 0 ? ["", ...after] : []),
  ];
  return joinLines(updated, lineEnding(notes));
}

/** The notes with excerpt `id` in `color` (its link's colour). Unchanged if it isn't there. */
export function setExcerptColor(notes: string, id: string, color: HighlightColor): string {
  const lines = splitLines(notes);
  const card = cards(lines).find((c) => c.excerpt.id === id);
  if (card === undefined) return notes;
  const source = card.quoteEnd - 1;
  const recoloured = lines[source].replace(/([#&]color=)[a-z]+/, `$1${color}`);
  if (recoloured === lines[source]) return notes;
  const updated = [...lines];
  updated[source] = recoloured;
  return joinLines(updated, lineEnding(notes));
}

interface Card {
  readonly excerpt: Excerpt;
  /** First line of the quote. */
  readonly start: number;
  /** One past the quote's last line. */
  readonly quoteEnd: number;
  /** One past the note's last line: the next excerpt or heading, or the end. */
  readonly end: number;
}

/** Each excerpt with the lines of its note (up to the next excerpt or heading). */
function cards(lines: readonly string[]): Card[] {
  const quotes = parseQuotes(lines);
  return quotes.map((quote, n) => {
    const limit = n + 1 < quotes.length ? quotes[n + 1].start : lines.length;
    let end = limit;
    let fence: string | null = null;
    for (let i = quote.end; i < limit; i += 1) {
      const fenceMatch = FENCE.exec(lines[i]);
      if (fence !== null) {
        if (fenceMatch !== null && fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length) fence = null;
        continue;
      }
      if (fenceMatch !== null) {
        fence = fenceMatch[1];
        continue;
      }
      if (HEADING.test(lines[i])) {
        end = i;
        break;
      }
    }
    return { excerpt: quote.excerpt, start: quote.start, quoteEnd: quote.end, end };
  });
}

function trimLeadingBlank(lines: readonly string[]): string[] {
  let start = 0;
  while (start < lines.length && lines[start].trim() === "") start += 1;
  return lines.slice(start);
}

function trimBlankEnds(lines: readonly string[]): string[] {
  return trimLeadingBlank(trimTrailingBlank(lines));
}

/** An excerpt found in a notes file, with the heading it's filed under. */
export interface FiledExcerpt {
  readonly excerpt: Excerpt;
  /** The nearest heading above it, or null if it comes before any heading. */
  readonly heading: string | null;
}

/** Every excerpt in the notes, in file order. Other quotes and text are skipped. */
export function readExcerpts(notes: string): FiledExcerpt[] {
  return parseQuotes(splitLines(notes)).map(({ excerpt, heading }) => ({ excerpt, heading }));
}

interface ParsedQuote extends FiledExcerpt {
  /** First line of the quote. */
  readonly start: number;
  /** One past its last line. */
  readonly end: number;
}

const QUOTE_LINE = /^ {0,3}>/;
const SOURCE_LINE = /^ {0,3}> ?— \[p\. \d+\]\(([^)\s]+)\)\s*$/;
const HEADING = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/**
 * Quotes whose last line is an excerpt link. Looks at whole quotes (runs of `>` lines),
 * skipping fenced code, so an example in a code block isn't taken for an excerpt.
 */
function parseQuotes(lines: readonly string[]): ParsedQuote[] {
  const found: ParsedQuote[] = [];
  let heading: string | null = null;
  let fence: string | null = null;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const fenceMatch = FENCE.exec(line);
    if (fence !== null) {
      if (fenceMatch !== null && fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length) fence = null;
      i += 1;
      continue;
    }
    if (fenceMatch !== null) {
      fence = fenceMatch[1];
      i += 1;
      continue;
    }
    const headingMatch = HEADING.exec(line);
    if (headingMatch !== null) {
      heading = headingMatch[2];
      i += 1;
      continue;
    }
    if (!QUOTE_LINE.test(line)) {
      i += 1;
      continue;
    }
    const start = i;
    while (i < lines.length && QUOTE_LINE.test(lines[i])) i += 1;
    const quote = lines.slice(start, i);
    const excerpt = excerptFromQuote(quote);
    if (excerpt !== null) found.push({ excerpt, heading, start, end: i });
  }
  return found;
}

function excerptFromQuote(quote: readonly string[]): Excerpt | null {
  if (quote.length < 2) return null;
  const source = SOURCE_LINE.exec(quote[quote.length - 1]);
  if (source === null) return null;
  const link = parseExcerptHref(source[1]);
  if (link === null) return null;
  const text = quote
    .slice(0, -1)
    .map((line) => line.replace(/^ {0,3}> ?/, ""))
    .join(" ")
    .trim();
  return { ...link, text: unescapeQuoteText(text) };
}

/** The lines of the section under the heading `title` (any level): [start, end). */
function findSection(lines: readonly string[], title: string): { start: number; end: number } | null {
  let level = 0;
  let start = -1;
  let fence: string | null = null;
  for (let i = 0; i < lines.length; i += 1) {
    const fenceMatch = FENCE.exec(lines[i]);
    if (fence !== null) {
      if (fenceMatch !== null && fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length) fence = null;
      continue;
    }
    if (fenceMatch !== null) {
      fence = fenceMatch[1];
      continue;
    }
    const match = HEADING.exec(lines[i]);
    if (match === null) continue;
    const headingLevel = match[1].length;
    if (start >= 0 && headingLevel <= level) return { start, end: i };
    if (start < 0 && match[2].toLowerCase() === title.toLowerCase()) {
      start = i;
      level = headingLevel;
    }
  }
  return start >= 0 ? { start, end: lines.length } : null;
}

/** The file's line ending, kept when it's edited. */
function lineEnding(text: string): string {
  return text.includes("\r\n") ? "\r\n" : "\n";
}

/** Lines without the final newline's empty string; CRLF is read as LF. */
function splitLines(text: string): string[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

function joinLines(lines: readonly string[], eol: string): string {
  return `${lines.join(eol)}${eol}`;
}

function trimTrailingBlank(lines: readonly string[]): string[] {
  let end = lines.length;
  while (end > 0 && lines[end - 1].trim() === "") end -= 1;
  return lines.slice(0, end);
}
