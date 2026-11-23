/**
 * Port: be told when a file changes on disk (written by another app, another tab, or the
 * app itself). Several parts of the app may watch the same file, e.g. a notes file open
 * in a tab and in the Notes panel; each watch is independent and ends on its own.
 *
 * Where files can't be watched (iPadOS), watching does nothing.
 */
export interface FileWatcher {
  /**
   * Call `onChange` whenever the file at `path` changes on disk; changes arrive in bursts
   * while a file is written, so `onChange` may be called several times for one write.
   * Returns a function that ends this watch.
   */
  watch(path: string, onChange: () => void): () => void;
}
