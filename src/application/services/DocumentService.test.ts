import { describe, expect, it } from "vitest";
import type { FilePicker, FileReader } from "../../domain/ports/FileSystem";
import { err, ok, type Result } from "../../domain/values/Result";
import { DocumentService } from "./DocumentService";

class FakePicker implements FilePicker {
  constructor(private readonly path: string | null) {}
  async pickMarkdownFile(): Promise<string | null> {
    return this.path;
  }
}

class FakeReader implements FileReader {
  constructor(private readonly result: Result<string>) {}
  async readTextFile(): Promise<Result<string>> {
    return this.result;
  }
}

describe("DocumentService", () => {
  it("opens a picked file into a Document", async () => {
    const service = new DocumentService(
      new FakePicker("/docs/paper.md"),
      new FakeReader(ok("# Paper\n$x^2$")),
    );
    const outcome = await service.open();
    expect(outcome.kind).toBe("opened");
    if (outcome.kind === "opened") {
      expect(outcome.document.name).toBe("paper.md");
      expect(outcome.document.content).toContain("x^2");
    }
  });

  it("reports cancellation when no file is picked", async () => {
    const service = new DocumentService(
      new FakePicker(null),
      new FakeReader(ok("unused")),
    );
    expect((await service.open()).kind).toBe("cancelled");
  });

  it("surfaces read failures as an error outcome", async () => {
    const service = new DocumentService(
      new FakePicker("/docs/missing.md"),
      new FakeReader(err("file not found")),
    );
    const outcome = await service.open();
    expect(outcome.kind).toBe("error");
    if (outcome.kind === "error") expect(outcome.message).toBe("file not found");
  });
});
