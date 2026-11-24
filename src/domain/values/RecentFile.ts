import { plainPath } from "../entities/Document";

/** A previously-opened file, shown in the recent-files list. */
export interface RecentFile {
  readonly path: string;
  readonly name: string;
}

export const MAX_RECENT = 10;

/**
 * What identifies a file for the list: besides a URL or a path, on iPadOS the same file
 * can be `/private/var/…` or `/var/…` (one folder through a symlink). Entries with the
 * same key are one file and appear once.
 */
export function recentKey(path: string): string {
  const plain = plainPath(path);
  return plain.startsWith("/private/var/") ? plain.slice("/private".length) : plain;
}

/** Add a file to the front of the list, de-duplicating by file and capping the length. */
export function addRecent(
  list: readonly RecentFile[],
  file: RecentFile,
  cap = MAX_RECENT,
): RecentFile[] {
  const key = recentKey(file.path);
  const withoutDup = list.filter((f) => recentKey(f.path) !== key);
  return [file, ...withoutDup].slice(0, cap);
}

/** Drop a file from the list (it's gone, or couldn't be opened). */
export function removeRecent(list: readonly RecentFile[], path: string): RecentFile[] {
  const key = recentKey(path);
  return list.filter((f) => recentKey(f.path) !== key);
}

/**
 * Tidy a list saved by older builds: plain paths, and one entry per file (the newest,
 * which comes first), capped.
 */
export function tidyRecents(list: readonly RecentFile[], cap = MAX_RECENT): RecentFile[] {
  const seen = new Set<string>();
  const tidy: RecentFile[] = [];
  for (const file of list) {
    const key = recentKey(file.path);
    if (seen.has(key)) continue;
    seen.add(key);
    tidy.push({ path: plainPath(file.path), name: file.name });
  }
  return tidy.slice(0, cap);
}

/** Where a recent file lives, as the Files app (or Finder) would name it. */
export function recentLocation(path: string): string {
  const parts = recentKey(path).split("/").filter(Boolean);
  parts.pop(); // the file's own name is shown above the location
  const after = (segment: string) => parts.slice(parts.indexOf(segment) + 1);
  const named = (root: string, rest: readonly string[]) => [root, ...rest].join(" › ");

  // iCloud Drive: ~/Library/Mobile Documents/com~apple~CloudDocs/… (an app's own iCloud
  // folder is …/iCloud~<bundle id>/Documents/…).
  if (parts.includes("Mobile Documents")) {
    const rest = after("Mobile Documents");
    const container = rest.shift();
    if (container !== "com~apple~CloudDocs" && rest[0] === "Documents") rest.shift();
    return named("iCloud Drive", rest);
  }
  // On My iPad: the Files app's local storage.
  if (parts.includes("File Provider Storage")) {
    return named("On My iPad", after("File Provider Storage"));
  }
  // This app's own container (iPadOS): files handed over as a copy, by "Open in" or AirDrop.
  const app = parts.indexOf("Application");
  if (app > 0 && parts[app - 1] === "Data" && parts.length > app + 2) {
    const area = parts.slice(app + 2);
    if (area[0] === "Documents" && area[1] !== "Inbox") {
      return named("On My iPad", ["pretty-markdown", ...area.slice(1)]);
    }
    return "Temporary copy";
  }
  // The Mac: abbreviate the home folder as Finder's Go menu does.
  if (parts[0] === "Users" && parts.length >= 2) {
    return ["~", ...parts.slice(2)].join("/");
  }
  return `/${parts.join("/")}`;
}
