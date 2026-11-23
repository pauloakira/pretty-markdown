import { useCallback, useEffect, useState } from "react";
import { useContainer } from "../../composition/ContainerContext";
import type { TabId } from "../../domain/entities/Tab";
import { findTabByPath } from "../../domain/entities/Workspace";
import { resolveFileLink } from "../../domain/values/Link";
import type { PassageTarget } from "../pdf/PdfViewer";

/** A passage waiting to be shown in a PDF tab once its document is ready. */
interface PendingReveal {
  readonly tabId: TabId;
  readonly target: PassageTarget;
}

export interface FileLinks {
  /**
   * Follow a link to another file (see `FileLinkContext`), relative to the Markdown
   * document on screen, or to `base` (a notes file shown in a PDF's Notes panel).
   */
  readonly openFileLink: (href: string, base?: string) => void;
  /** The passage the tab `tabId` should show once ready, or null. */
  readonly revealFor: (tabId: TabId) => PassageTarget | null;
  /** The passage has been shown. */
  readonly revealed: () => void;
}

/**
 * Links from a Markdown document to other files: a quote's "↗ p. 133" link opens its PDF
 * at the passage and flashes it (docs/RESEARCH_READER.md); a link to another Markdown file
 * or PDF opens it in a tab.
 *
 * A PDF that's already open in a tab first remembers where it was, so its Back pill (⌘[)
 * returns there. A PDF opened by the link has nowhere to go back to.
 */
export function useFileLinks(
  fromPath: string | null,
  activeTabId: TabId | null,
  openPath: (path: string) => Promise<void>,
): FileLinks {
  const { tabManager } = useContainer();
  const [pending, setPending] = useState<PendingReveal | null>(null);

  const openFileLink = useCallback(
    (href: string, base?: string) => {
      const relativeTo = base ?? fromPath;
      if (relativeTo === null) return;
      const link = resolveFileLink(href, relativeTo);
      if (link === null || link.path === relativeTo) return;
      const before = findTabByPath(tabManager.getSnapshot(), link.path);
      const from = before?.viewState.pdf ?? null;
      void (async () => {
        await openPath(link.path);
        const tab = findTabByPath(tabManager.getSnapshot(), link.path);
        if (!tab || tab.document.kind !== "pdf" || link.page === undefined) return;
        // Open at the passage's page straight away (not where the tab was, then jump);
        // the viewer brings the passage itself into view once the document is ready.
        if (before && from) tabManager.pushBack(tab.id, from);
        const zoom = tab.viewState.pdf?.zoom ?? "page-width";
        tabManager.setPdfView(tab.id, { page: link.page, pageOffset: 0, zoom });
        setPending({ tabId: tab.id, target: { page: link.page, ...(link.rect ? { rect: link.rect } : {}) } });
      })();
    },
    [fromPath, openPath, tabManager],
  );

  // A reveal is for the tab it was made for, while that tab is showing.
  useEffect(() => {
    setPending((current) => (current && current.tabId !== activeTabId ? null : current));
  }, [activeTabId]);

  const revealFor = useCallback(
    (tabId: TabId) => (pending && pending.tabId === tabId ? pending.target : null),
    [pending],
  );
  const revealed = useCallback(() => setPending(null), []);

  return { openFileLink, revealFor, revealed };
}
