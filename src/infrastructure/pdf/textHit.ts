/*
 * Finding text under a point in pdf.js's text layer, by measuring where each character
 * actually is on screen.
 *
 * iPadOS's own word selection doesn't line up with pdf.js's text layer, whose spans are
 * stretched (`scaleX`) to sit over the printed glyphs: a long-press on "We" selected
 * "Abstract. W". Measuring each character's box with a Range gives the right answer.
 */

/** A character that belongs to a word: letters, digits, and apostrophes within words. */
const WORD_CHAR = /[\p{L}\p{N}\p{M}_'’]/u;

/** The word containing `text[index]` as [start, end), or null if that's not a word character. */
export function wordBounds(text: string, index: number): [number, number] | null {
  if (index < 0 || index >= text.length || !WORD_CHAR.test(text[index])) return null;
  let start = index;
  let end = index + 1;
  while (start > 0 && WORD_CHAR.test(text[start - 1])) start -= 1;
  while (end < text.length && WORD_CHAR.test(text[end])) end += 1;
  // An apostrophe isn't part of the word at its edges ('quoted' → quoted).
  while (start < end && /['’]/.test(text[start])) start += 1;
  while (end > start && /['’]/.test(text[end - 1])) end -= 1;
  return start < end ? [start, end] : null;
}

/** The text node of the text-layer span under (x, y), in viewport coordinates. */
function textNodeAt(x: number, y: number): Text | null {
  for (const el of document.elementsFromPoint(x, y)) {
    if (el.tagName !== "SPAN" || !el.closest(".textLayer")) continue;
    const node = el.firstChild;
    if (node instanceof Text && node.data.length > 0) return node;
  }
  return null;
}

/** The index of the character of `node` whose on-screen box contains (x, y), or -1. */
function charIndexAt(node: Text, x: number, y: number): number {
  const range = document.createRange();
  for (let i = 0; i < node.data.length; i += 1) {
    range.setStart(node, i);
    range.setEnd(node, i + 1);
    const box = range.getBoundingClientRect();
    if (x >= box.left && x <= box.right && y >= box.top && y <= box.bottom) return i;
  }
  return -1;
}

/** A Range over the word at (x, y) in a pdf.js text layer, or null if there's no word there. */
export function wordRangeAt(x: number, y: number): Range | null {
  const node = textNodeAt(x, y);
  if (!node) return null;
  const bounds = wordBounds(node.data, charIndexAt(node, x, y));
  if (!bounds) return null;
  const range = document.createRange();
  range.setStart(node, bounds[0]);
  range.setEnd(node, bounds[1]);
  return range;
}
