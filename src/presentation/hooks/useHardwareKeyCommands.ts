import { useEffect, useState } from "react";
import type { HardwareKeyCommands } from "../keyboard/HardwareKeyCommands";
import { scrollDocument } from "../keyboard/scrollDocument";
import { keydownFor, SHORTCUTS, shortcutsFor } from "../keyboard/shortcuts";

/**
 * Where the system keeps hardware keys from the page (iPadOS), register the shortcuts that
 * apply now with it, and play each press to the page as its keydown: on the focused
 * element, so an editor gets its own shortcuts (CodeMirror's ⌘F) as it would from the
 * keyboard. Reading keys (arrows, Space, Page Down, …) scroll the document instead, as a
 * played keydown can't. Nothing to do where the page gets the keys itself (`commands` is
 * null).
 */
export function useHardwareKeyCommands(
  commands: HardwareKeyCommands | null,
  showing: "pdf" | "markdown" | null,
): void {
  // Whether text is being edited (a field, the note, the editor): then the reading keys are
  // the field's own.
  const [editing, setEditing] = useState(isEditing);
  useEffect(() => {
    if (!commands) return;
    const update = () => setEditing(isEditing());
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    return () => {
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
    };
  }, [commands]);

  useEffect(() => {
    if (!commands) return;
    commands.set(shortcutsFor(showing, editing));
  }, [commands, showing, editing]);

  useEffect(() => {
    if (!commands) return;
    return commands.onPress((id) => {
      const shortcut = SHORTCUTS.find((s) => s.id === id);
      if (!shortcut) return;
      if (shortcut.scroll) {
        scrollDocument(shortcut.scroll);
        return;
      }
      const target = document.activeElement instanceof HTMLElement ? document.activeElement : document.body;
      target.dispatchEvent(new KeyboardEvent("keydown", keydownFor(shortcut)));
    });
  }, [commands]);
}

/** Whether the focused element takes typing. (After focusout, focus is on the body.) */
function isEditing(): boolean {
  const active = document.activeElement;
  return active instanceof HTMLElement && (active.isContentEditable || active.matches("input, textarea, select"));
}
