import { useMemo } from "react";
import { Reader } from "./presentation/components/Reader";
import { TabBar } from "./presentation/components/TabBar";
import { Welcome } from "./presentation/components/Welcome";
import { useLatexCopy } from "./presentation/hooks/useLatexCopy";
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

  const shortcuts = useMemo(
    () => ({ newTab: open, closeActive, focusSibling, activateIndex }),
    [open, closeActive, focusSibling, activateIndex],
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
        />
      )}
      <main className="app__content">
        {error && <div className="banner banner--error">{error}</div>}
        {active ? (
          <Reader
            key={active.id}
            html={html}
            initialScrollTop={active.viewState.scrollTop}
            onScrollPersist={(scrollTop) => persistScroll(active.id, scrollTop)}
          />
        ) : (
          <Welcome onOpen={open} />
        )}
      </main>
    </div>
  );
}
