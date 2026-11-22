import { fileName } from "../entities/Document";
import {
  excerptToMarkdown,
  parseExcerptHref,
  unescapeQuoteText,
  type Excerpt,
} from "./Excerpt";

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
 * The notes without the excerpt whose id is `id` (its whole quote, and the blank line
 * before it). Unchanged if it isn't there, e.g. the reader already deleted it by hand.
 */
export function removeExcerpt(notes: string, id: string): string {
  const lines = splitLines(notes);
  const found = parseQuotes(lines).find((quote) => quote.excerpt.id === id);
  if (found === undefined) return notes;
  let start = found.start;
  if (start > 0 && lines[start - 1].trim() === "") start -= 1;
  return joinLines([...lines.slice(0, start), ...lines.slice(found.end)], lineEnding(notes));
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
