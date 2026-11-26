import { describe, expect, it } from "vitest";
import { folderHolds, folderNameOf, isNoAccess, NO_ACCESS } from "./FileAccess";

describe("FileAccess", () => {
  it("recognises the native side's no-access message, however it's prefixed", () => {
    expect(isNoAccess(`Couldn't read your notes: 'a.notes.md' ${NO_ACCESS}`)).toBe(true);
    expect(isNoAccess("Failed to read 'a.md': Operation not permitted (os error 1)")).toBe(false);
  });

  it("tells whether a folder holds a file, at any depth, /var and /private/var alike", () => {
    const notes = "/private/var/mobile/Library/Mobile Documents/com~apple~CloudDocs/USP/Articles/ops/a.notes.md";
    expect(folderHolds("/private/var/mobile/Library/Mobile Documents/com~apple~CloudDocs/USP/Articles/ops", notes)).toBe(true);
    expect(folderHolds("/var/mobile/Library/Mobile Documents/com~apple~CloudDocs/USP/", notes)).toBe(true);
    expect(folderHolds("/var/mobile/Library/Mobile Documents/com~apple~CloudDocs/USP/Art", notes)).toBe(false);
    expect(folderHolds("/var/mobile/Library/Mobile Documents/com~apple~CloudDocs/Other", notes)).toBe(false);
  });

  it("names the folder a file is in", () => {
    expect(folderNameOf("/a/_neuralOperators/DeepONet.pdf")).toBe("_neuralOperators");
    expect(folderNameOf("/DeepONet.pdf")).toBe("");
  });
});
