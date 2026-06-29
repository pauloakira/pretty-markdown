import { getCurrentWindow } from "@tauri-apps/api/window";
import type { AppWindow } from "../../domain/ports/AppWindow";

/** Tauri-backed window control: intercept the close request and destroy on demand. */
export class TauriAppWindow implements AppWindow {
  async onCloseRequested(handler: () => void): Promise<() => void> {
    const win = getCurrentWindow();
    return win.onCloseRequested((event) => {
      event.preventDefault();
      handler();
    });
  }

  async close(): Promise<void> {
    await getCurrentWindow().destroy();
  }
}
