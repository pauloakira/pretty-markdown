import { useCallback, useState } from "react";
import { useContainer } from "../../composition/ContainerContext";
import {
  addRecent,
  removeRecent,
  tidyRecents,
  type RecentFile,
} from "../../domain/values/RecentFile";

/** Tracks the recently-opened files, persisted across sessions. */
export function useRecentFiles() {
  const { recentFilesRepository } = useContainer();
  const [recents, setRecents] = useState<RecentFile[]>(() =>
    tidyRecents(recentFilesRepository.load()),
  );

  const remember = useCallback(
    (file: RecentFile) => {
      setRecents((prev) => {
        const next = addRecent(prev, file);
        recentFilesRepository.save(next);
        return next;
      });
    },
    [recentFilesRepository],
  );

  const forget = useCallback(
    (path: string) => {
      setRecents((prev) => {
        const next = removeRecent(prev, path);
        if (next.length !== prev.length) recentFilesRepository.save(next);
        return next;
      });
    },
    [recentFilesRepository],
  );

  const clear = useCallback(() => {
    recentFilesRepository.save([]);
    setRecents([]);
  }, [recentFilesRepository]);

  return { recents, remember, forget, clear };
}
