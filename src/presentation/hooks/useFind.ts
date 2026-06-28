import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { FindController, type FindState } from "../find/FindController";

/**
 * Drives find-in-page for the active document. Binds a FindController to the current
 * reader element (looked up via `rootRef`) and re-runs on tab switch so the search
 * follows whichever document is showing.
 */
export function useFind(rootRef: RefObject<HTMLElement | null>, activeId: string | null) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<FindState>({ count: 0, index: -1 });
  const controllerRef = useRef<FindController | null>(null);

  const runSearch = useCallback(
    (q: string) => {
      const root = rootRef.current;
      if (!root) {
        setResult({ count: 0, index: -1 });
        return;
      }
      const controller = new FindController(root);
      controllerRef.current = controller;
      setResult(controller.search(q));
    },
    [rootRef],
  );

  const openFind = useCallback(() => setOpen(true), []);

  const closeFind = useCallback(() => {
    controllerRef.current?.clear();
    controllerRef.current = null;
    setOpen(false);
    setQuery("");
    setResult({ count: 0, index: -1 });
  }, []);

  const changeQuery = useCallback(
    (q: string) => {
      setQuery(q);
      runSearch(q);
    },
    [runSearch],
  );

  const next = useCallback(() => {
    if (controllerRef.current) setResult(controllerRef.current.next());
  }, []);

  const previous = useCallback(() => {
    if (controllerRef.current) setResult(controllerRef.current.previous());
  }, []);

  // Switching tabs swaps the reader element: re-run on the new document, or close if the
  // last document was closed.
  useEffect(() => {
    if (!open) return;
    if (!activeId) {
      closeFind();
      return;
    }
    runSearch(query);
    // `query` intentionally excluded — changes flow through changeQuery.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  return { open, query, result, openFind, closeFind, changeQuery, next, previous };
}
