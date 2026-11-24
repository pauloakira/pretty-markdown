import { invoke } from "@tauri-apps/api/core";
import type { HardwareKeyCommands, KeyCommand } from "../../presentation/keyboard/HardwareKeyCommands";

/**
 * iPadOS key commands through the ipad-files plugin (`set_key_commands`). A press comes
 * back as a `native-key-command` window event carrying the command's id.
 */
export class TauriKeyCommands implements HardwareKeyCommands {
  set(commands: readonly KeyCommand[]): void {
    const list = commands.map(({ id, input, modifiers, title, priority }) => ({ id, input, modifiers, title, priority }));
    void invoke("set_key_commands", { commands: list }).catch((error: unknown) => {
      console.error("Couldn't register the keyboard shortcuts:", error);
    });
  }

  onPress(listener: (id: string) => void): () => void {
    const onEvent = (event: Event) => {
      const id = (event as CustomEvent<unknown>).detail;
      if (typeof id === "string") listener(id);
    };
    window.addEventListener("native-key-command", onEvent);
    return () => window.removeEventListener("native-key-command", onEvent);
  }
}
