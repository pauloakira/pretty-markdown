import { describe, expect, it } from "vitest";
import { FindController, findMatches } from "./FindController";

function mount(html: string): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = html;
  document.body.appendChild(root);
  return root;
}

describe("findMatches", () => {
  it("finds case-insensitive matches in prose", () => {
    const root = mount("<p>Alpha beta alpha BETA</p>");
    expect(findMatches(root, "alpha")).toHaveLength(2);
    expect(findMatches(root, "BETA")).toHaveLength(2);
  });

  it("returns nothing for an empty query", () => {
    const root = mount("<p>anything</p>");
    expect(findMatches(root, "")).toHaveLength(0);
  });

  it("skips rendered math", () => {
    const root = mount('<p>x marks</p><span class="pm-math" data-tex="x"><i>x</i></span>');
    // "x" appears in prose ("marks") and in math; only the prose hit counts.
    expect(findMatches(root, "x")).toHaveLength(1);
  });

  it("finds repeated overlapping-free matches within one node", () => {
    const root = mount("<p>aaaa</p>");
    expect(findMatches(root, "aa")).toHaveLength(2);
  });
});

describe("FindController", () => {
  it("reports count and starts at the first match", () => {
    const controller = new FindController(mount("<p>one two one three one</p>"));
    expect(controller.search("one")).toEqual({ count: 3, index: 0 });
  });

  it("cycles forward and backward with wraparound", () => {
    const controller = new FindController(mount("<p>a a a</p>"));
    controller.search("a");
    expect(controller.next().index).toBe(1);
    expect(controller.next().index).toBe(2);
    expect(controller.next().index).toBe(0); // wrap
    expect(controller.previous().index).toBe(2); // wrap back
  });

  it("clears to an empty state", () => {
    const controller = new FindController(mount("<p>find me</p>"));
    controller.search("find");
    expect(controller.clear()).toBeUndefined();
    // next() on a cleared controller stays empty
    expect(controller.next()).toEqual({ count: 0, index: -1 });
  });

  it("returns an empty state for no matches", () => {
    const controller = new FindController(mount("<p>nothing here</p>"));
    expect(controller.search("zzz")).toEqual({ count: 0, index: -1 });
  });
});
