import { describe, expect, it } from "vitest";
import { addRecent, recentKey, recentLocation, removeRecent, tidyRecents } from "./RecentFile";

const f = (path: string) => ({ path, name: path.split("/").pop() ?? path });

describe("addRecent", () => {
  it("prepends the newest file", () => {
    const list = addRecent([f("/a.md")], f("/b.md"));
    expect(list.map((x) => x.path)).toEqual(["/b.md", "/a.md"]);
  });

  it("de-duplicates by path, moving an existing file to the front", () => {
    const list = addRecent([f("/a.md"), f("/b.md")], f("/b.md"));
    expect(list.map((x) => x.path)).toEqual(["/b.md", "/a.md"]);
  });

  it("caps the list length", () => {
    const list = addRecent([f("/a"), f("/b"), f("/c")], f("/d"), 3);
    expect(list.map((x) => x.path)).toEqual(["/d", "/a", "/b"]);
  });
});

const SIM_GROUP =
  "/Users/me/Library/Developer/CoreSimulator/Devices/81F7/data/Containers/Shared/AppGroup/B8FB";
const IPAD_GROUP = "/private/var/mobile/Containers/Shared/AppGroup/B8FB";
const APP = "/private/var/mobile/Containers/Data/Application/5A1E";

describe("one entry per file", () => {
  it("treats a file:// URL and its path as the same file", () => {
    const url = "file:///private/var/mobile/Docs/VEM%20paper.pdf";
    const list = addRecent([f(url)], f("/private/var/mobile/Docs/VEM paper.pdf"));
    expect(list.map((x) => x.path)).toEqual(["/private/var/mobile/Docs/VEM paper.pdf"]);
  });

  it("treats /private/var and /var as the same folder", () => {
    expect(recentKey("/private/var/mobile/a.pdf")).toBe(recentKey("/var/mobile/a.pdf"));
    expect(recentKey("/private/tmp/a.md")).toBe("/private/tmp/a.md");
  });

  it("tidies a stored list: the newest of each file, in order", () => {
    const stored = [f("/var/a.md"), f("/b.md"), f("file:///private/var/a.md"), f("/c.md")];
    expect(tidyRecents(stored).map((x) => x.path)).toEqual(["/var/a.md", "/b.md", "/c.md"]);
  });

  it("stores plain paths, not file:// URLs (the path is the document's identity)", () => {
    const stored = [{ path: "file:///Papers/VEM%20paper.pdf", name: "VEM paper.pdf" }];
    expect(tidyRecents(stored)).toEqual([{ path: "/Papers/VEM paper.pdf", name: "VEM paper.pdf" }]);
  });

  it("forgets a file whichever way it was written", () => {
    const list = [f("file:///private/var/a.md"), f("/b.md")];
    expect(removeRecent(list, "/var/a.md").map((x) => x.path)).toEqual(["/b.md"]);
  });
});

describe("recentLocation", () => {
  it.each([
    [
      "/private/var/mobile/Library/Mobile Documents/com~apple~CloudDocs/Papers/VEM.pdf",
      "iCloud Drive › Papers",
    ],
    ["/Users/me/Library/Mobile Documents/com~apple~CloudDocs/a.md", "iCloud Drive"],
    [
      "/private/var/mobile/Library/Mobile Documents/iCloud~md~obsidian/Documents/Vault/a.md",
      "iCloud Drive › Vault",
    ],
    [`${IPAD_GROUP}/File Provider Storage/Papers/VEM paper.pdf`, "On My iPad › Papers"],
    [`file://${SIM_GROUP}/File%20Provider%20Storage/Papers/Note.md`, "On My iPad › Papers"],
    [`${APP}/Documents/Shared/a.md`, "On My iPad › pretty-markdown › Shared"],
    [`${APP}/Documents/Inbox/a.pdf`, "Temporary copy"],
    [`${APP}/tmp/com.prettymarkdown.app-Inbox/a.pdf`, "Temporary copy"],
    ["/Users/me/Documents/papers/a.md", "~/Documents/papers"],
    ["/Users/me/a.md", "~"],
    ["/Volumes/Work/a.md", "/Volumes/Work"],
  ])("%s → %s", (path, location) => {
    expect(recentLocation(path)).toBe(location);
  });
});
