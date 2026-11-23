/** A letter, digit or joiner inside a word ("don't", "Baker-Campbell", "x2"). */
const WORD_CHAR = /[\p{L}\p{N}\p{M}_'’-]/u;

/**
 * Widen `[start, end)` in `text` so it doesn't cut a word: a start in the middle of a word
 * moves back to the word's first letter, an end in the middle of one moves on past its
 * last. Ends that already fall between words are left alone, so a selection of
 * "subsection 2.2, we" stays as it is.
 */
export function widenToWords(text: string, start: number, end: number): { start: number; end: number } {
  let from = start;
  let to = end;
  const isWord = (i: number) => i >= 0 && i < text.length && WORD_CHAR.test(text[i]);
  // The start cuts a word if the character before it and the one at it are both word.
  if (isWord(from - 1) && isWord(from)) while (isWord(from - 1)) from -= 1;
  // The end cuts a word if the last character in and the first one out are both word.
  if (isWord(to - 1) && isWord(to)) while (isWord(to)) to += 1;
  return { start: from, end: to };
}

/**
 * Widen the document's selection to whole words (see `widenToWords`), where its ends sit
 * in text. A selection made by dragging over a PDF easily stops a letter or two short of
 * a word's end; the quote and the highlight should take the whole word.
 */
export function snapSelectionToWords(selection: Selection | null): void {
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;
  const range = selection.getRangeAt(0);
  const { startContainer, startOffset, endContainer, endOffset } = range;
  let start = startOffset;
  let end = endOffset;
  if (startContainer.nodeType === Node.TEXT_NODE) {
    start = widenToWords(startContainer.textContent ?? "", startOffset, startOffset).start;
  }
  if (endContainer.nodeType === Node.TEXT_NODE) {
    end = widenToWords(endContainer.textContent ?? "", endOffset, endOffset).end;
  }
  if (start === startOffset && end === endOffset) return;
  // Keep the direction the reader dragged in (the focus is where the pointer ended).
  const backwards =
    selection.anchorNode === endContainer &&
    selection.anchorOffset === endOffset &&
    !(startContainer === endContainer && startOffset === endOffset);
  if (backwards) selection.setBaseAndExtent(endContainer, end, startContainer, start);
  else selection.setBaseAndExtent(startContainer, start, endContainer, end);
}
