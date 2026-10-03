import { describe, expect, it } from "vitest";
import { createDocument } from "../../domain/entities/Document";
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
      version: 2,
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
    expect(restored.tabs[0].document.content).toBe("# A");
    expect(restored.tabs[0].group).toBe(0);
    expect(restored.groups).toEqual([{ name: "Notes", color: "green", collapsed: false }]);
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
    expect(repo.saved?.tabs).toEqual([{ path: "/doc.md", mode: "reader", scrollTop: 0, group: null }]);
  });

  it("clears the saved session", async () => {
    const repo = new FakeSessionRepository(null);
    await new SessionService(repo, documentsWith({})).clear();
    expect(repo.cleared).toBe(true);
  });

  describe("autosave", () => {
    const docA = createDocument("/a.md", "# A");
    const docB = createDocument("/b.md", "# B");
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
        version: 2 as const,
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

    it("stays off after the user opts out, so a late write can't undo 'don't reopen'", async () => {
      const repo = new FakeSessionRepository(null);
      const service = new SessionService(repo, documentsWith({}));
      await service.clear();

      expect(await service.autosave(withAB)).toBe(false);
      expect(repo.saved).toBeNull();
    });
  });
});
