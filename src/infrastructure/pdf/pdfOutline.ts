import type { OutlineItem } from "../../domain/values/Outline";

/** The slice of pdf.js's document proxy the outline needs (so tests can fake it). */
export interface OutlineSource {
  getOutline(): Promise<readonly RawOutlineItem[] | null>;
  getDestination(id: string): Promise<unknown[] | null>;
  getPageIndex(ref: { num: number; gen: number }): Promise<number>;
  getPage(pageNumber: number): Promise<{ view: number[] }>;
}

/** A bookmark as pdf.js reports it (the fields used here). */
export interface RawOutlineItem {
  readonly title: string;
  readonly dest: string | unknown[] | null;
  readonly items: readonly RawOutlineItem[];
}

/** The y coordinate a destination puts at the top of the view, if it names one. */
function destinationTop(explicit: readonly unknown[]): number | null {
  const kind = (explicit[1] as { name?: string } | undefined)?.name;
  const top = kind === "XYZ" ? explicit[3] : kind === "FitH" || kind === "FitBH" ? explicit[2] : kind === "FitR" ? explicit[5] : null;
  return typeof top === "number" && Number.isFinite(top) ? top : null;
}

/**
 * The PDF's bookmarks as an outline. Each destination (named, or an explicit
 * `[page, {name}, …]` array) resolves to its page index plus the fraction of the page
 * above the point it names, measured from the page's top edge in PDF coordinates (y grows
 * upwards). Bookmarks that point nowhere (or to a URL) keep their place with a null
 * position. A PDF without bookmarks, or one pdf.js can't read them from, has none.
 */
export async function readOutline(pdf: OutlineSource): Promise<OutlineItem[]> {
  const raw = await pdf.getOutline().catch(() => null);
  if (!raw || raw.length === 0) return [];

  const pageBoxes = new Map<number, Promise<number[] | null>>();
  const pageBox = (index: number) => {
    let box = pageBoxes.get(index);
    if (!box) {
      box = pdf.getPage(index + 1).then(
        (page) => page.view,
        () => null,
      );
      pageBoxes.set(index, box);
    }
    return box;
  };

  const positionOf = async (dest: RawOutlineItem["dest"]): Promise<number | null> => {
    try {
      const explicit = typeof dest === "string" ? await pdf.getDestination(dest) : dest;
      if (!Array.isArray(explicit) || explicit.length === 0) return null;
      const target = explicit[0];
      const index =
        typeof target === "number"
          ? target
          : target && typeof target === "object" && "num" in target
            ? await pdf.getPageIndex(target as { num: number; gen: number })
            : null;
      if (index === null || !Number.isInteger(index) || index < 0) return null;
      const top = destinationTop(explicit);
      if (top === null) return index;
      const box = await pageBox(index);
      if (!box || box.length < 4) return index;
      const [, bottom, , upper] = box;
      const height = upper - bottom;
      if (!(height > 0)) return index;
      return index + Math.min(1, Math.max(0, (upper - top) / height));
    } catch {
      return null;
    }
  };

  let next = 0;
  const convert = (items: readonly RawOutlineItem[]): Promise<OutlineItem[]> =>
    Promise.all(
      items.map(async (item) => {
        const id = `bookmark-${next++}`;
        const [position, children] = await Promise.all([positionOf(item.dest), convert(item.items ?? [])]);
        return { id, title: item.title.trim() || "Untitled", position, children };
      }),
    );
  return convert(raw);
}
