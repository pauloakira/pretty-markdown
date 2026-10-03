import { useCallback, useMemo, useRef, useState } from "react";
import { isTabDirty, type TabId } from "./domain/entities/Tab";
import type { GroupId } from "./domain/entities/TabGroup";
import { CloseConfirm } from "./presentation/components/CloseConfirm";
import { DocumentToolbar } from "./presentation/components/DocumentToolbar";
import { EditMode } from "./presentation/components/EditMode";
import { FindBar } from "./presentation/components/FindBar";
import { QuitConfirm } from "./presentation/components/QuitConfirm";
import { Reader } from "./presentation/components/Reader";
import { SettingsPanel } from "./presentation/components/SettingsPanel";
import { TabBar } from "./presentation/components/TabBar";
import { Welcome } from "./presentation/components/Welcome";
import { useFileOpen } from "./presentation/hooks/useFileOpen";
import { useFileWatch } from "./presentation/hooks/useFileWatch";
import { useFind } from "./presentation/hooks/useFind";
import { useLatexCopy } from "./presentation/hooks/useLatexCopy";
import { useQuitGuard } from "./presentation/hooks/useQuitGuard";
import { useRecentFiles } from "./presentation/hooks/useRecentFiles";
import { useSession } from "./presentation/hooks/useSession";
import { useSettings } from "./presentation/hooks/useSettings";
import { useTabKeyboard } from "./presentation/hooks/useTabKeyboard";
import { useWorkspace } from "./presentation/hooks/useWorkspace";

export default function App() {
  useLatexCopy();

  const {
    workspace,
    active,
    html,
    error,
    busy,
    renderMarkdown,
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
    toggleMode,
    updateContent,
    saveTab,
    saveTabAs,
    exportPdf,
  } = useWorkspace();

  const { settings, update: updateSettings, reset: resetSettings } = useSettings();
  const { recents, remember: rememberRecent } = useRecentFiles();
  const { persist: persistSession, clear: clearSession, quit } = useSession();

  // Open via dialog / by path, recording the result in the recent-files list.
  const openViaDialog = useCallback(async () => {
    const doc = await open();
    if (doc?.path) rememberRecent({ path: doc.path, name: doc.name });
  }, [open, rememberRecent]);
  const openRecent = useCallback(
    async (path: string) => {
      const doc = await openPath(path);
      if (doc?.path) rememberRecent({ path: doc.path, name: doc.name });
    },
    [openPath, rememberRecent],
  );
  const openIntoGroup = useCallback(
    async (groupId: GroupId) => {
      const doc = await openInGroup(groupId);
      if (doc?.path) rememberRecent({ path: doc.path, name: doc.name });
    },
    [openInGroup, rememberRecent],
  );
  // Files opened from Finder (double-click / file association).
  useFileOpen(openRecent);
  // Reload documents that change on disk (or flag a conflict if they have unsaved edits).
  const fileWatch = useFileWatch(workspace.tabs);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Dirty tabs waiting for a save prompt, one at a time (closing a group or "other tabs"
  // can queue several).
  const [closeQueue, setCloseQueue] = useState<readonly TabId[]>([]);
  const [quitPromptOpen, setQuitPromptOpen] = useState(false);

  const readerRef = useRef<HTMLDivElement>(null);
  const find = useFind(readerRef, active?.id ?? null);
  const { openFind, closeFind } = find;

  const mode = active?.viewState.mode ?? "reader";
  const dirty = active ? isTabDirty(active) : false;

  // The active reader's live scroll lives in the DOM, not yet in view state (that's only
  // captured on unmount). Flush it before saving the session so the reading position is
  // restored on the tab you were actually looking at.
  const flushActiveScroll = useCallback(() => {
    if (active && mode === "reader" && readerRef.current) {
      persistScroll(active.id, readerRef.current.scrollTop);
    }
  }, [active, mode, persistScroll]);

  // Closing dirty tabs routes through a save prompt; clean ones close right away.
  const requestCloseMany = useCallback(
    (ids: readonly TabId[]) => {
      const dirty: TabId[] = [];
      for (const id of ids) {
        const tab = workspace.tabs.find((t) => t.id === id);
        if (tab && isTabDirty(tab)) dirty.push(id);
        else closeTab(id);
      }
      if (dirty.length > 0) {
        setCloseQueue((queue) => [...queue, ...dirty.filter((id) => !queue.includes(id))]);
      }
    },
    [workspace, closeTab],
  );
  const requestClose = useCallback((id: TabId) => requestCloseMany([id]), [requestCloseMany]);

  const closeActive = useCallback(() => {
    if (active) requestClose(active.id);
  }, [active, requestClose]);
  const saveActive = useCallback(() => {
    if (active) void saveTab(active.id);
  }, [active, saveTab]);
  const saveActiveAs = useCallback(() => {
    if (active) void saveTabAs(active.id);
  }, [active, saveTabAs]);
  const toggleActiveMode = useCallback(() => {
    if (active) {
      toggleMode(active.id);
      closeFind();
    }
  }, [active, toggleMode, closeFind]);
  const exportActive = useCallback(() => {
    if (active) void exportPdf(active.document);
  }, [active, exportPdf]);

  const shortcuts = useMemo(
    () => ({
      newTab: openViaDialog,
      closeActive,
      focusSibling,
      activateIndex,
      openFind: () => {
        if (active && active.viewState.mode === "reader") openFind();
      },
      save: saveActive,
      saveAs: saveActiveAs,
      toggleMode: toggleActiveMode,
      exportPdf: exportActive,
    }),
    [openViaDialog, closeActive, focusSibling, activateIndex, active, openFind, saveActive, saveActiveAs, toggleActiveMode, exportActive],
  );
  useTabKeyboard(shortcuts);

  // On window close: prompt to reopen tabs next time (or just quit if nothing is open).
  const onCloseRequest = useCallback(() => {
    if (workspace.tabs.length === 0) void quit();
    else setQuitPromptOpen(true);
  }, [workspace.tabs.length, quit]);
  useQuitGuard(onCloseRequest);

  const hasTabs = workspace.tabs.length > 0;
  const pendingTab = closeQueue
    .map((id) => workspace.tabs.find((t) => t.id === id))
    .find((t) => t !== undefined);
  const settleClose = (id: TabId) => setCloseQueue((queue) => queue.filter((q) => q !== id));

  return (
    <div className="app">
      {hasTabs && (
        <TabBar
          workspace={workspace}
          busy={busy}
          groups={groupActions}
          onSelect={activateTab}
          onClose={requestClose}
          onCloseMany={requestCloseMany}
          onNew={openViaDialog}
          onNewInGroup={(groupId) => void openIntoGroup(groupId)}
          onDrop={dropTab}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      )}
      {active && (
        <DocumentToolbar
          name={active.document.name}
          mode={mode}
          dirty={dirty}
          onToggleMode={toggleActiveMode}
          onSave={saveActive}
          onExportPdf={exportActive}
        />
      )}
      <main className="app__content">
        {error && <div className="banner banner--error">{error}</div>}
        {active && fileWatch.conflicts[active.id] !== undefined && (
          <div className="banner banner--warn">
            <span>This file changed on disk while you had unsaved edits.</span>
            <span className="banner__actions">
              <button className="banner__btn" onClick={() => fileWatch.reloadConflict(active.id)}>
                Reload from disk
              </button>
              <button className="banner__btn" onClick={() => fileWatch.dismissConflict(active.id)}>
                Keep my edits
              </button>
            </span>
          </div>
        )}
        {active && find.open && mode === "reader" && (
          <FindBar
            query={find.query}
            count={find.result.count}
            index={find.result.index}
            onQueryChange={find.changeQuery}
            onNext={find.next}
            onPrevious={find.previous}
            onClose={find.closeFind}
          />
        )}
        {active ? (
          mode === "edit" ? (
            <EditMode
              key={`${active.id}:${active.revision}`}
              doc={active.document}
              renderMarkdown={renderMarkdown}
              onContentChange={(content) => updateContent(active.id, content)}
            />
          ) : (
            <Reader
              key={active.id}
              html={html}
              initialScrollTop={active.viewState.scrollTop}
              onScrollPersist={(scrollTop) => persistScroll(active.id, scrollTop)}
              containerRef={readerRef}
            />
          )
        ) : (
          <Welcome
            recents={recents}
            onOpen={openViaDialog}
            onOpenRecent={openRecent}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        )}
      </main>
      {settingsOpen && (
        <SettingsPanel
          settings={settings}
          onUpdate={updateSettings}
          onReset={resetSettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {pendingTab && (
        <CloseConfirm
          name={pendingTab.document.name}
          onSave={async () => {
            const id = pendingTab.id;
            settleClose(id);
            if (await saveTab(id)) closeTab(id);
          }}
          onDiscard={() => {
            const id = pendingTab.id;
            settleClose(id);
            closeTab(id);
          }}
          onCancel={() => setCloseQueue([])}
        />
      )}
      {quitPromptOpen && (
        <QuitConfirm
          tabCount={workspace.tabs.length}
          dirtyCount={workspace.tabs.filter(isTabDirty).length}
          onRemember={async () => {
            flushActiveScroll();
            await persistSession();
            await quit();
          }}
          onForget={async () => {
            await clearSession();
            await quit();
          }}
          onCancel={() => setQuitPromptOpen(false)}
        />
      )}
    </div>
  );
}
