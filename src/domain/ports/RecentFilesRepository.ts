import type { RecentFile } from "../values/RecentFile";

/** Port: persist the recent-files list. */
export interface RecentFilesRepository {
  load(): RecentFile[];
  save(list: readonly RecentFile[]): void;
}
