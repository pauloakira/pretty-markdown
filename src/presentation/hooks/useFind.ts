import { useCallback, useEffect, useRef, useState } from "react";
import type { FindState } from "../find/FindController";
import type { FindListener, FindTarget } from "../find/FindTarget";

const NO_RESULT: FindState = { count: 0, index: -1 };

/**
 * Drives find-in-page for the active document. `getTarget` makes a FindTarget for
 * whatever is showing (the markdown reader, or a PDF), wired to report its results here;
 * it returns null when nothing can be searched yet (e.g. a PDF still loading; call
 * `refresh` once it's ready). The search follows tab switches.
 */
export function useFind(getTarget: (listener: FindListener) => FindTarget | null, activeId: string | null) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<FindState>(NO_RESULT);
  const targetRef = useRef<FindTarget | null>(null);
  const getTargetRef = useRef(getTarget);
  getTargetRef.current = getTarget;

  const runSearch = useCallback((q: string) => {
    targetRef.current?.clear();
    const target = getTargetRef.current(setResult);
    targetRef.current = target;
    if (!target) {
      setResult(NO_RESULT);
      return;
    }
    target.search(q);
  }, []);

  const openFind = useCallback(() => setOpen(true), []);

  const closeFind = useCallback(() => {
    targetRef.current?.clear();
    targetRef.current = null;
    setOpen(false);
    setQuery("");
    setResult(NO_RESULT);
  }, []);

  const changeQuery = useCallback(
    (q: string) => {
      setQuery(q);
      runSearch(q);
    },
    [runSearch],
  );

  const next = useCallback(() => targetRef.current?.next(), []);
  const previous = useCallback(() => targetRef.current?.previous(), []);

  // Re-run the current search on whatever is showing now: after a tab switch, or when a
  // PDF has finished loading.
  const queryRef = useRef(query);
  queryRef.current = query;
  const openRef = useRef(open);
  openRef.current = open;
  const refresh = useCallback(() => {
    if (openRef.current) runSearch(queryRef.current);
  }, [runSearch]);

  // Switching tabs swaps the document: re-run on the new one, or close if the last
  // document was closed.
  useEffect(() => {
    if (!openRef.current) return;
    if (!activeId) {
      closeFind();
      return;
    }
    refresh();
  }, [activeId, closeFind, refresh]);

  return { open, query, result, openFind, closeFind, changeQuery, next, previous, refresh };
}
