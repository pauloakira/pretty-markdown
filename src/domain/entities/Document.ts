/**
 * A markdown document. Immutable; producing a changed document means creating a new one.
 * `path` is null for documents not yet associated with a file on disk (future: new/unsaved).
 */
export interface Document {
  readonly path: string | null;
  readonly name: string;
  readonly content: string;
}

/** Derive a display name from a filesystem path (handles both `/` and `\` separators). */
export function fileName(path: string): string {
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1] || path;
}

export function createDocument(path: string, content: string): Document {
  return { path, name: fileName(path), content };
}
