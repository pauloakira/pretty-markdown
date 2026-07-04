import { useCallback, useState } from "react";
import { useContainer } from "../../composition/ContainerContext";
import { addRecent, type RecentFile } from "../../domain/values/RecentFile";

/** Tracks the recently-opened files, persisted across sessions. */
export function useRecentFiles() {
  const { recentFilesRepository } = useContainer();
  const [recents, setRecents] = useState<RecentFile[]>(() => recentFilesRepository.load());

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

  const clear = useCallback(() => {
    recentFilesRepository.save([]);
    setRecents([]);
  }, [recentFilesRepository]);

  return { recents, remember, clear };
}
