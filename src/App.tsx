import { useMemo, useRef, useState } from "react";
import { FindBar } from "./presentation/components/FindBar";
import { Reader } from "./presentation/components/Reader";
import { SettingsPanel } from "./presentation/components/SettingsPanel";
import { TabBar } from "./presentation/components/TabBar";
import { Welcome } from "./presentation/components/Welcome";
import { useFind } from "./presentation/hooks/useFind";
import { useLatexCopy } from "./presentation/hooks/useLatexCopy";
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
    open,
    closeTab,
    closeActive,
    activateTab,
    focusSibling,
    activateIndex,
    moveTab,
    persistScroll,
  } = useWorkspace();

  const { settings, update: updateSettings, reset: resetSettings } = useSettings();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const readerRef = useRef<HTMLDivElement>(null);
  const find = useFind(readerRef, active?.id ?? null);
  const { openFind } = find;

  const hasActive = active !== null;
  const shortcuts = useMemo(
    () => ({
      newTab: open,
      closeActive,
      focusSibling,
      activateIndex,
      openFind: () => {
        if (hasActive) openFind();
      },
    }),
    [open, closeActive, focusSibling, activateIndex, hasActive, openFind],
  );
  useTabKeyboard(shortcuts);

  const hasTabs = workspace.tabs.length > 0;

  return (
    <div className="app">
      {hasTabs && (
        <TabBar
          tabs={workspace.tabs}
          activeTabId={workspace.activeTabId}
          busy={busy}
          onSelect={activateTab}
          onClose={closeTab}
          onNew={open}
          onReorder={moveTab}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      )}
      <main className="app__content">
        {error && <div className="banner banner--error">{error}</div>}
        {active && find.open && (
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
          <Reader
            key={active.id}
            html={html}
            initialScrollTop={active.viewState.scrollTop}
            onScrollPersist={(scrollTop) => persistScroll(active.id, scrollTop)}
            containerRef={readerRef}
          />
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
    </div>
  );
}
