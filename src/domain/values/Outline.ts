/**
 * A document's table of contents, for the contents sidebar: a PDF's bookmarks or a
 * markdown document's headings, as a tree of chapters and sections.
 *
 * Each item has a `position` in the document's own reading order, so the sidebar can tell
 * which section the reader is in and the viewer can jump to it:
 * - PDF: the page index plus the fraction of the page above the item (2.25 is a quarter
 *   of the way down the third page);
 * - markdown: the heading's index among the document's headings.
 */
export interface OutlineItem {
  /** Unique within its outline. */
  readonly id: string;
  /** Plain text, for filtering and tooltips. */
  readonly title: string;
  /**
   * The rendered title (markdown headings keep their math), from the app's own pipeline,
   * so it's safe to insert. Absent for PDF bookmarks, which are plain text.
   */
  readonly html?: string;
  /** Where the section starts; null when it points nowhere this viewer can go. */
  readonly position: number | null;
  readonly children: readonly OutlineItem[];
}

/** A heading as found in a rendered markdown document, in document order. */
export interface HeadingEntry {
  readonly id: string;
  /** 1 for h1 … 6 for h6. */
  readonly level: number;
  readonly title: string;
  readonly html?: string;
}

/**
 * Nest headings by level: each heading holds the deeper ones that follow it, up to the
 * next heading at its level or above. A document that skips levels (h1 then h3) nests the
 * h3 under the h1; one that starts deep (h3 before any h1) keeps it at the top.
 */
export function buildHeadingTree(headings: readonly HeadingEntry[]): OutlineItem[] {
  interface Node {
    readonly item: Omit<OutlineItem, "children">;
    readonly level: number;
    readonly children: Node[];
  }
  const roots: Node[] = [];
  const stack: Node[] = [];
  headings.forEach((heading, index) => {
    const node: Node = {
      item: { id: heading.id, title: heading.title, html: heading.html, position: index },
      level: heading.level,
      children: [],
    };
    while (stack.length > 0 && stack[stack.length - 1].level >= heading.level) stack.pop();
    (stack.length > 0 ? stack[stack.length - 1].children : roots).push(node);
    stack.push(node);
  });
  const freeze = (nodes: readonly Node[]): OutlineItem[] =>
    nodes.map((node) => ({ ...node.item, children: freeze(node.children) }));
  return freeze(roots);
}

/** Every item, depth-first (the order they're listed in). */
export function flattenOutline(items: readonly OutlineItem[]): OutlineItem[] {
  return items.flatMap((item) => [item, ...flattenOutline(item.children)]);
}

/**
 * The section the reader is in at `position`: the item that starts last at or before it.
 * Between items starting at the same place, the deeper one wins (it's listed later). Null
 * before the first section.
 */
export function currentItemId(items: readonly OutlineItem[], position: number): string | null {
  let best: OutlineItem | null = null;
  for (const item of flattenOutline(items)) {
    if (item.position === null || item.position > position) continue;
    if (best === null || item.position >= (best.position ?? -Infinity)) best = item;
  }
  return best?.id ?? null;
}

/** The ids from the top of the tree down to `id` (inclusive); empty if it isn't there. */
export function pathTo(items: readonly OutlineItem[], id: string): string[] {
  for (const item of items) {
    if (item.id === id) return [item.id];
    const below = pathTo(item.children, id);
    if (below.length > 0) return [item.id, ...below];
  }
  return [];
}

/** Lowercase without accents, so "Carathéodory" matches "caratheodory". */
function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/**
 * The items whose title contains `query` (ignoring case and accents), with the chapters
 * they sit in. A matching chapter keeps all its sections. An empty query keeps everything.
 */
export function filterOutline(items: readonly OutlineItem[], query: string): OutlineItem[] {
  const needle = fold(query.trim());
  if (!needle) return [...items];
  const keep = (list: readonly OutlineItem[]): OutlineItem[] =>
    list.flatMap((item) => {
      if (fold(item.title).includes(needle)) return [item];
      const children = keep(item.children);
      return children.length > 0 ? [{ ...item, children }] : [];
    });
  return keep(items);
}
