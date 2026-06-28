import { useLayoutEffect, useRef, type RefObject } from "react";

interface ReaderProps {
  html: string;
  initialScrollTop: number;
  onScrollPersist: (scrollTop: number) => void;
  /** Optional shared ref to the scroll container, used by find-in-page. */
  containerRef?: RefObject<HTMLDivElement | null>;
}

/**
 * Read-only rendered document — the "PDF reader" view. The HTML comes from our own
 * markdown + KaTeX pipeline (raw inline HTML is disabled upstream), so injecting it is
 * safe here.
 *
 * The content is set imperatively (not via `dangerouslySetInnerHTML`) on purpose: that
 * keeps React from owning the article's children, so find-in-page can insert `<mark>`
 * nodes into the content without React wiping them on its next render. The content is
 * only re-applied when `html` itself changes.
 *
 * Mounted with `key={tab.id}` by the parent, so each tab gets a fresh instance (lazy
 * mounting). On mount we restore the saved scroll position; on unmount (tab switch) we
 * hand the current scroll back so it's preserved when the tab is reopened.
 */
export function Reader({ html, initialScrollTop, onScrollPersist, containerRef }: ReaderProps) {
  const localRef = useRef<HTMLDivElement>(null);
  const scrollRef = containerRef ?? localRef;
  const articleRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    if (articleRef.current) articleRef.current.innerHTML = html;
  }, [html]);

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
      <article ref={articleRef} className="reader markdown-body" />
    </div>
  );
}
