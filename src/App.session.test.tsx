import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import type { TabManager } from "./application/services/TabManager";
import { createMarkdownDocument } from "./domain/entities/Document";
import { FILES, launch, makeContainer, quit, quitVia, settle, useAppHarness } from "./test/appHarness";
import { disk } from "./test/tauriMock";

/*
 * End-to-end check of "reopen tabs next time" for tab groups: the quit prompt must write
 * the latest groups, and the next launch must bring them back. The real session
 * repository runs against an in-memory stand-in for the session file.
 */

vi.mock("@tauri-apps/api/core", async () => (await import("./test/tauriMock")).tauriCore);
vi.mock("@tauri-apps/api/event", async () => (await import("./test/tauriMock")).tauriEvent);

useAppHarness();

/** Open the four markdown files and arrange: [Runge: skeleton, intro] [Quad (collapsed): method] loose. */
function arrange(manager: TabManager) {
  const paths = [
    "/papers/runge/docs/skeleton.md",
    "/papers/runge/docs/intro.md",
    "/papers/quad/docs/method.md",
    "/papers/loose.md",
  ];
  paths.forEach((path) => manager.openDocument(createMarkdownDocument(path, FILES[path])));
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

describe("quit prompt × tab groups", () => {
  it("'Reopen next time' saves the latest groups, and the next launch restores them", async () => {
    const first = makeContainer();
    await launch(first);
    const { runge } = await act(async () => arrange(first.tabManager));

    // Change a group right before quitting — inside the autosave debounce, so only the
    // quit prompt's own save can capture it.
    await act(async () => first.tabManager.renameGroup(runge, "Runge v2"));
    await quitVia(first, "Reopen next time");

    expect(first.appWindow.closed).toBe(1);
    const saved = JSON.parse(disk.session ?? "null");
    expect(saved.version).toBe(3);
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
    await quitVia(first, "Don't reopen");

    expect(first.appWindow.closed).toBe(1);
    expect(disk.session).toBeNull();
  });
});
