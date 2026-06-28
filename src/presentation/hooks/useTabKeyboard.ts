import { useEffect } from "react";

export interface TabShortcuts {
  newTab: () => void;
  closeActive: () => void;
  focusSibling: (delta: 1 | -1) => void;
  activateIndex: (index: number) => void;
  openFind: () => void;
}

/**
 * Browser-familiar shortcuts: ⌘/Ctrl+T new, ⌘/Ctrl+W close, ⌘/Ctrl+Shift+[ or ]
 * (and Ctrl+Tab) to switch, ⌘/Ctrl+1–9 to jump, ⌘/Ctrl+F to find. Uses `event.code`
 * for brackets/digits so it's independent of the shifted character and keyboard layout.
 */
export function useTabKeyboard(shortcuts: TabShortcuts): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.code === "Tab") {
        e.preventDefault();
        shortcuts.focusSibling(e.shiftKey ? -1 : 1);
        return;
      }

      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      if (e.code === "KeyT") {
        e.preventDefault();
        shortcuts.newTab();
      } else if (e.code === "KeyW") {
        e.preventDefault();
        shortcuts.closeActive();
      } else if (e.code === "KeyF") {
        e.preventDefault();
        shortcuts.openFind();
      } else if (e.shiftKey && e.code === "BracketLeft") {
        e.preventDefault();
        shortcuts.focusSibling(-1);
      } else if (e.shiftKey && e.code === "BracketRight") {
        e.preventDefault();
        shortcuts.focusSibling(1);
      } else if (/^Digit[1-9]$/.test(e.code)) {
        e.preventDefault();
        shortcuts.activateIndex(Number(e.code.slice(5)) - 1);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [shortcuts]);
}
