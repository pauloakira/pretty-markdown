interface PdfPendingProps {
  name: string;
}

/**
 * Stand-in for a PDF tab until the viewer lands (docs/PDF_PLAN.md, Phase 2). PDFs can
 * already reach a tab — Finder's "Open With → Other…", or a restored session — and this
 * keeps them from being treated as markdown.
 */
export function PdfPending({ name }: PdfPendingProps) {
  return (
    <div className="pdf-pending" role="status">
      <p className="pdf-pending__name">{name}</p>
      <p className="pdf-pending__msg">PDF viewing isn&apos;t available yet — it&apos;s coming in a future update.</p>
    </div>
  );
}
