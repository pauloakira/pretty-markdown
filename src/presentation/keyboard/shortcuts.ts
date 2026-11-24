import type { KeyCommand, KeyModifier } from "./HardwareKeyCommands";
import type { ScrollAction } from "./scrollDocument";

/**
 * The app's keyboard shortcuts, for registering them with the system where it keeps
 * hardware keys from the page (iPadOS). The shortcuts themselves are handled by the
 * page's keydown handlers (useTabKeyboard, PdfReader): a press is played back to them as
 * the keydown it stands for (`keydownFor`), so each is defined once.
 */
export interface Shortcut extends KeyCommand {
  /** The keydown's `code` and `key`, as a Mac keyboard sends them. */
  readonly code: string;
  readonly key: string;
  /** Where it applies: always, or with a PDF / a markdown document showing. */
  readonly when: "always" | "pdf" | "markdown";
  /** Scrolls the document rather than standing for a keydown (a played keydown can't). */
  readonly scroll?: ScrollAction;
  /** Left out while text is being edited, where the key is the field's own. */
  readonly notWhileEditing?: boolean;
}

const cmd: readonly KeyModifier[] = ["command"];
const cmdShift: readonly KeyModifier[] = ["command", "shift"];

const tabDigits: Shortcut[] = Array.from({ length: 9 }, (_, i) => ({
  id: `tab-${i + 1}`,
  input: String(i + 1),
  modifiers: cmd,
  // Listed once, as the first, so the system's list stays short.
  title: i === 0 ? "Go to Tab 1–9" : "",
  priority: true,
  code: `Digit${i + 1}`,
  key: String(i + 1),
  when: "always" as const,
}));

export const SHORTCUTS: readonly Shortcut[] = [
  { id: "new-tab", input: "t", modifiers: cmd, priority: true, title: "Open in New Tab", code: "KeyT", key: "t", when: "always" },
  { id: "close-tab", input: "w", modifiers: cmd, priority: true, title: "Close Tab", code: "KeyW", key: "w", when: "always" },
  { id: "next-tab", input: "]", modifiers: cmdShift, priority: true, title: "Next Tab", code: "BracketRight", key: "}", when: "always" },
  { id: "previous-tab", input: "[", modifiers: cmdShift, priority: true, title: "Previous Tab", code: "BracketLeft", key: "{", when: "always" },
  { id: "next-tab-ctrl", input: "tab", modifiers: ["control"], priority: true, title: "", code: "Tab", key: "Tab", when: "always" },
  { id: "previous-tab-ctrl", input: "tab", modifiers: ["control", "shift"], priority: true, title: "", code: "Tab", key: "Tab", when: "always" },
  ...tabDigits,
  { id: "find", input: "f", modifiers: cmd, priority: true, title: "Find", code: "KeyF", key: "f", when: "always" },
  { id: "contents", input: "l", modifiers: cmdShift, priority: true, title: "Show or Hide Contents", code: "KeyL", key: "L", when: "always" },
  { id: "save", input: "s", modifiers: cmd, priority: true, title: "Save", code: "KeyS", key: "s", when: "always" },
  { id: "save-as", input: "s", modifiers: cmdShift, priority: true, title: "Save As…", code: "KeyS", key: "S", when: "markdown" },
  { id: "read-edit", input: "e", modifiers: cmd, priority: true, title: "Read or Edit", code: "KeyE", key: "e", when: "markdown" },
  { id: "export-pdf", input: "p", modifiers: cmd, priority: true, title: "Export PDF", code: "KeyP", key: "p", when: "markdown" },
  { id: "add-to-notes", input: "e", modifiers: cmd, priority: true, title: "Add to Notes", code: "KeyE", key: "e", when: "pdf" },
  { id: "notes", input: "n", modifiers: cmdShift, priority: true, title: "Show or Hide Notes", code: "KeyN", key: "N", when: "pdf" },
  { id: "highlight", input: "h", modifiers: cmdShift, priority: true, title: "Highlight Mode", code: "KeyH", key: "H", when: "pdf" },
  { id: "zoom-in", input: "=", modifiers: cmd, priority: true, title: "Zoom In", code: "Equal", key: "=", when: "pdf" },
  { id: "zoom-out", input: "-", modifiers: cmd, priority: true, title: "Zoom Out", code: "Minus", key: "-", when: "pdf" },
  { id: "fit-width", input: "0", modifiers: cmd, priority: true, title: "Fit Width", code: "Digit0", key: "0", when: "pdf" },
  { id: "back", input: "[", modifiers: cmd, priority: true, title: "Back", code: "BracketLeft", key: "[", when: "pdf" },
  // Highlights' undo; left out while text is edited (the field's own undo), as the reading keys.
  { id: "undo", input: "z", modifiers: cmd, priority: true, title: "Undo Highlight", code: "KeyZ", key: "z", when: "pdf", notWhileEditing: true },
  { id: "redo", input: "z", modifiers: cmdShift, priority: true, title: "Redo Highlight", code: "KeyZ", key: "Z", when: "pdf", notWhileEditing: true },
  // Closes the find bar, menus and dialogs, leaves highlight mode, finishes a note.
  { id: "escape", input: "escape", modifiers: [], priority: true, title: "", code: "Escape", key: "Escape", when: "always" },
  // Reading keys: they scroll the document (not while text is being edited, see shortcutsFor).
  ...scrollKeys(),
];

function scrollKeys(): Shortcut[] {
  const key = (id: string, input: string, modifiers: readonly KeyModifier[], scroll: ScrollAction): Shortcut => ({
    id,
    input,
    modifiers,
    priority: true,
    title: "",
    code: "",
    key: "",
    when: "always",
    scroll,
    notWhileEditing: true,
  });
  return [
    key("line-down", "down", [], "line-down"),
    key("line-up", "up", [], "line-up"),
    key("page-down", "pagedown", [], "page-down"),
    key("page-up", "pageup", [], "page-up"),
    key("space", " ", [], "page-down"),
    key("shift-space", " ", ["shift"], "page-up"),
    key("top", "home", [], "top"),
    key("bottom", "end", [], "bottom"),
    key("cmd-up", "up", ["command"], "top"),
    key("cmd-down", "down", ["command"], "bottom"),
  ];
}

/**
 * The shortcuts that apply with `showing` in the active tab (null: no tab). While text is
 * being edited the reading keys and ⌘Z are left out, so arrows, Space, Page Down and undo
 * stay the field's own.
 */
export function shortcutsFor(showing: "pdf" | "markdown" | null, editing = false): readonly Shortcut[] {
  return SHORTCUTS.filter((s) => (s.when === "always" || s.when === showing) && !(editing && s.notWhileEditing));
}

/** The keydown a shortcut stands for, to play to the page's handlers. */
export function keydownFor(shortcut: Shortcut): KeyboardEventInit {
  return {
    key: shortcut.key,
    code: shortcut.code,
    metaKey: shortcut.modifiers.includes("command"),
    shiftKey: shortcut.modifiers.includes("shift"),
    ctrlKey: shortcut.modifiers.includes("control"),
    altKey: shortcut.modifiers.includes("alternate"),
    bubbles: true,
    cancelable: true,
  };
}
