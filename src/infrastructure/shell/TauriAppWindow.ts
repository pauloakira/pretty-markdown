import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { AppWindow } from "../../domain/ports/AppWindow";

/**
 * Tauri-backed shell control. There are two ways to quit, and both must reach the prompt:
 *
 * - the window's close button → the window's close-requested event (suppressed here);
 * - ⌘Q, the app menu's Quit, Dock → Quit → app termination, which never fires the window
 *   event. The Rust side holds that exit back and emits `quit-requested` instead.
 *
 * `close()` goes through the `exit_app` command, which opens the native exit gate so the
 * resulting exit request isn't intercepted again.
 */
export class TauriAppWindow implements AppWindow {
  async onCloseRequested(handler: () => void): Promise<() => void> {
    const unlistenWindow = await getCurrentWindow().onCloseRequested((event) => {
      event.preventDefault();
      handler();
    });
    const unlistenQuit = await listen("quit-requested", () => handler());
    return () => {
      unlistenWindow();
      unlistenQuit();
    };
  }

  async close(): Promise<void> {
    await invoke("exit_app");
  }
}
