/**
 * Keyboard shortcuts registered with the system, for a platform that keeps hardware keys
 * from the page (iPadOS: see ipad/tauri-plugin-ipad-files/ios/Sources/KeyCommands.swift).
 * The presentation layer owns this contract; an infrastructure adapter implements it and
 * the composition root provides it where needed (null elsewhere: the page gets the keys).
 */
export type KeyModifier = "command" | "shift" | "control" | "alternate";

export interface KeyCommand {
  /** Passed back when pressed. */
  readonly id: string;
  /**
   * The key: a character ("t", "[", "=", "1", " "), or "tab", "escape", "up", "down",
   * "pageup", "pagedown", "home", "end".
   */
  readonly input: string;
  readonly modifiers: readonly KeyModifier[];
  /** Shown in the system's list of shortcuts (iPadOS: hold ⌘); empty to leave it out. */
  readonly title: string;
  /**
   * Whether it comes before what the focused view does with the key (iPadOS keeps ⌘F, ⌘E,
   * … otherwise). False for keys a text field needs (arrows, Space, Escape): then it only
   * fires when nothing else took the key.
   */
  readonly priority: boolean;
}

export interface HardwareKeyCommands {
  /** Replace the registered commands. */
  set(commands: readonly KeyCommand[]): void;
  /** Call `listener` with a command's id each time it's pressed; returns an unsubscribe. */
  onPress(listener: (id: string) => void): () => void;
}
