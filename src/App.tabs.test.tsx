import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { createMarkdownDocument } from "./domain/entities/Document";
import { FILES, launch, makeContainer, settle, useAppHarness, type TestContainer } from "./test/appHarness";

/*
 * The tab bar by touch (iPad): no right-click, and a swipe scrolls the strip. Tap opens a
 * tab, hold opens its menu (a group chip: its editor), hold-and-drag moves it.
 */

vi.mock("@tauri-apps/api/core", async () => (await import("./test/tauriMock")).tauriCore);
vi.mock("@tauri-apps/api/event", async () => (await import("./test/tauriMock")).tauriEvent);

useAppHarness();

const PATHS = ["/papers/runge/docs/skeleton.md", "/papers/runge/docs/intro.md", "/papers/quad/docs/method.md"];

async function openTabs(app: TestContainer) {
  for (const path of PATHS) {
    await act(async () => app.tabManager.openDocument(createMarkdownDocument(path, FILES[path])));
  }
  await settle();
}

const tabEl = (name: string) =>
  Array.from(document.querySelectorAll<HTMLElement>("[data-tab-id]")).find((el) => el.textContent?.includes(name))!;

/** jsdom has no PointerEvent: a MouseEvent with the pointer fields React reads. */
class TouchPointerEvent extends MouseEvent {
  readonly pointerId: number;
  readonly pointerType = "touch";
  constructor(type: string, init: MouseEventInit & { pointerId: number }) {
    super(type, init);
    this.pointerId = init.pointerId;
  }
}

function touch(el: Element, type: string, x = 10, y = 10, pointerId = 7) {
  el.dispatchEvent(new TouchPointerEvent(type, { bubbles: true, cancelable: true, pointerId, clientX: x, clientY: y, button: 0 }));
}

const wait = (ms: number) => act(() => new Promise<void>((resolve) => setTimeout(resolve, ms)));
const activeName = (app: TestContainer) => {
  const { tabs, activeTabId } = app.tabManager.getSnapshot();
  return tabs.find((t) => t.id === activeTabId)?.document.name;
};

describe("tab bar by touch", () => {
  it("a tap opens the tab; pressing alone doesn't (it may be a swipe)", async () => {
    const app = makeContainer();
    await launch(app);
    await openTabs(app);
    expect(activeName(app)).toBe("method.md");

    await act(async () => touch(tabEl("intro.md"), "pointerdown"));
    expect(activeName(app)).toBe("method.md");
    await act(async () => touch(tabEl("intro.md"), "pointerup"));
    expect(activeName(app)).toBe("intro.md");
  });

  it("a swipe neither opens the tab nor its menu", async () => {
    const app = makeContainer();
    await launch(app);
    await openTabs(app);
    await act(async () => {
      touch(tabEl("intro.md"), "pointerdown", 10, 10);
      touch(tabEl("intro.md"), "pointermove", 40, 10);
    });
    await wait(500);
    await act(async () => touch(tabEl("intro.md"), "pointercancel", 40, 10)); // the strip scrolled
    expect(document.querySelector(".popmenu")).toBeNull();
    expect(activeName(app)).toBe("method.md");
  });

  it("holding a tab opens its menu, which offers grouping", async () => {
    const app = makeContainer();
    await launch(app);
    await openTabs(app);
    await act(async () => touch(tabEl("intro.md"), "pointerdown"));
    await wait(500);
    await act(async () => touch(tabEl("intro.md"), "pointerup"));

    const menu = document.querySelector(".popmenu");
    expect(menu).not.toBeNull();
    expect(menu?.textContent).toContain("Group tabs by folder");
    expect(activeName(app)).toBe("method.md"); // a hold isn't a tap

    // Group by folder from the menu: runge's two notes form a group (quad has just one).
    const byFolder = Array.from(menu!.querySelectorAll("button")).find((b) => b.textContent?.includes("Group tabs by folder"))!;
    await act(async () => byFolder.click());
    expect(app.tabManager.getSnapshot().groups).toHaveLength(1);
  });

  it("dragging after the hold closes the menu (it becomes a move)", async () => {
    const app = makeContainer();
    await launch(app);
    await openTabs(app);
    await act(async () => touch(tabEl("intro.md"), "pointerdown", 10, 10));
    await wait(500);
    expect(document.querySelector(".popmenu")).not.toBeNull();
    await act(async () => touch(tabEl("intro.md"), "pointermove", 60, 10));
    expect(document.querySelector(".popmenu")).toBeNull();
    expect(document.querySelector(".tab--dragging")).not.toBeNull();
    await act(async () => touch(tabEl("intro.md"), "pointerup", 60, 10));
  });

  it("holding a group's chip opens its editor; tapping it collapses the group", async () => {
    const app = makeContainer();
    await launch(app);
    await openTabs(app);
    await act(async () => app.tabManager.groupByFolder());
    await settle();
    const chip = () => document.querySelector<HTMLButtonElement>(".tabgroup__chip")!;

    await act(async () => touch(chip(), "pointerdown"));
    await wait(500);
    await act(async () => touch(chip(), "pointerup"));
    expect(document.querySelector('[aria-label="Edit tab group"]')).not.toBeNull();
    await act(async () => chip().click()); // the click a hold may produce is ignored
    expect(app.tabManager.getSnapshot().groups.some((g) => g.collapsed)).toBe(false);

    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    await act(async () => {
      touch(chip(), "pointerdown");
      touch(chip(), "pointerup");
      chip().click();
    });
    expect(app.tabManager.getSnapshot().groups.some((g) => g.collapsed)).toBe(true);
  });
});
