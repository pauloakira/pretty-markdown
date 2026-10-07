import { openUrl } from "@tauri-apps/plugin-opener";
import type { LinkOpener } from "../../domain/ports/LinkOpener";

/** Opens links with the system's default handler via the opener plugin (`opener:default`). */
export class TauriLinkOpener implements LinkOpener {
  async openExternal(url: string): Promise<void> {
    await openUrl(url);
  }
}
