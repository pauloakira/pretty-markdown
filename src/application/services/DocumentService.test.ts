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
  async pickDocument(): Promise<string | null> {
    return this.openPath;
  }
  async pickSavePath(): Promise<string | null> {
    return this.savePath;
  }
}

class FakeReader implements FileReader {
  public bytesRequested: { path: string; maxBytes?: number } | null = null;
  constructor(
    private readonly result: Result<string>,
    private readonly bytes: Result<Uint8Array> = err("no bytes"),
  ) {}
  async readTextFile(): Promise<Result<string>> {
    return this.result;
  }
  async readBytes(path: string, maxBytes?: number): Promise<Result<Uint8Array>> {
    this.bytesRequested = { path, maxBytes };
    return this.bytes;
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
      expect(outcome.document).toMatchObject({ kind: "markdown" });
      expect(outcome.document.kind === "markdown" && outcome.document.content).toContain("x^2");
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

describe("DocumentService — PDFs", () => {
  const pdfBytes = new TextEncoder().encode("%PDF-1.7\n%âãÏÓ\n1 0 obj");

  it("loads a .pdf as a PDF document, reading only its header", async () => {
    const fake = new FakeReader(err("text read must not be used for a PDF"), ok(pdfBytes));
    const service = new DocumentService(new FakePicker(null), fake, new FakeWriter());

    const outcome = await service.load("/papers/Paper.PDF");
    expect(outcome).toEqual({
      kind: "opened",
      document: { kind: "pdf", path: "/papers/Paper.PDF", name: "Paper.PDF" },
    });
    expect(fake.bytesRequested).toEqual({ path: "/papers/Paper.PDF", maxBytes: 1024 });
  });

  it("rejects a .pdf that isn't really a PDF", async () => {
    const fake = new FakeReader(ok(""), ok(new TextEncoder().encode("<html>not a pdf</html>")));
    const service = new DocumentService(new FakePicker(null), fake, new FakeWriter());

    const outcome = await service.load("/downloads/paper.pdf");
    expect(outcome).toEqual({ kind: "error", message: "'paper.pdf' isn't a valid PDF file." });
  });

  it("reports a missing PDF as an error (so restore drops it)", async () => {
    const fake = new FakeReader(ok(""), err("Failed to read '/gone.pdf': No such file"));
    const service = new DocumentService(new FakePicker(null), fake, new FakeWriter());

    expect(await service.load("/gone.pdf")).toEqual({
      kind: "error",
      message: "Failed to read '/gone.pdf': No such file",
    });
  });

  it("still reads markdown as text", async () => {
    const fake = new FakeReader(ok("# Notes"), err("byte read must not be used for markdown"));
    const service = new DocumentService(new FakePicker(null), fake, new FakeWriter());

    const outcome = await service.load("/notes/a.md");
    expect(outcome.kind === "opened" && outcome.document).toMatchObject({
      kind: "markdown",
      content: "# Notes",
    });
    expect(fake.bytesRequested).toBeNull();
  });
});

describe("DocumentService — PDF data for the viewer", () => {
  it("reads the whole file (no byte limit)", async () => {
    const pdf = new TextEncoder().encode("%PDF-1.7\n...rest of the file...");
    const fake = new FakeReader(ok(""), ok(pdf));
    const service = new DocumentService(new FakePicker(null), fake, new FakeWriter());

    expect(await service.loadPdfData("/p/a.pdf")).toEqual(ok(pdf));
    expect(fake.bytesRequested).toEqual({ path: "/p/a.pdf", maxBytes: undefined });
  });

  it("rejects bytes that aren't a PDF, and passes read errors through", async () => {
    const notPdf = new DocumentService(
      new FakePicker(null),
      new FakeReader(ok(""), ok(new TextEncoder().encode("<html>"))),
      new FakeWriter(),
    );
    expect(await notPdf.loadPdfData("/p/a.pdf")).toEqual(err("'a.pdf' isn't a valid PDF file."));

    const missing = new DocumentService(
      new FakePicker(null),
      new FakeReader(ok(""), err("Failed to read '/p/a.pdf'")),
      new FakeWriter(),
    );
    expect(await missing.loadPdfData("/p/a.pdf")).toEqual(err("Failed to read '/p/a.pdf'"));
  });
});
