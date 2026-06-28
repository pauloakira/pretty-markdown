import { describe, expect, it } from "vitest";
import type {
  FilePicker,
  FileReader,
  FileWriter,
} from "../../domain/ports/FileSystem";
import { err, ok, type Result } from "../../domain/values/Result";
import { DocumentService } from "./DocumentService";

class FakePicker implements FilePicker {
  constructor(
    private readonly openPath: string | null,
    private readonly savePath: string | null = null,
  ) {}
  async pickMarkdownFile(): Promise<string | null> {
    return this.openPath;
  }
  async pickSavePath(): Promise<string | null> {
    return this.savePath;
  }
}

class FakeReader implements FileReader {
  constructor(private readonly result: Result<string>) {}
  async readTextFile(): Promise<Result<string>> {
    return this.result;
  }
}

class FakeWriter implements FileWriter {
  public written: { path: string; contents: string } | null = null;
  constructor(private readonly result: Result<void> = ok(undefined)) {}
  async writeTextFile(path: string, contents: string): Promise<Result<void>> {
    if (this.result.ok) this.written = { path, contents };
    return this.result;
  }
}

const reader = (r: Result<string>) => new FakeReader(r);

describe("DocumentService — open", () => {
  it("opens a picked file into a Document", async () => {
    const service = new DocumentService(
      new FakePicker("/docs/paper.md"),
      reader(ok("# Paper\n$x^2$")),
      new FakeWriter(),
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
      reader(ok("unused")),
      new FakeWriter(),
    );
    expect((await service.open()).kind).toBe("cancelled");
  });

  it("surfaces read failures as an error outcome", async () => {
    const service = new DocumentService(
      new FakePicker("/docs/missing.md"),
      reader(err("file not found")),
      new FakeWriter(),
    );
    const outcome = await service.open();
    expect(outcome.kind).toBe("error");
    if (outcome.kind === "error") expect(outcome.message).toBe("file not found");
  });
});

describe("DocumentService — save", () => {
  it("writes to the existing path and reports the saved name", async () => {
    const writer = new FakeWriter();
    const service = new DocumentService(new FakePicker(null), reader(ok("")), writer);
    const outcome = await service.save("# hello", "/docs/note.md");
    expect(outcome).toEqual({ kind: "saved", path: "/docs/note.md", name: "note.md" });
    expect(writer.written).toEqual({ path: "/docs/note.md", contents: "# hello" });
  });

  it("prompts for a path when there is none (save-as)", async () => {
    const writer = new FakeWriter();
    const service = new DocumentService(
      new FakePicker(null, "/docs/new.md"),
      reader(ok("")),
      writer,
    );
    const outcome = await service.save("body", null);
    expect(outcome.kind).toBe("saved");
    if (outcome.kind === "saved") expect(outcome.path).toBe("/docs/new.md");
  });

  it("reports cancellation when the save dialog is dismissed", async () => {
    const service = new DocumentService(
      new FakePicker(null, null),
      reader(ok("")),
      new FakeWriter(),
    );
    expect((await service.save("body", null)).kind).toBe("cancelled");
  });

  it("surfaces write failures as an error outcome", async () => {
    const service = new DocumentService(
      new FakePicker(null),
      reader(ok("")),
      new FakeWriter(err("disk full")),
    );
    const outcome = await service.save("body", "/docs/note.md");
    expect(outcome.kind).toBe("error");
    if (outcome.kind === "error") expect(outcome.message).toBe("disk full");
  });
});
