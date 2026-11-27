import { parseRect, type PdfRect } from "./PdfRect";

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

/**
 * A link to another document the app opens: a Markdown file, or a PDF at a page (and, for
 * an excerpt's link, the passage on it).
 */
export interface FileLink {
  /** Absolute path of the linked file. */
  readonly path: string;
  /** 1-based page to open a PDF at (`#page=`, the standard PDF open parameter). */
  readonly page?: number;
  /** The passage on that page (an excerpt's `rect`), to show the reader. */
  readonly rect?: PdfRect;
}

/** The files a link may open in the app, as the file picker offers them. */
const OPENABLE = /\.(pdf|md|markdown|mdown|txt)$/i;
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/**
 * Resolve an `other` link (see `classifyLink`) in the document at `fromPath` to a file the
 * app can open, or null: a link with a scheme (`file:`, `javascript:`), to a folder, or to
 * a kind of file the app doesn't read. Relative paths are taken from the document's
 * folder, as in a browser; `%`-escapes are decoded.
 *
 *     resolveFileLink("Geometric%20Methods.pdf#page=133&rect=72,540,451,553", "/papers/x.notes.md")
 *       → { path: "/papers/Geometric Methods.pdf", page: 133, rect: [72, 540, 451, 553] }
 */
export function resolveFileLink(href: string, fromPath: string): FileLink | null {
  const trimmed = href.trim();
  if (trimmed === "" || trimmed.startsWith("#") || trimmed.startsWith("//") || SCHEME.test(trimmed)) {
    return null;
  }
  const hash = trimmed.indexOf("#");
  const beforeHash = hash < 0 ? trimmed : trimmed.slice(0, hash);
  const query = beforeHash.indexOf("?");
  let target: string;
  try {
    target = decodeURIComponent(query < 0 ? beforeHash : beforeHash.slice(0, query));
  } catch {
    return null;
  }
  if (!OPENABLE.test(target)) return null;

  const folder = fromPath.slice(0, fromPath.lastIndexOf("/") + 1);
  const path = normalizePath(target.startsWith("/") ? target : folder + target);
  if (path === null || !/\.pdf$/i.test(path)) return path === null ? null : { path };

  const params = new URLSearchParams(hash < 0 ? "" : trimmed.slice(hash + 1));
  const page = Number(params.get("page"));
  if (!Number.isInteger(page) || page < 1) return { path };
  const rect = parseRect(params.get("rect") ?? "");
  return { path, page, ...(rect ? { rect } : {}) };
}

/**
 * The file a relative path (as in a link, not percent-encoded) names, seen from the file at
 * `fromPath`; null if it climbs above the root.
 */
export function resolvePath(target: string, fromPath: string): string | null {
  const folder = fromPath.slice(0, fromPath.lastIndexOf("/") + 1);
  return normalizePath(target.startsWith("/") ? target : folder + target);
}

/**
 * The relative path from the file at `fromPath` to the file at `toPath` (both absolute):
 * `/p/Notes/a.notes.md` → `/p/a.pdf` is `../a.pdf`.
 */
export function relativePath(fromPath: string, toPath: string): string {
  const from = fromPath.split("/").filter(Boolean).slice(0, -1);
  const to = toPath.split("/").filter(Boolean);
  let shared = 0;
  while (shared < from.length && shared < to.length - 1 && from[shared] === to[shared]) shared += 1;
  return [...from.slice(shared).map(() => ".."), ...to.slice(shared)].join("/");
}

/** `/a/./b/../c` → `/a/c`. Null for a path that climbs above the root or isn't absolute. */
function normalizePath(path: string): string | null {
  if (!path.startsWith("/")) return null;
  const parts: string[] = [];
  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (parts.length === 0) return null;
      parts.pop();
    } else parts.push(part);
  }
  return "/" + parts.join("/");
}
