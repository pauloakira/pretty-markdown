import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { buildHeadingTree, currentItemId, type HeadingEntry, type OutlineItem } from "../../domain/values/Outline";
import { useDocumentLinks } from "../hooks/useDocumentLinks";
import { ContentsSidebar, type ContentsPanel } from "./ContentsSidebar";
import { attachRetile } from "../webkit/retile";

/** Quiet period after the last scroll event before the position is recorded. */
const SCROLL_SETTLE_MS = 400;
/**
 * The "reading line": a heading counts as the current section once it's above this line,
 * a quarter of the way down the view (at most this many px). At the top of a document its
 * first heading is current.
 */
const CURRENT_LINE_MAX_PX = 160;
/** Space left above a heading jumped to from the contents (px). */
const JUMP_MARGIN_PX = 16;

const HEADINGS = "h1, h2, h3, h4, h5, h6";

/** A heading's text, with its math as the LaTeX it was written in (for filtering). */
function headingText(heading: Element): string {
  const copy = heading.cloneNode(true) as Element;
  for (const math of copy.querySelectorAll(".katex")) {
    const tex = math.querySelector('annotation[encoding="application/x-tex"]')?.textContent;
    math.replaceWith(tex ? `$${tex}$` : "");
  }
  return (copy.textContent ?? "").replace(/\s+/g, " ").trim();
}

/** A heading's rendered content for the sidebar: math kept, links and find marks unwrapped. */
function headingLabel(heading: Element): string {
  const copy = heading.cloneNode(true) as Element;
  for (const wrapper of copy.querySelectorAll("a, mark")) wrapper.replaceWith(...wrapper.childNodes);
  for (const el of copy.querySelectorAll("[id]")) el.removeAttribute("id");
  return copy.innerHTML;
}

/** The document's headings as an outline. */
function readHeadings(article: HTMLElement): OutlineItem[] {
  const entries: HeadingEntry[] = [...article.querySelectorAll(HEADINGS)]
    .filter((heading) => heading.id)
    .map((heading) => ({
      id: heading.id,
      level: Number(heading.tagName.slice(1)),
      title: headingText(heading),
      html: headingLabel(heading),
    }));
  return buildHeadingTree(entries);
}

interface ReaderProps {
  html: string;
  initialScrollTop: number;
  onScrollPersist: (scrollTop: number) => void;
  /** Optional shared ref to the scroll container, used by find-in-page. */
  containerRef?: RefObject<HTMLDivElement | null>;
  /** The contents sidebar (its open state and width are app settings). */
  contents: ContentsPanel;
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
export function Reader({ html, initialScrollTop, onScrollPersist, containerRef, contents }: ReaderProps) {
  const localRef = useRef<HTMLDivElement>(null);
  const scrollRef = containerRef ?? localRef;
  const articleRef = useRef<HTMLElement>(null);
  useDocumentLinks(scrollRef);
  // iPad: keep WebKit drawing the page across its full width (retile.ts).
  useEffect(() => {
    const el = scrollRef.current;
    return el ? attachRetile(el) : undefined;
  }, [scrollRef]);
  const [outline, setOutline] = useState<readonly OutlineItem[] | null>(null);
  const [currentId, setCurrentId] = useState<string | null>(null);

  useLayoutEffect(() => {
    if (!articleRef.current) return;
    articleRef.current.innerHTML = html;
    setOutline(readHeadings(articleRef.current));
  }, [html]);

  // The current section: the last heading at or above a line near the top of the view.
  const trackCurrent = useCallback(() => {
    const el = scrollRef.current;
    const article = articleRef.current;
    if (!el || !article || !outline) return;
    const line = el.getBoundingClientRect().top + Math.min(CURRENT_LINE_MAX_PX, el.clientHeight / 4);
    const headings = [...article.querySelectorAll(HEADINGS)].filter((heading) => heading.id);
    let index = -1;
    for (const [i, heading] of headings.entries()) {
      if (heading.getBoundingClientRect().top > line) break;
      index = i;
    }
    setCurrentId(index < 0 ? null : currentItemId(outline, index));
  }, [scrollRef, outline]);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let frame = 0;
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(() => {
        frame = 0;
        trackCurrent();
      });
    };
    trackCurrent();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("scroll", onScroll);
    };
  }, [scrollRef, trackCurrent]);

  const goToSection = useCallback(
    (item: OutlineItem) => {
      const el = scrollRef.current;
      const heading = articleRef.current?.querySelector(`#${CSS.escape(item.id)}`);
      if (!el || !heading) return;
      el.scrollTop += heading.getBoundingClientRect().top - el.getBoundingClientRect().top - JUMP_MARGIN_PX;
    },
    [scrollRef],
  );

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = initialScrollTop;
    return () => {
      if (el) onScrollPersist(el.scrollTop);
    };
    // Run once per mount; the parent remounts via `key` when the tab changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Also record the position once scrolling settles, not just on unmount, so the
  // autosaved session has the current reading position even if the app is quit in a way
  // that never unmounts this view (Dock → Quit, logout, a crash).
  const persistRef = useRef(onScrollPersist);
  persistRef.current = onScrollPersist;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let timer = 0;
    const onScroll = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => persistRef.current(el.scrollTop), SCROLL_SETTLE_MS);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.clearTimeout(timer);
      el.removeEventListener("scroll", onScroll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="doc-body">
      {contents.open && (
        <ContentsSidebar
          outline={outline}
          currentId={currentId}
          showPages={false}
          emptyMessage="This document has no headings."
          sourceLabel="From the document's headings"
          panel={contents}
          onSelect={goToSection}
        />
      )}
      <div className="reader-scroll" ref={scrollRef}>
        <article ref={articleRef} className="reader markdown-body" />
      </div>
    </div>
  );
}
