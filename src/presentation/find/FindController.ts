/**
 * Find-in-page over the rendered document. Locates plain-text matches in prose (skipping
 * rendered math), highlights them with the CSS Custom Highlight API (no DOM mutation, so
 * it coexists with React's innerHTML), and tracks a "current" match for navigation.
 *
 * Where the Highlight API is unavailable, matches are still counted and scrolled to; only
 * the visual highlight is absent.
 */

const HL_ALL = "pm-find";
const HL_CURRENT = "pm-find-current";

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
      // Skip rendered math internals (KaTeX/MathJax) — search prose, not glyph spans.
      if (node.parentElement?.closest(".pm-math")) return NodeFilter.FILTER_REJECT;
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

function highlightsSupported(): boolean {
  return typeof CSS !== "undefined" && "highlights" in CSS && typeof Highlight !== "undefined";
}

export class FindController {
  private ranges: Range[] = [];
  private index = -1;

  constructor(private readonly root: HTMLElement) {}

  search(query: string): FindState {
    this.ranges = findMatches(this.root, query);
    this.index = this.ranges.length > 0 ? 0 : -1;
    this.repaint();
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
    this.ranges = [];
    this.index = -1;
    this.repaint();
  }

  private step(delta: number): FindState {
    if (this.ranges.length === 0) return this.state();
    this.index = (this.index + delta + this.ranges.length) % this.ranges.length;
    this.repaint();
    this.revealCurrent();
    return this.state();
  }

  private state(): FindState {
    return { count: this.ranges.length, index: this.index };
  }

  private repaint(): void {
    if (!highlightsSupported()) return;
    CSS.highlights.delete(HL_ALL);
    CSS.highlights.delete(HL_CURRENT);
    if (this.ranges.length === 0) return;

    const others = this.ranges.filter((_, i) => i !== this.index);
    if (others.length > 0) CSS.highlights.set(HL_ALL, new Highlight(...others));
    if (this.index >= 0) CSS.highlights.set(HL_CURRENT, new Highlight(this.ranges[this.index]));
  }

  private revealCurrent(): void {
    const el = this.ranges[this.index]?.startContainer.parentElement;
    if (!el) return;
    try {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    } catch {
      // scrollIntoView unsupported (e.g. jsdom) — ignore.
    }
  }
}
