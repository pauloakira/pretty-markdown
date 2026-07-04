/** A previously-opened file, shown in the recent-files list. */
export interface RecentFile {
  readonly path: string;
  readonly name: string;
}

export const MAX_RECENT = 10;

/** Add a file to the front of the list, de-duplicating by path and capping the length. */
export function addRecent(
  list: readonly RecentFile[],
  file: RecentFile,
  cap = MAX_RECENT,
): RecentFile[] {
  const withoutDup = list.filter((f) => f.path !== file.path);
  return [file, ...withoutDup].slice(0, cap);
}
