/**
 * The end of the message the native side gives for a file the app may not use: on iPadOS,
 * one in a folder the reader hasn't allowed, like the notes file beside a PDF that was
 * picked on its own. Keep in step with `NO_ACCESS` in src-tauri/src/lib.rs.
 */
export const NO_ACCESS = "can't be used: pretty-markdown hasn't been allowed into its folder.";

/** Whether a read or write failed for want of access to the file's folder. */
export function isNoAccess(message: string): boolean {
  return message.endsWith(NO_ACCESS);
}

/** On iPadOS one folder can be `/private/var/…` or `/var/…` (one links to the other). */
function comparable(path: string): string {
  const trimmed = path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
  return trimmed.startsWith("/private/var/") ? trimmed.slice("/private".length) : trimmed;
}

/** Whether the file at `path` is inside `folder` (at any depth). */
export function folderHolds(folder: string, path: string): boolean {
  return comparable(path).startsWith(`${comparable(folder)}/`);
}

/** The name of the folder a file is in, as Files shows it ("" for the root). */
export function folderNameOf(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts.length >= 2 ? (parts[parts.length - 2] ?? "") : "";
}
