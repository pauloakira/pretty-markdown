import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { createPdfDocument } from "./domain/entities/Document";
import { toSession } from "./domain/entities/Workspace";
import { parseSession } from "./domain/values/Session";
import {
  button,
  launch,
  makeContainer,
  NOTES,
  settle,
  shortcut,
  useAppHarness,
  type TestContainer,
} from "./test/appHarness";

/*
 * The Notes panel (docs/RESEARCH_READER.md, R1): Read · Notes in a PDF's toolbar shows its
 * notes file beside the page. A quote's link jumps to its passage in the same tab (with
 * Back), and hovering a quote outlines its passage.
 */

vi.mock("@tauri-apps/api/core", async () => (await import("./test/tauriMock")).tauriCore);
vi.mock("@tauri-apps/api/event", async () => (await import("./test/tauriMock")).tauriEvent);

useAppHarness();

const PDF = "/papers/quad/paper.pdf";
const OTHER_PDF = "/papers/quad/other.pdf";
const NOTES_PATH = "/papers/quad/paper.notes.md";
const SEEDED = [
  "# Notes on paper",
  "## Quadrature",
  "> Gauss–Legendre nodes are the roots of P_n.\n> — [p. 4](paper.pdf#page=4&ex=abc123&color=blue&rect=72,600,300,612)",
  "Compare [the method](docs/method.md) and $x^2$.",
  "> From elsewhere.\n> — [p. 2](other.pdf#page=2&ex=def456&color=pink)",
].join("\n\n");

async function openPdf(app: TestContainer, path = PDF) {
  await act(async () => app.tabManager.openDocument(createPdfDocument(path)));
  await settle();
  return app.pdfViewer.mounts[app.pdfViewer.mounts.length - 1];
}

const panel = () => document.querySelector<HTMLElement>(".notes-panel");
const cards = () => [...document.querySelectorAll<HTMLElement>(".notes-panel .excerpt-card")];
const card0 = () => cards()[0];
/** A button in `root`, by its text or label. */
const within = (root: HTMLElement, label: string) => {
  const found = [...root.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === label || b.getAttribute("aria-label") === label,
  );
  if (!found) throw new Error(`no button "${label}"`);
  return found;
};
/** Type into the note field of `card` (replacing what's there). */
const type = async (card: HTMLElement, text: string) => {
  const field = card.querySelector("textarea");
  if (!field) throw new Error("no note field");
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(field, text);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
const activeTab = (app: TestContainer) => {
  const { tabs, activeTabId } = app.tabManager.getSnapshot();
  return tabs.find((t) => t.id === activeTabId);
};
const quoteLink = (text: string) => {
  const link = [...document.querySelectorAll<HTMLAnchorElement>(".notes-panel a")].find((a) =>
    a.textContent?.includes(text),
  );
  if (!link) throw new Error(`no link "${text}"`);
  return link;
};

describe("The Notes panel", () => {
  it("is closed until Notes is chosen, then shows the PDF's notes beside the page", async () => {
    NOTES.set(NOTES_PATH, SEEDED);
    const app = makeContainer();
    await launch(app);
    await openPdf(app);

    expect(panel()).toBeNull();
    expect(button("Read").getAttribute("aria-pressed")).toBe("true");

    await act(async () => button("Notes").click());
    await settle();

    expect(button("Notes").getAttribute("aria-pressed")).toBe("true");
    expect(panel()?.querySelector(".notes-panel__name")?.textContent).toBe("paper.notes.md");
    expect(panel()?.querySelectorAll("blockquote.excerpt")).toHaveLength(2);
    expect(panel()?.querySelector(".katex")).not.toBeNull(); // math renders as in the reader
    expect(panel()?.querySelector(".notes-panel__footer")?.textContent).toContain("2 quotes");

    await act(async () => button("Read").click());
    expect(panel()).toBeNull();
  });

  it("toggles with ⇧⌘N, and remembers it (and its width) per tab, in the session too", async () => {
    NOTES.set(NOTES_PATH, SEEDED);
    const app = makeContainer();
    await launch(app);
    await openPdf(app);
    await act(async () => shortcut("KeyN", { shift: true }));
    await settle();
    expect(panel()).not.toBeNull();
    const first = activeTab(app);
    if (!first) throw new Error("no tab");
    await act(async () => app.tabManager.setNotesPanel(first.id, { open: true, widthPx: 520 }));
    expect(panel()?.style.width).toBe("520px");

    await openPdf(app, OTHER_PDF);
    expect(panel()).toBeNull(); // the other PDF's panel is its own

    await act(async () => app.tabManager.activateTab(first.id));
    await settle();
    expect(panel()?.style.width).toBe("520px");

    const session = parseSession(JSON.parse(JSON.stringify(toSession(app.tabManager.getSnapshot()))));
    expect(session?.tabs.map((t) => t.notes)).toEqual([{ open: true, widthPx: 520 }, undefined]);

    await act(async () => shortcut("KeyN", { shift: true }));
    expect(panel()).toBeNull();
  });

  it("says how notes start when there are none yet", async () => {
    const app = makeContainer();
    await launch(app);
    await openPdf(app);
    await act(async () => button("Notes").click());
    await settle();

    expect(panel()?.textContent).toContain("No notes yet");
    expect(panel()?.querySelector(".notes-panel__open")).toBeNull();
  });

  it("shows a quote as soon as it's added, marked, with its note open", async () => {
    const app = makeContainer();
    await launch(app);
    const viewer = await openPdf(app);
    await act(async () => button("Notes").click());
    await settle();

    viewer.selection = { page: 3, text: "Fresh from the page." };
    await act(async () => button("Add to notes").click());
    await settle();

    const card = card0();
    expect(card?.querySelector("blockquote.excerpt p")?.textContent).toBe("Fresh from the page.");
    expect(card?.classList.contains("excerpt-card--new")).toBe(true);
    expect(document.activeElement).toBe(card?.querySelector("textarea"));
    expect(panel()?.querySelector(".notes-panel__footer")?.textContent).toContain("1 quote ");
  });

  it("a note is written in place, under its quote in the file, and edited the same way", async () => {
    NOTES.set(NOTES_PATH, SEEDED);
    const app = makeContainer();
    await launch(app);
    await openPdf(app);
    await act(async () => button("Notes").click());
    await settle();

    // The second quote has no note yet.
    const second = cards()[1];
    await act(async () => within(second, "Add a note").click());
    await type(second, "Check this, $y$.");
    await act(async () => second.querySelector("textarea")?.blur());
    await settle();

    expect(NOTES.get(NOTES_PATH)).toContain("color=pink)\n\nCheck this, $y$.\n");
    expect(cards()[1].querySelector(".excerpt-card__note-text .katex")).not.toBeNull();

    // The first quote's note (typed under it in the file) shows in its card; clicking it edits.
    const first = cards()[0];
    expect(first.querySelector(".excerpt-card__note-text")?.textContent).toContain("Compare the method and");
    await act(async () => first.querySelector<HTMLElement>(".excerpt-card__note-text p")?.click());
    const field = first.querySelector("textarea");
    expect(field?.value).toBe("Compare [the method](docs/method.md) and $x^2$.");
    await type(first, "");
    await act(async () => field?.blur());
    await settle();
    expect(NOTES.get(NOTES_PATH)).not.toContain("Compare");
    expect(within(cards()[0], "Add a note")).toBeDefined();
  });

  it("Delete takes the quote and its note out, then its highlight; Undo brings them back", async () => {
    NOTES.set(NOTES_PATH, SEEDED);
    const app = makeContainer();
    await launch(app);
    const viewer = await openPdf(app);
    viewer.places.push({ page: 4, rect: [72, 600, 300, 612] }); // the first quote's highlight
    await act(async () => button("Notes").click());
    await settle();

    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      await act(async () => within(cards()[0], "Delete").click());
      await settle();
      expect(NOTES.get(NOTES_PATH)).not.toContain("Gauss");
      expect(NOTES.get(NOTES_PATH)).not.toContain("Compare");
      expect(cards()).toHaveLength(1);
      expect(viewer.places).toHaveLength(1); // kept while Undo is offered

      await act(async () => within(panel() as HTMLElement, "Undo").click());
      await settle();
      expect(NOTES.get(NOTES_PATH)).toBe(SEEDED);
      expect(cards()).toHaveLength(2);

      await act(async () => within(cards()[0], "Delete").click());
      await settle();
      await act(async () => vi.advanceTimersByTime(6500));
      expect(viewer.places).toHaveLength(0); // gone once Undo is
      expect(panel()?.querySelector(".notes-panel__toast")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("Colour recolours the quote and its highlight", async () => {
    NOTES.set(NOTES_PATH, SEEDED);
    const app = makeContainer();
    await launch(app);
    const viewer = await openPdf(app);
    viewer.places.push({ page: 4, rect: [72, 600, 300, 612] });
    await act(async () => button("Notes").click());
    await settle();

    await act(async () => within(cards()[0], "Colour").click());
    await act(async () => within(cards()[0], "Green").click());
    await settle();

    expect(NOTES.get(NOTES_PATH)).toContain("ex=abc123&color=green&rect=");
    expect(cards()[0].querySelector("blockquote.excerpt--green")).not.toBeNull();
    expect(viewer.recoloured).toEqual([{ place: { page: 4, rect: [72, 600, 300, 612] }, color: "green" }]);
  });

  it("Copy copies the quote as Markdown", async () => {
    const writeText = vi.fn(async (_text: string) => {});
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    try {
      NOTES.set(NOTES_PATH, SEEDED);
      const app = makeContainer();
      await launch(app);
      await openPdf(app);
      await act(async () => button("Notes").click());
      await settle();

      await act(async () => within(cards()[0], "Copy").click());
      await settle();
      expect(writeText).toHaveBeenCalledWith("> Gauss–Legendre nodes are the roots of P\\_n.\n> — [p. 4](paper.pdf#page=4)");
      expect(within(cards()[0], "Copied")).toBeDefined();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("a quote's link jumps to its passage in this tab, and Back returns", async () => {
    NOTES.set(NOTES_PATH, SEEDED);
    const app = makeContainer();
    await launch(app);
    const viewer = await openPdf(app);
    await act(async () => viewer.moveTo({ ...viewer.current, page: 9, pageOffset: 0 }));
    await act(async () => button("Notes").click());
    await settle();

    await act(async () => quoteLink("p. 4").click());
    await settle();

    expect(app.tabManager.getSnapshot().tabs).toHaveLength(1);
    expect(app.pdfViewer.mounts).toHaveLength(1); // the same viewer, not a reopened tab
    expect(viewer.revealed).toEqual([{ page: 4, rect: [72, 600, 300, 612] }]);
    expect(document.querySelector(".back-pill")?.textContent).toContain("Back to p. 9");
    await act(async () => shortcut("BracketLeft"));
    expect(viewer.current.page).toBe(9);
  });

  it("other links open from the notes file's folder", async () => {
    NOTES.set(NOTES_PATH, SEEDED);
    const app = makeContainer();
    await launch(app);
    await openPdf(app);
    await act(async () => button("Notes").click());
    await settle();

    await act(async () => quoteLink("the method").click());
    await settle();
    expect(activeTab(app)?.document.path).toBe("/papers/quad/docs/method.md");
  });

  it("hovering a quote outlines its passage on the page; leaving clears it", async () => {
    NOTES.set(NOTES_PATH, SEEDED);
    const app = makeContainer();
    await launch(app);
    const viewer = await openPdf(app);
    await act(async () => button("Notes").click());
    await settle();

    const [ours, theirs] = [...(panel()?.querySelectorAll<HTMLElement>("blockquote.excerpt") ?? [])];
    ours.querySelector("p")?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    expect(viewer.marked).toEqual({ page: 4, rect: [72, 600, 300, 612] });
    // A quote from another document has nothing to outline here.
    theirs.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    expect(viewer.marked).toBeNull();
    ours.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    panel()?.querySelector("article")?.dispatchEvent(new MouseEvent("mouseleave"));
    expect(viewer.marked).toBeNull();
  });

  it("Open as tab opens the notes file to write in", async () => {
    NOTES.set(NOTES_PATH, SEEDED);
    const app = makeContainer();
    await launch(app);
    await openPdf(app);
    await act(async () => button("Notes").click());
    await settle();

    await act(async () => button("Open as tab ↗").click());
    await settle();
    expect(activeTab(app)?.document.path).toBe(NOTES_PATH);
  });
});
