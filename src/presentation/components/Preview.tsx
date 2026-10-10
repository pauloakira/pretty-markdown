import { useLayoutEffect, useRef, type RefObject } from "react";
import { useDocumentLinks } from "../hooks/useDocumentLinks";

interface PreviewProps {
  html: string;
  scrollRef?: RefObject<HTMLDivElement | null>;
}

/**
 * Live-preview pane for edit mode. Like the Reader, it sets content imperatively (not via
 * dangerouslySetInnerHTML) so React doesn't own the subtree, and takes over link clicks
 * the same way.
 */
export function Preview({ html, scrollRef }: PreviewProps) {
  const localRef = useRef<HTMLDivElement>(null);
  const ref = scrollRef ?? localRef;
  const articleRef = useRef<HTMLElement>(null);
  useDocumentLinks(ref);

  useLayoutEffect(() => {
    if (articleRef.current) articleRef.current.innerHTML = html;
  }, [html]);

  return (
    <div className="reader-scroll" ref={ref}>
      <article ref={articleRef} className="reader markdown-body" />
    </div>
  );
}
