import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useContainer } from "../../composition/ContainerContext";
import type { TabId } from "../../domain/entities/Tab";
import { activeTab } from "../../domain/entities/Workspace";

/**
 * Presentation-facing hook over the multi-tab workspace. Subscribes to the TabManager
 * via useSyncExternalStore and exposes the workspace plus tab actions. Rendered HTML for
 * the active tab is memoized in a per-tab cache, so switching back to a tab is instant
 * and inactive tabs cost nothing (lazy mounting, DESIGN.md §3.4).
 */
export function useWorkspace() {
  const container = useContainer();
  const { tabManager } = container;

  const workspace = useSyncExternalStore(tabManager.subscribe, tabManager.getSnapshot);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const htmlCache = useRef<Map<TabId, string>>(new Map());

  const open = useCallback(async () => {
    setBusy(true);
    try {
      const outcome = await container.documentService.open();
      if (outcome.kind === "opened") {
        tabManager.openDocument(outcome.document);
        setError(null);
      } else if (outcome.kind === "error") {
        setError(outcome.message);
      }
    } finally {
      setBusy(false);
    }
  }, [container, tabManager]);

  const closeTab = useCallback(
    (id: TabId) => {
      htmlCache.current.delete(id);
      tabManager.closeTab(id);
    },
    [tabManager],
  );

  const activateTab = useCallback((id: TabId) => tabManager.activateTab(id), [tabManager]);
  const focusSibling = useCallback(
    (delta: 1 | -1) => tabManager.focusSibling(delta),
    [tabManager],
  );
  const activateIndex = useCallback(
    (index: number) => tabManager.activateIndex(index),
    [tabManager],
  );
  const moveTab = useCallback(
    (id: TabId, toIndex: number) => tabManager.moveTab(id, toIndex),
    [tabManager],
  );
  const persistScroll = useCallback(
    (id: TabId, scrollTop: number) => tabManager.persistViewState(id, { scrollTop }),
    [tabManager],
  );

  const active = activeTab(workspace);
  const closeActive = useCallback(() => {
    if (active) closeTab(active.id);
  }, [active, closeTab]);

  const html = useMemo(() => {
    if (!active) return "";
    const cached = htmlCache.current.get(active.id);
    if (cached !== undefined) return cached;
    const rendered = container.pipeline.render(active.document.content);
    htmlCache.current.set(active.id, rendered);
    return rendered;
  }, [active, container]);

  return {
    workspace,
    active,
    html,
    error,
    busy,
    open,
    closeTab,
    closeActive,
    activateTab,
    focusSibling,
    activateIndex,
    moveTab,
    persistScroll,
  };
}
