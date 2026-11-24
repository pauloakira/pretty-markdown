import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import type { RecentFile } from "./domain/values/RecentFile";
import { button, launch, makeContainer, settle, useAppHarness } from "./test/appHarness";

/* The Recent list on the welcome screen: readable locations, one entry per file, and no
 * entries for files that are gone. */

vi.mock("@tauri-apps/api/core", async () => (await import("./test/tauriMock")).tauriCore);
vi.mock("@tauri-apps/api/event", async () => (await import("./test/tauriMock")).tauriEvent);

useAppHarness();

function withRecents(stored: RecentFile[]) {
  const saved: RecentFile[][] = [];
  const app = makeContainer();
  const container = {
    ...app,
    recentFilesRepository: { load: () => stored, save: (list: readonly RecentFile[]) => void saved.push([...list]) },
  };
  return { container, saved };
}

const items = () =>
  Array.from(document.querySelectorAll(".welcome__recent-item")).map((item) => ({
    name: item.querySelector(".welcome__recent-name")?.textContent,
    location: item.querySelector(".welcome__recent-path")?.textContent?.replace(/‎/g, ""),
  }));

describe("the Recent list", () => {
  it("shows where each file is, once per file", async () => {
    const { container } = withRecents([
      { path: "/papers/loose.md", name: "loose.md" },
      { path: "file:///papers/loose.md", name: "loose.md" },
      { path: "/Users/me/Documents/a.md", name: "a.md" },
    ]);
    await launch(container);

    expect(items()).toEqual([
      { name: "loose.md", location: "/papers" },
      { name: "a.md", location: "~/Documents" },
    ]);
  });

  it("drops a file that isn't there any more, and says so", async () => {
    const { container, saved } = withRecents([
      { path: "/papers/deleted.md", name: "deleted.md" },
      { path: "/papers/loose.md", name: "loose.md" },
    ]);
    await launch(container);

    const deleted = document.querySelector<HTMLButtonElement>('[title="/papers/deleted.md"]');
    await act(async () => deleted?.click());
    await settle();

    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      "'deleted.md' isn't there any more. It may have been moved, renamed or deleted.",
    );
    expect(items().map((i) => i.name)).toEqual(["loose.md"]);
    expect(saved.at(-1)?.map((f) => f.path)).toEqual(["/papers/loose.md"]);
  });

  it("opens an entry saved as a file:// URL under its plain path", async () => {
    const { container } = withRecents([
      { path: "file:///papers/quad/paper.pdf", name: "paper.pdf" },
    ]);
    await launch(container);

    expect(document.querySelector('[title="/papers/quad/paper.pdf"]')).not.toBeNull();
    await act(async () => document.querySelector<HTMLButtonElement>(".welcome__recent-item")?.click());
    await settle();
    expect(container.tabManager.getSnapshot().tabs.map((t) => t.document.path)).toEqual([
      "/papers/quad/paper.pdf",
    ]);
  });

  it("can be cleared", async () => {
    const { container, saved } = withRecents([{ path: "/papers/loose.md", name: "loose.md" }]);
    await launch(container);

    await act(async () => button("Clear").click());
    expect(document.querySelector(".welcome__recent")).toBeNull();
    expect(saved.at(-1)).toEqual([]);
  });
});
