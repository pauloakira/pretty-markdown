/**
 * Find-in-page over the rendered document. Locates plain-text matches in prose (skipping
 * rendered math) and wraps each in a `<mark>` element, then navigates by scrolling the
 * scroll container directly.
 *
 * We use real `<mark>` nodes (rather than the CSS Custom Highlight API) because they
 * render reliably across webviews, and we compute `scrollTop` ourselves (rather than
 * `scrollIntoView`) because the latter is unreliable for nested overflow containers in
 * WebKit. The wrapped nodes live inside React's `dangerouslySetInnerHTML` content, which
 * React only overwrites when the HTML changes — so the marks persist until we clear them
 * or the tab's document is replaced.
 */

const MARK_CLASS = "pm-find";
const CURRENT_CLASS = "pm-find-current";

export interface FindState {
  count: number;
  /** Zero-based index of the current match, or -1 when there are none. */
  index: number;
}

/** All match ranges for `query` within `root`, searching visible prose text only. */
export function findMatches(root: HTMLElement, query: string): Range[] {
  const ranges: Range[] = [];
  const needle = query.toLowerCase();
  if (!needle) return ranges;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node: Node): number {
      const value = node.nodeValue;
      if (!value || !value.trim()) return NodeFilter.FILTER_REJECT;
      // Skip rendered math internals (KaTeX/MathJax) and our own marks.
      const parent = node.parentElement;
      if (parent?.closest(".pm-math")) return NodeFilter.FILTER_REJECT;
      if (parent?.classList.contains(MARK_CLASS)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const haystack = (node.nodeValue ?? "").toLowerCase();
    for (
      let idx = haystack.indexOf(needle);
      idx !== -1;
      idx = haystack.indexOf(needle, idx + needle.length)
    ) {
      const range = document.createRange();
      range.setStart(node, idx);
      range.setEnd(node, idx + needle.length);
      ranges.push(range);
    }
  }
  return ranges;
}

export class FindController {
  private marks: HTMLElement[] = [];
  private index = -1;

  constructor(private readonly root: HTMLElement) {}

  search(query: string): FindState {
    this.unwrap();
    const ranges = findMatches(this.root, query);

    // Wrap in reverse document order so wrapping a later match doesn't invalidate the
    // offsets of earlier ranges (including multiple matches within one text node).
    const wrapped: HTMLElement[] = [];
    for (let i = ranges.length - 1; i >= 0; i -= 1) {
      const mark = document.createElement("mark");
      mark.className = MARK_CLASS;
      try {
        ranges[i].surroundContents(mark);
        wrapped.push(mark);
      } catch {
        // A range that can't be cleanly wrapped is skipped rather than breaking find.
      }
    }
    wrapped.reverse(); // back to document order
    this.marks = wrapped;

    this.index = this.marks.length > 0 ? 0 : -1;
    this.paintCurrent();
    this.revealCurrent();
    return this.state();
  }

  next(): FindState {
    return this.step(1);
  }

  previous(): FindState {
    return this.step(-1);
  }

  clear(): void {
    this.unwrap();
  }

  private step(delta: number): FindState {
    if (this.marks.length === 0) return this.state();
    this.index = (this.index + delta + this.marks.length) % this.marks.length;
    this.paintCurrent();
    this.revealCurrent();
    return this.state();
  }

  private state(): FindState {
    return { count: this.marks.length, index: this.index };
  }

  private paintCurrent(): void {
    this.marks.forEach((mark, i) => mark.classList.toggle(CURRENT_CLASS, i === this.index));
  }

  /** Scroll the container so the current match sits near the middle. */
  private revealCurrent(): void {
    const mark = this.marks[this.index];
    if (!mark) return;
    const container = this.root;
    const markRect = mark.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const target =
      container.scrollTop +
      (markRect.top - containerRect.top) -
      container.clientHeight / 2 +
      markRect.height / 2;
    try {
      container.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
    } catch {
      container.scrollTop = Math.max(0, target);
    }
  }

  /** Remove all our marks, restoring the original text. */
  private unwrap(): void {
    const existing = this.root.querySelectorAll<HTMLElement>(`mark.${MARK_CLASS}`);
    existing.forEach((mark) => {
      const parent = mark.parentNode;
      if (!parent) return;
      while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
      parent.removeChild(mark);
    });
    if (existing.length > 0) this.root.normalize(); // merge split text nodes back
    this.marks = [];
    this.index = -1;
  }
}
