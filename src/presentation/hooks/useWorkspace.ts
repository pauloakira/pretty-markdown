import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useContainer } from "../../composition/ContainerContext";
import type { Document, MarkdownDocument } from "../../domain/entities/Document";
import type { TabId } from "../../domain/entities/Tab";
import type { GroupId } from "../../domain/entities/TabGroup";
import { activeTab, findTabByPath } from "../../domain/entities/Workspace";
import type { TabGroupActions } from "../components/TabBar";
import type { EditorMode, PdfView } from "../../domain/values/ViewState";

/**
 * Presentation-facing hook over the multi-tab workspace. Subscribes to the TabManager
 * via useSyncExternalStore and exposes the workspace plus tab/editor actions. Reader-mode
 * HTML is memoized by content (the editor renders its own live preview).
 */
export function useWorkspace() {
  const container = useContainer();
  const { tabManager } = container;

  const workspace = useSyncExternalStore(tabManager.subscribe, tabManager.getSnapshot);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const htmlCache = useRef<Map<string, string>>(new Map());

  const renderMarkdown = useCallback(
    (src: string) => container.pipeline.render(src),
    [container],
  );

  const exportPdf = useCallback(
    async (document: MarkdownDocument) => {
      const html = container.pipeline.render(document.content);
      await container.documentExporter.exportPdf({ title: document.name, html });
    },
    [container],
  );

  const open = useCallback(async (): Promise<Document | null> => {
    setBusy(true);
    try {
      const outcome = await container.documentService.open();
      if (outcome.kind === "opened") {
        tabManager.openDocument(outcome.document);
        setError(null);
        return outcome.document;
      }
      if (outcome.kind === "error") setError(outcome.message);
      return null;
    } finally {
      setBusy(false);
    }
  }, [container, tabManager]);

  const openPath = useCallback(
    async (path: string): Promise<Document | null> => {
      const outcome = await container.documentService.load(path);
      if (outcome.kind === "opened") {
        tabManager.openDocument(outcome.document);
        setError(null);
        return outcome.document;
      }
      if (outcome.kind === "error") setError(outcome.message);
      return null;
    },
    [container, tabManager],
  );

  /** Open a document via the dialog and put its tab in `groupId`. */
  const openInGroup = useCallback(
    async (groupId: GroupId): Promise<Document | null> => {
      const doc = await open();
      const tab = doc ? findTabByPath(tabManager.getSnapshot(), doc.path) : null;
      if (tab) tabManager.addToGroup(tab.id, groupId);
      return doc;
    },
    [open, tabManager],
  );

  const groupActions = useMemo<TabGroupActions>(
    () => ({
      create: (tabId) => tabManager.createGroup(tabId),
      addTo: (tabId, groupId) => tabManager.addToGroup(tabId, groupId),
      removeFrom: (tabId) => tabManager.removeFromGroup(tabId),
      rename: (groupId, name) => tabManager.renameGroup(groupId, name),
      recolor: (groupId, color) => tabManager.recolorGroup(groupId, color),
      toggleCollapsed: (groupId) => tabManager.toggleGroupCollapsed(groupId),
      move: (groupId, toUnit) => tabManager.moveGroup(groupId, toUnit),
      ungroup: (groupId) => tabManager.ungroup(groupId),
      byFolder: () => tabManager.groupByFolder(),
    }),
    [tabManager],
  );

  const closeTab = useCallback((id: TabId) => tabManager.closeTab(id), [tabManager]);
  const activateTab = useCallback((id: TabId) => tabManager.activateTab(id), [tabManager]);
  const focusSibling = useCallback(
    (delta: 1 | -1) => tabManager.focusSibling(delta),
    [tabManager],
  );
  const activateIndex = useCallback(
    (index: number) => tabManager.activateIndex(index),
    [tabManager],
  );
  const dropTab = useCallback(
    (id: TabId, gap: number, outside: boolean) => tabManager.dropTab(id, gap, outside),
    [tabManager],
  );
  const persistScroll = useCallback(
    (id: TabId, scrollTop: number) => tabManager.persistScroll(id, scrollTop),
    [tabManager],
  );
  const setPdfView = useCallback(
    (id: TabId, view: PdfView) => tabManager.setPdfView(id, view),
    [tabManager],
  );
  const setMode = useCallback(
    (id: TabId, mode: EditorMode) => tabManager.setMode(id, mode),
    [tabManager],
  );
  const toggleMode = useCallback((id: TabId) => tabManager.toggleMode(id), [tabManager]);
  const updateContent = useCallback(
    (id: TabId, content: string) => tabManager.updateContent(id, content),
    [tabManager],
  );

  const saveTab = useCallback(
    async (id: TabId): Promise<boolean> => {
      const tab = tabManager.getSnapshot().tabs.find((t) => t.id === id);
      if (!tab || tab.document.kind !== "markdown") return false; // PDFs are never written
      const outcome = await container.documentService.save(
        tab.document.content,
        tab.document.path,
      );
      if (outcome.kind === "saved") {
        tabManager.markSaved(id, outcome.path, outcome.name);
        setError(null);
        return true;
      }
      if (outcome.kind === "error") setError(outcome.message);
      return false;
    },
    [container, tabManager],
  );

  const saveTabAs = useCallback(
    async (id: TabId): Promise<boolean> => {
      const tab = tabManager.getSnapshot().tabs.find((t) => t.id === id);
      if (!tab || tab.document.kind !== "markdown") return false; // PDFs are never written
      const outcome = await container.documentService.saveAs(
        tab.document.content,
        tab.document.name,
      );
      if (outcome.kind === "saved") {
        tabManager.markSaved(id, outcome.path, outcome.name);
        setError(null);
        return true;
      }
      if (outcome.kind === "error") setError(outcome.message);
      return false;
    },
    [container, tabManager],
  );

  const active = activeTab(workspace);

  const html = useMemo(() => {
    if (!active || active.document.kind !== "markdown" || active.viewState.mode !== "reader") {
      return "";
    }
    const content = active.document.content;
    const cache = htmlCache.current;
    const cached = cache.get(content);
    if (cached !== undefined) return cached;
    const rendered = renderMarkdown(content);
    if (cache.size > 32) cache.clear(); // keep the memo bounded
    cache.set(content, rendered);
    return rendered;
  }, [active, renderMarkdown]);

  return {
    workspace,
    active,
    html,
    error,
    busy,
    renderMarkdown,
    exportPdf,
    open,
    openPath,
    openInGroup,
    groupActions,
    closeTab,
    activateTab,
    focusSibling,
    activateIndex,
    dropTab,
    persistScroll,
    setPdfView,
    setMode,
    toggleMode,
    updateContent,
    saveTab,
    saveTabAs,
  };
}
