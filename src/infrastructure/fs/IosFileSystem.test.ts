import { describe, expect, it } from "vitest";
import { pathFromFileUrl } from "./IosFileSystem";

describe("pathFromFileUrl", () => {
  it("turns a picker file URL into a plain, decoded path", () => {
    expect(
      pathFromFileUrl(
        "file:///private/var/mobile/Library/Mobile%20Documents/com~apple~CloudDocs/Papers/Training%20Verifiers.pdf",
      ),
    ).toBe("/private/var/mobile/Library/Mobile Documents/com~apple~CloudDocs/Papers/Training Verifiers.pdf");
  });

  it("leaves plain paths alone", () => {
    expect(pathFromFileUrl("/Users/me/notes.md")).toBe("/Users/me/notes.md");
  });
});
