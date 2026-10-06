import { useEffect, type RefObject } from "react";
import { useContainer } from "../../composition/ContainerContext";
import { classifyLink, fragmentIds } from "../../domain/values/Link";

/**
 * Handles link clicks in a rendered markdown document (reader and edit-mode preview).
 *
 * Left alone, a click on `<a href="https://…">` navigates the app's own web view away
 * from the UI: the opener plugin's script only intercepts `target="_blank"` links. So
 * every link click is taken over: `#fragment` scrolls within the document, http(s) and
 * mailto open outside the app via the `LinkOpener`, and anything else (relative paths,
 * `file:`) does nothing.
 */
export function useDocumentLinks(scrollRef: RefObject<HTMLElement | null>): void {
  const { linkOpener } = useContainer();

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const onClick = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!anchor || !container.contains(anchor)) return;
      event.preventDefault();
      const link = classifyLink(anchor.getAttribute("href") ?? "");
      if (link.kind === "fragment") scrollToFragment(container, link.id);
      else if (link.kind === "external") void linkOpener.openExternal(link.url);
    };
    container.addEventListener("click", onClick);
    return () => container.removeEventListener("click", onClick);
  }, [scrollRef, linkOpener]);
}

/**
 * Scroll the container so the fragment's target sits at the top. Computed by hand (as
 * find-in-page does) because `scrollIntoView` doesn't move nested overflow in WKWebView.
 * `#` and `#top` with no matching element go to the top, as in a browser.
 */
function scrollToFragment(container: HTMLElement, id: string): void {
  const ids = fragmentIds(id);
  const target = Array.from(container.querySelectorAll<HTMLElement>("[id]")).find((el) =>
    ids.includes(el.id),
  );
  if (!target) {
    if (id === "" || id.toLowerCase() === "top") container.scrollTop = 0;
    return;
  }
  const offset = target.getBoundingClientRect().top - container.getBoundingClientRect().top;
  container.scrollTop = Math.max(0, container.scrollTop + offset);
}
