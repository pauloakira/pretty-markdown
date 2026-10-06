/**
 * Where a link in a document points, as far as the app is concerned:
 * - `fragment`: a place in the same document (`#heading`), scrolled to in place;
 * - `external`: a web page or mail address, opened outside the app;
 * - `other`: anything else (relative paths, `file:`, custom schemes), which must never
 *   navigate the app's own web view.
 */
export type LinkTarget =
  | { readonly kind: "fragment"; readonly id: string }
  | { readonly kind: "external"; readonly url: string }
  | { readonly kind: "other"; readonly href: string };

/**
 * Prefix on the ids the markdown pipeline gives headings (GitHub's convention), so a
 * heading called "Root" can't collide with the app's own element ids.
 */
export const HEADING_ID_PREFIX = "user-content-";

const EXTERNAL = /^(https?|mailto):/i;

/** Classify a link's raw `href` attribute. */
export function classifyLink(href: string): LinkTarget {
  const trimmed = href.trim();
  if (trimmed.startsWith("#")) return { kind: "fragment", id: decodeFragment(trimmed.slice(1)) };
  if (EXTERNAL.test(trimmed)) return { kind: "external", url: trimmed };
  return { kind: "other", href: trimmed };
}

/**
 * The element ids a fragment may refer to, in lookup order: a heading's prefixed id
 * first (`#intro` → `user-content-intro`), then the fragment as written.
 */
export function fragmentIds(id: string): string[] {
  if (id === "" || id.startsWith(HEADING_ID_PREFIX)) return [id];
  return [HEADING_ID_PREFIX + id, id];
}

/**
 * Turn heading text into a GitHub-style slug: lower case, punctuation dropped, spaces
 * to hyphens. `taken` holds the slugs already used in this document; repeats get `-1`,
 * `-2`, … and the result is added to it.
 */
export function slugify(text: string, taken: Set<string>): string {
  const base = text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc}\- ]/gu, "")
    .replace(/ /g, "-");
  let slug = base;
  for (let n = 1; taken.has(slug); n += 1) slug = `${base}-${n}`;
  taken.add(slug);
  return slug;
}

function decodeFragment(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw; // malformed %-escape: match the fragment as written
  }
}
