interface ReaderProps {
  html: string;
}

/**
 * Read-only rendered document — the "PDF reader" view. The HTML comes from our own
 * markdown + KaTeX pipeline (raw inline HTML is disabled upstream), so injecting it is
 * safe here.
 */
export function Reader({ html }: ReaderProps) {
  return (
    <article
      className="reader markdown-body"
      // eslint-disable-next-line react/no-danger -- trusted pipeline output (see MarkdownPipeline)
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
