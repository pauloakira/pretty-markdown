import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { DocumentService } from "./application/services/DocumentService";
import { SessionService } from "./application/services/SessionService";
import { TabManager } from "./application/services/TabManager";
import type { Container } from "./composition/container";
import { ContainerProvider } from "./composition/ContainerContext";
import { createDocument } from "./domain/entities/Document";
import type { AppWindow } from "./domain/ports/AppWindow";
import type { FilePicker, FileReader, FileWriter } from "./domain/ports/FileSystem";
import { err, ok } from "./domain/values/Result";
import { MarkdownPipeline } from "./infrastructure/markdown/MarkdownPipeline";
import { CompositeMathRenderer } from "./infrastructure/math/CompositeMathRenderer";
import { KatexRenderer } from "./infrastructure/math/KatexRenderer";
import { TauriSessionRepository } from "./infrastructure/persistence/TauriSessionRepository";

/*
 * End-to-end check of "reopen tabs next time" for tab groups: the quit prompt must write
 * the latest groups, and the next launch must bring them back. The real session
 * repository runs against an in-memory stand-in for the session file.
 */

const disk: { session: string | null } = { session: null };

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string, args?: { contents?: string }) => {
    if (cmd === "read_session") return disk.session;
    if (cmd === "write_session") disk.session = args?.contents ?? null;
    if (cmd === "clear_session") disk.session = null;
    if (cmd === "take_pending_files") return [];
    return undefined;
  }),
}));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => () => {}) }));

const FILES: Record<string, string> = {
  "/papers/runge/docs/skeleton.md": "# Skeleton",
  "/papers/runge/docs/intro.md": "# Intro",
  "/papers/quad/docs/method.md": "# Method",
  "/papers/loose.md": "# Loose",
};

class FakeAppWindow implements AppWindow {
  handler: (() => void) | null = null;
  closed = 0;
  async onCloseRequested(handler: () => void) {
    this.handler = handler;
    return () => {};
  }
  async close() {
    this.closed += 1;
  }
}

function makeContainer(): Container & { appWindow: FakeAppWindow } {
  const reader: FileReader = {
    async readTextFile(path) {
      return path in FILES ? ok(FILES[path]) : err("missing");
    },
  };
  const picker: FilePicker = {
    async pickMarkdownFile() {
      return null;
    },
    async pickSavePath() {
      return null;
    },
  };
  const writer: FileWriter = {
    async writeTextFile() {
      return ok(undefined);
    },
  };
  const documentService = new DocumentService(picker, reader, writer);
  return {
    documentService,
    pipeline: new MarkdownPipeline(new CompositeMathRenderer([new KatexRenderer()]), {}),
    tabManager: new TabManager(),
    settingsRepository: { load: () => null, save: () => {} },
    recentFilesRepository: { load: () => [], save: () => {} },
    sessionService: new SessionService(new TauriSessionRepository(), documentService),
    appWindow: new FakeAppWindow(),
    documentExporter: { exportPdf: async () => {} },
  };
}

/** Let pending promises (restore, autosave) run. */
async function settle() {
  for (let i = 0; i < 5; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

let root: Root | null = null;
let host: HTMLElement | null = null;

async function launch(container: Container) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(
      <ContainerProvider container={container}>
        <App />
      </ContainerProvider>,
    );
  });
  await settle();
}

async function quit() {
  await act(async () => {
    root?.unmount();
  });
  host?.remove();
  root = null;
  host = null;
}

function button(label: string): HTMLButtonElement {
  const found = Array.from(document.querySelectorAll("button")).find((b) => b.textContent === label);
  if (!found) throw new Error(`no button "${label}"`);
  return found;
}

/** Open the four files and arrange: [Runge: skeleton, intro] [Quad (collapsed): method] loose. */
function arrange(manager: TabManager) {
  Object.keys(FILES).forEach((path) => manager.openDocument(createDocument(path, FILES[path])));
  const [skeleton, intro, method, loose] = manager.getSnapshot().tabs;
  const runge = manager.createGroup(skeleton.id) as string;
  manager.addToGroup(intro.id, runge);
  manager.renameGroup(runge, "Runge");
  const quad = manager.createGroup(method.id) as string;
  manager.renameGroup(quad, "Quad");
  manager.recolorGroup(quad, "orange");
  manager.activateTab(loose.id);
  manager.toggleGroupCollapsed(quad);
  return { runge, quad };
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  disk.session = null;
});

afterEach(async () => {
  await quit();
});

describe("quit prompt × tab groups", () => {
  it("'Reopen next time' saves the latest groups, and the next launch restores them", async () => {
    const first = makeContainer();
    await launch(first);
    const { runge } = await act(async () => arrange(first.tabManager));

    // Change a group right before quitting — inside the autosave debounce, so only the
    // quit prompt's own save can capture it.
    await act(async () => first.tabManager.renameGroup(runge, "Runge v2"));
    await act(async () => first.appWindow.handler?.());
    await act(async () => button("Reopen next time").click());
    await settle();

    expect(first.appWindow.closed).toBe(1);
    const saved = JSON.parse(disk.session ?? "null");
    expect(saved.version).toBe(2);
    expect(saved.groups).toEqual([
      { name: "Runge v2", color: "blue", collapsed: false },
      { name: "Quad", color: "orange", collapsed: true },
    ]);
    expect(saved.tabs.map((t: { group: number | null }) => t.group)).toEqual([0, 0, 1, null]);
    await quit();

    // Next launch.
    const second = makeContainer();
    await launch(second);
    const ws = second.tabManager.getSnapshot();
    expect(ws.groups.map((g) => [g.name, g.color, g.collapsed])).toEqual([
      ["Runge v2", "blue", false],
      ["Quad", "orange", true],
    ]);
    const byPath = (p: string) => ws.tabs.find((t) => t.document.path === p);
    expect(byPath("/papers/runge/docs/intro.md")?.groupId).toBe(ws.groups[0].id);
    expect(byPath("/papers/quad/docs/method.md")?.groupId).toBe(ws.groups[1].id);
    expect(byPath("/papers/loose.md")?.groupId).toBeNull();
    expect(ws.activeTabId).toBe(byPath("/papers/loose.md")?.id);

    // And the tab bar shows it: Quad folded to a chip with a count, Runge's tabs visible.
    const chips = Array.from(document.querySelectorAll(".tabgroup__chip")).map((c) => c.textContent);
    expect(chips).toEqual(["Runge v2", "Quad1"]);
    expect(document.querySelectorAll(".tab")).toHaveLength(3);
  });

  it("'Don't reopen' forgets the session, groups included", async () => {
    const first = makeContainer();
    await launch(first);
    await act(async () => arrange(first.tabManager));
    await settle();
    await act(async () => first.appWindow.handler?.());
    await act(async () => button("Don't reopen").click());
    await settle();

    expect(first.appWindow.closed).toBe(1);
    expect(disk.session).toBeNull();
  });
});
