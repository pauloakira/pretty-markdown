/**
 * Outcome of rendering a single LaTeX fragment. A failure is a value, never a throw,
 * so the pipeline can show an inline error chip without breaking the whole document.
 */
export type RenderResult =
  | { readonly ok: true; readonly html: string }
  | { readonly ok: false; readonly error: string; readonly source: string };

export const rendered = (html: string): RenderResult => ({ ok: true, html });

export const renderFailed = (source: string, error: string): RenderResult => ({
  ok: false,
  error,
  source,
});
