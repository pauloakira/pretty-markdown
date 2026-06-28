import { useLayoutEffect, useRef } from "react";

interface ReaderProps {
  html: string;
  initialScrollTop: number;
  onScrollPersist: (scrollTop: number) => void;
}

/**
 * Read-only rendered document — the "PDF reader" view. The HTML comes from our own
 * markdown + KaTeX pipeline (raw inline HTML is disabled upstream), so injecting it is
 * safe here.
 *
 * Mounted with `key={tab.id}` by the parent, so each tab gets a fresh instance (lazy
 * mounting). On mount we restore the saved scroll position; on unmount (tab switch) we
 * hand the current scroll back so it's preserved when the tab is reopened.
 */
export function Reader({ html, initialScrollTop, onScrollPersist }: ReaderProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = initialScrollTop;
    return () => {
      if (el) onScrollPersist(el.scrollTop);
    };
    // Run once per mount; the parent remounts via `key` when the tab changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="reader-scroll" ref={scrollRef}>
      <article
        className="reader markdown-body"
        // eslint-disable-next-line react/no-danger -- trusted pipeline output (see MarkdownPipeline)
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
