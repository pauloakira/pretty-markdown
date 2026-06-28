import { useCallback, useMemo, useState } from "react";
import { createContainer } from "../../composition/container";
import type { Document } from "../../domain/entities/Document";

/**
 * Presentation-facing hook over the document use cases. Owns the active document and
 * derives its rendered HTML. The render is memoized on content so it only recomputes
 * when the document changes (M1; per-block incremental rendering arrives with the editor).
 */
export function useDocument() {
  const container = useMemo(() => createContainer(), []);
  const [document, setDocument] = useState<Document | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const open = useCallback(async () => {
    setBusy(true);
    try {
      const outcome = await container.documentService.open();
      if (outcome.kind === "opened") {
        setDocument(outcome.document);
        setError(null);
      } else if (outcome.kind === "error") {
        setError(outcome.message);
      }
    } finally {
      setBusy(false);
    }
  }, [container]);

  const html = useMemo(
    () => (document ? container.pipeline.render(document.content) : ""),
    [container, document],
  );

  return { document, html, error, busy, open };
}
