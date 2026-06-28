import { DocumentService } from "../application/services/DocumentService";
import { TauriFileSystem } from "../infrastructure/fs/TauriFileSystem";
import { CompositeMathRenderer } from "../infrastructure/math/CompositeMathRenderer";
import { KatexRenderer } from "../infrastructure/math/KatexRenderer";
import { MarkdownPipeline } from "../infrastructure/markdown/MarkdownPipeline";

/**
 * Composition root: the one place where concrete adapters are wired into services.
 * Everything else depends on interfaces, not implementations (ARCHITECTURE.md §1).
 */
export interface Container {
  readonly documentService: DocumentService;
  readonly pipeline: MarkdownPipeline;
}

export function createContainer(): Container {
  // M1: KaTeX only. M2 inserts MathJax as the next renderer in this list.
  const mathRenderer = new CompositeMathRenderer([new KatexRenderer()]);
  const pipeline = new MarkdownPipeline(mathRenderer);

  const fileSystem = new TauriFileSystem();
  const documentService = new DocumentService(fileSystem, fileSystem);

  return { documentService, pipeline };
}
