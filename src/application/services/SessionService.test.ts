import { describe, expect, it } from "vitest";
import { createMarkdownDocument } from "../../domain/entities/Document";
import { createTab } from "../../domain/entities/Tab";
import { createGroup } from "../../domain/entities/TabGroup";
import {
  addTab,
  emptyWorkspace,
  groupTabsInto,
  updateContent,
  updateGroup,
} from "../../domain/entities/Workspace";
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
  public saves = 0;
  public cleared = false;
  constructor(private readonly toLoad: Session | null) {}
  async load(): Promise<Session | null> {
    return this.toLoad;
  }
  async save(session: Session): Promise<void> {
    this.saved = session;
    this.saves += 1;
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
  async readBytes(path: string, maxBytes?: number): Promise<Result<Uint8Array>> {
    if (!(path in this.files)) return err("missing");
    const bytes = new TextEncoder().encode(this.files[path]);
    return ok(maxBytes === undefined ? bytes : bytes.slice(0, maxBytes));
  }
}
const nullPicker: FilePicker = {
  async pickDocument() {
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
  async writeBytes() {
    return ok(undefined);
  },
};

function documentsWith(files: Record<string, string>): DocumentService {
  return new DocumentService(nullPicker, new FakeReader(files), nullWriter);
}

describe("SessionService", () => {
  it("restores only the files that still exist", async () => {
    const repo = new FakeSessionRepository({
      version: 3,
      activeIndex: 0,
      tabs: [
        { path: "/a.md", mode: "reader", scrollTop: 0, group: 0 },
        { path: "/missing.md", mode: "edit", scrollTop: 5, group: null },
      ],
      groups: [{ name: "Notes", color: "green", collapsed: false }],
    });
    const service = new SessionService(repo, documentsWith({ "/a.md": "# A" }));

    const restored = await service.restore();
    expect(restored.tabs).toHaveLength(1);
    expect(restored.tabs[0].document.path).toBe("/a.md");
    expect(restored.tabs[0].document).toMatchObject({ kind: "markdown", content: "# A" });
    expect(restored.tabs[0].group).toBe(0);
    expect(restored.groups).toEqual([{ name: "Notes", color: "green", collapsed: false }]);
  });

  it("keeps the same tab active when tabs before it are dropped", async () => {
    const tab = (path: string) => ({ path, mode: "reader" as const, scrollTop: 0, group: null });
    const repo = new FakeSessionRepository({
      version: 3,
      activeIndex: 3, // /d.md
      tabs: [tab("/a.md"), tab("/gone.md"), tab("/c.md"), tab("/d.md"), tab("/e.md")],
      groups: [],
    });
    const files = { "/a.md": "", "/c.md": "", "/d.md": "", "/e.md": "" };
    const restored = await new SessionService(repo, documentsWith(files)).restore();

    expect(restored.tabs.map((t) => t.document.path)).toEqual(["/a.md", "/c.md", "/d.md", "/e.md"]);
    expect(restored.tabs[restored.activeIndex].document.path).toBe("/d.md");
  });

  it("returns nothing when there is no saved session", async () => {
    const service = new SessionService(new FakeSessionRepository(null), documentsWith({}));
    expect((await service.restore()).tabs).toHaveLength(0);
  });

  it("persists the workspace as a session (paths only)", async () => {
    const repo = new FakeSessionRepository(null);
    const service = new SessionService(repo, documentsWith({}));
    const ws = addTab(emptyWorkspace, createTab("t1", createMarkdownDocument("/doc.md", "# Doc")));

    await service.persist(ws);
    expect(repo.saved?.tabs).toEqual([{ path: "/doc.md", mode: "reader", scrollTop: 0, group: null }]);
  });

  it("clears the saved session", async () => {
    const repo = new FakeSessionRepository(null);
    await new SessionService(repo, documentsWith({})).clear();
    expect(repo.cleared).toBe(true);
  });

  describe("autosave", () => {
    const docA = createMarkdownDocument("/a.md", "# A");
    const docB = createMarkdownDocument("/b.md", "# B");
    const withA = addTab(emptyWorkspace, createTab("t1", docA));
    const withAB = addTab(withA, createTab("t2", docB));

    it("writes when the open tabs change — the session tracks the latest state", async () => {
      const repo = new FakeSessionRepository(null);
      const service = new SessionService(repo, documentsWith({}));

      expect(await service.autosave(withA)).toBe(true);
      expect(await service.autosave(withAB)).toBe(true);
      expect(repo.saved?.tabs.map((t) => t.path)).toEqual(["/a.md", "/b.md"]);
    });

    it("skips writes when nothing restorable changed (e.g. content edits)", async () => {
      const repo = new FakeSessionRepository(null);
      const service = new SessionService(repo, documentsWith({}));
      await service.autosave(withA);

      const edited = updateContent(withA, "t1", "# A, edited");
      expect(await service.autosave(edited)).toBe(false);
      expect(repo.saves).toBe(1);
    });

    it("treats the restored session as the baseline (no rewrite on launch)", async () => {
      const stored = {
        version: 3 as const,
        activeIndex: 0,
        tabs: [{ path: "/a.md", mode: "reader" as const, scrollTop: 0, group: null }],
        groups: [],
      };
      const repo = new FakeSessionRepository(stored);
      const service = new SessionService(repo, documentsWith({ "/a.md": "# A" }));
      await service.restore();

      expect(await service.autosave(withA)).toBe(false);
      expect(repo.saves).toBe(0);
    });

    it("writes when tabs are grouped or a group changes", async () => {
      const repo = new FakeSessionRepository(null);
      const service = new SessionService(repo, documentsWith({}));
      await service.autosave(withAB);

      const grouped = groupTabsInto(withAB, ["t1", "t2"], createGroup("g", "", "blue"));
      expect(await service.autosave(grouped)).toBe(true);
      expect(await service.autosave(updateGroup(grouped, "g", { name: "PoliVEM" }))).toBe(true);
      expect(repo.saved?.groups).toEqual([{ name: "PoliVEM", color: "blue", collapsed: false }]);
      expect(repo.saved?.tabs.map((t) => t.group)).toEqual([0, 0]);
    });

    it("restores PDF tabs with their page/zoom, and drops missing or invalid ones", async () => {
      const stored = {
        version: 3 as const,
        activeIndex: 0,
        tabs: [
          { path: "/p/paper.pdf", mode: "reader" as const, scrollTop: 0, group: null, pdf: { page: 7, pageOffset: 0.5, zoom: 1.25 } },
          { path: "/p/old.pdf", mode: "reader" as const, scrollTop: 0, group: null },
          { path: "/p/gone.pdf", mode: "reader" as const, scrollTop: 0, group: null },
          { path: "/p/fake.pdf", mode: "reader" as const, scrollTop: 0, group: null },
        ],
        groups: [],
      };
      const service = new SessionService(
        new FakeSessionRepository(stored),
        documentsWith({ "/p/paper.pdf": "%PDF-1.7 ...", "/p/old.pdf": "%PDF-1.4 ...", "/p/fake.pdf": "<html>" }),
      );

      const restored = await service.restore();
      expect(restored.tabs.map((t) => t.document.path)).toEqual(["/p/paper.pdf", "/p/old.pdf"]);
      expect(restored.tabs[0].document.kind).toBe("pdf");
      expect(restored.tabs[0].pdf).toEqual({ page: 7, pageOffset: 0.5, zoom: 1.25 });
      expect(restored.tabs[1].pdf).toBeUndefined(); // saved before PDF view state existed
    });

    it("stays off after the user opts out, so a late write can't undo 'don't reopen'", async () => {
      const repo = new FakeSessionRepository(null);
      const service = new SessionService(repo, documentsWith({}));
      await service.clear();

      expect(await service.autosave(withAB)).toBe(false);
      expect(repo.saved).toBeNull();
    });
  });
});
