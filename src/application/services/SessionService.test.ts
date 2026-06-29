import { describe, expect, it } from "vitest";
import { createDocument } from "../../domain/entities/Document";
import { createTab } from "../../domain/entities/Tab";
import { addTab, emptyWorkspace } from "../../domain/entities/Workspace";
import type {
  FilePicker,
  FileReader,
  FileWriter,
} from "../../domain/ports/FileSystem";
import type { SessionRepository } from "../../domain/ports/SessionRepository";
import { err, ok, type Result } from "../../domain/values/Result";
import type { Session } from "../../domain/values/Session";
import { DocumentService } from "./DocumentService";
import { SessionService } from "./SessionService";

class FakeSessionRepository implements SessionRepository {
  public saved: Session | null = null;
  public cleared = false;
  constructor(private readonly toLoad: Session | null) {}
  async load(): Promise<Session | null> {
    return this.toLoad;
  }
  async save(session: Session): Promise<void> {
    this.saved = session;
  }
  async clear(): Promise<void> {
    this.cleared = true;
  }
}

class FakeReader implements FileReader {
  constructor(private readonly files: Record<string, string>) {}
  async readTextFile(path: string): Promise<Result<string>> {
    return path in this.files ? ok(this.files[path]) : err("missing");
  }
}
const nullPicker: FilePicker = {
  async pickMarkdownFile() {
    return null;
  },
  async pickSavePath() {
    return null;
  },
};
const nullWriter: FileWriter = {
  async writeTextFile() {
    return ok(undefined);
  },
};

function documentsWith(files: Record<string, string>): DocumentService {
  return new DocumentService(nullPicker, new FakeReader(files), nullWriter);
}

describe("SessionService", () => {
  it("restores only the files that still exist", async () => {
    const repo = new FakeSessionRepository({
      version: 1,
      activeIndex: 0,
      tabs: [
        { path: "/a.md", mode: "reader", scrollTop: 0 },
        { path: "/missing.md", mode: "edit", scrollTop: 5 },
      ],
    });
    const service = new SessionService(repo, documentsWith({ "/a.md": "# A" }));

    const restored = await service.restore();
    expect(restored.tabs).toHaveLength(1);
    expect(restored.tabs[0].document.path).toBe("/a.md");
    expect(restored.tabs[0].document.content).toBe("# A");
  });

  it("returns nothing when there is no saved session", async () => {
    const service = new SessionService(new FakeSessionRepository(null), documentsWith({}));
    expect((await service.restore()).tabs).toHaveLength(0);
  });

  it("persists the workspace as a session (paths only)", async () => {
    const repo = new FakeSessionRepository(null);
    const service = new SessionService(repo, documentsWith({}));
    const ws = addTab(emptyWorkspace, createTab("t1", createDocument("/doc.md", "# Doc")));

    await service.persist(ws);
    expect(repo.saved?.tabs).toEqual([{ path: "/doc.md", mode: "reader", scrollTop: 0 }]);
  });

  it("clears the saved session", async () => {
    const repo = new FakeSessionRepository(null);
    await new SessionService(repo, documentsWith({})).clear();
    expect(repo.cleared).toBe(true);
  });
});
