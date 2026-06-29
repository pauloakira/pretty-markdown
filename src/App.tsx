import { useCallback, useMemo, useRef, useState } from "react";
import { isTabDirty, type TabId } from "./domain/entities/Tab";
import { CloseConfirm } from "./presentation/components/CloseConfirm";
import { DocumentToolbar } from "./presentation/components/DocumentToolbar";
import { EditMode } from "./presentation/components/EditMode";
import { FindBar } from "./presentation/components/FindBar";
import { QuitConfirm } from "./presentation/components/QuitConfirm";
import { Reader } from "./presentation/components/Reader";
import { SettingsPanel } from "./presentation/components/SettingsPanel";
import { TabBar } from "./presentation/components/TabBar";
import { Welcome } from "./presentation/components/Welcome";
import { useFind } from "./presentation/hooks/useFind";
import { useLatexCopy } from "./presentation/hooks/useLatexCopy";
import { useQuitGuard } from "./presentation/hooks/useQuitGuard";
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
    closeTab,
    activateTab,
    focusSibling,
    activateIndex,
    moveTab,
    persistScroll,
    toggleMode,
    updateContent,
    saveTab,
    saveTabAs,
  } = useWorkspace();

  const { settings, update: updateSettings, reset: resetSettings } = useSettings();
  const { persist: persistSession, clear: clearSession, quit } = useSession();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pendingCloseId, setPendingCloseId] = useState<TabId | null>(null);
  const [quitPromptOpen, setQuitPromptOpen] = useState(false);

  const readerRef = useRef<HTMLDivElement>(null);
  const find = useFind(readerRef, active?.id ?? null);
  const { openFind, closeFind } = find;

  const mode = active?.viewState.mode ?? "reader";
  const dirty = active ? isTabDirty(active) : false;

  // Closing a dirty tab routes through a save prompt.
  const requestClose = useCallback(
    (id: TabId) => {
      const tab = workspace.tabs.find((t) => t.id === id);
      if (tab && isTabDirty(tab)) setPendingCloseId(id);
      else closeTab(id);
    },
    [workspace, closeTab],
  );

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

  const shortcuts = useMemo(
    () => ({
      newTab: open,
      closeActive,
      focusSibling,
      activateIndex,
      openFind: () => {
        if (active && active.viewState.mode === "reader") openFind();
      },
      save: saveActive,
      saveAs: saveActiveAs,
      toggleMode: toggleActiveMode,
    }),
    [open, closeActive, focusSibling, activateIndex, active, openFind, saveActive, saveActiveAs, toggleActiveMode],
  );
  useTabKeyboard(shortcuts);

  // On window close: prompt to reopen tabs next time (or just quit if nothing is open).
  const onCloseRequest = useCallback(() => {
    if (workspace.tabs.length === 0) void quit();
    else setQuitPromptOpen(true);
  }, [workspace.tabs.length, quit]);
  useQuitGuard(onCloseRequest);

  const hasTabs = workspace.tabs.length > 0;
  const pendingTab = pendingCloseId
    ? workspace.tabs.find((t) => t.id === pendingCloseId)
    : null;

  return (
    <div className="app">
      {hasTabs && (
        <TabBar
          tabs={workspace.tabs}
          activeTabId={workspace.activeTabId}
          busy={busy}
          onSelect={activateTab}
          onClose={requestClose}
          onNew={open}
          onReorder={moveTab}
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
        />
      )}
      <main className="app__content">
        {error && <div className="banner banner--error">{error}</div>}
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
              key={active.id}
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
          <Welcome onOpen={open} onOpenSettings={() => setSettingsOpen(true)} />
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
            setPendingCloseId(null);
            if (await saveTab(id)) closeTab(id);
          }}
          onDiscard={() => {
            const id = pendingTab.id;
            setPendingCloseId(null);
            closeTab(id);
          }}
          onCancel={() => setPendingCloseId(null)}
        />
      )}
      {quitPromptOpen && (
        <QuitConfirm
          tabCount={workspace.tabs.length}
          dirtyCount={workspace.tabs.filter(isTabDirty).length}
          onRemember={async () => {
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
