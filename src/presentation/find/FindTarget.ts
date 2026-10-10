import { FindController, type FindState } from "./FindController";

/** Receives a find's results: at once for markdown, as pages are searched for a PDF. */
export type FindListener = (state: FindState) => void;

/**
 * What the find bar searches: the rendered markdown or a PDF. Results arrive through the
 * listener the target was created with, because a PDF reports its matches as it searches
 * page after page (docs/PDF_PLAN.md §4.4).
 */
export interface FindTarget {
  /** Search for `query` (case-insensitive) and go to the first match. */
  search(query: string): void;
  next(): void;
  previous(): void;
  /** Remove the match highlighting. */
  clear(): void;
}

/** Find in rendered HTML (the markdown reader), through FindController. */
export class HtmlFindTarget implements FindTarget {
  private readonly controller: FindController;

  constructor(
    root: HTMLElement,
    private readonly listener: FindListener,
  ) {
    this.controller = new FindController(root);
  }

  search(query: string): void {
    this.listener(this.controller.search(query));
  }

  next(): void {
    this.listener(this.controller.next());
  }

  previous(): void {
    this.listener(this.controller.previous());
  }

  clear(): void {
    this.controller.clear();
  }
}
