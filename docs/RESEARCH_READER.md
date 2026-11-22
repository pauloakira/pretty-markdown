# Research reader

Turn reading into notes without leaving the app: every highlight can become an **excerpt**
that remembers where it came from, and excerpts live in a plain Markdown **notes file**
beside the document. Read, Notes and Board are three views of that one file.

- Design (Mac + iPad): Design Canvas document `dSN8YTRkWL8s`, page
  "Proposal — Research reader (full)"; the products it learns from are on
  "Landscape — Similar products".
- Tasks: the shared Notion kanban (see [CLAUDE.md](../CLAUDE.md)), milestones R1–R4.

## Decisions (21 Nov 2026)

1. **One notes file per document, made automatically.** No setup and no "project" to
   choose: open a PDF and its notes are there. "Add to…" (⌥⌘E, R3) sends a quote to any
   other notes file; it keeps its link to its own PDF.
2. **`<document name>.notes.md`, beside the document**, visible in Finder and Files, so it
   moves, syncs and backs up with the PDF. Created at the first *Add to notes*, never by
   reading. On iPad, if the folder can't be written, notes go to the app's own Notes
   folder and a banner offers to move them later; highlighting is never blocked.
3. **Board (R4) stays, built last and kept small**: clusters are headings, cards are
   excerpts, drag and link; no free ink. Starts once the Outline is in daily use.

## The notes file

Ordinary Markdown that any editor shows well. New excerpts go to the end of the
`## Unsorted` section (created if missing); everything the reader wrote is left exactly as
it was, line endings included.

```markdown
# Notes on Geometric Methods

## Surjectivity of exp

> Proposition 4.6. The exponential map exp : so(n) → SO(n) is surjective.
> — [p. 133](Geometric%20Methods.pdf#page=133&ex=7f3a9c&color=yellow&rect=72,540,451,553)

So every rotation has a skew-symmetric logarithm. It fails for $SL(2,\mathbb{R})$.

## Unsorted

> The same argument, applied to unitary matrices, shows that exp : u(n) → U(n) is onto.
> — [p. 133](Geometric%20Methods.pdf#page=133&ex=c41d2e&color=blue&rect=72,512,430,525)
```

An **excerpt** is a quote whose last line links to its page. All the app needs rides in
that link: the source path relative to the notes file, `#page=` (the standard PDF open
parameter, so other apps open the right page too), the excerpt id `ex`, the colour, and
`rect`, the area of the page its highlight covers (left, bottom, right, top in PDF points,
rounded outwards). A quote without that link is just a quote; a hand-typed
`file.pdf#page=3` is just a link.

### How a quote and its highlight find each other

By **page and area**: the highlight's `/Rect` in the PDF and the quote's `rect`. Two areas
are the same highlight when they overlap by at least 60% (shared over combined area), which
tolerates another app re-saving the PDF a point or two off and still tells neighbouring
lines apart. The excerpt id `ex` stays the quote's own id in the notes file; it isn't
written into the PDF.

Why not an id inside the PDF (an annotation's `/NM`): pdf.js 6 neither writes nor reads
`/NM`, so it would mean patching its minified worker on every upgrade. The area is already
in every highlight, in any app, and survives recolouring (pdf.js keeps an edited
highlight's dictionary).

The quote's text is escaped only where Markdown or math would misread it (`$`, `*`, `_`,
`` ` ``, `<`, `|`, `~`, a link's `](`, a list or heading marker at the start). A lone `[`
is not escaped, because `\[` opens display math in the LaTeX dialect the app also reads.

## Code

| Layer | Piece |
|-------|-------|
| Domain | `values/Excerpt.ts` (the excerpt, its link, text clean-up and escaping), `values/NotesFile.ts` (where the file lives; add, remove and read excerpts), `ports/NotesStore.ts` (read a notes file that may not exist yet; write it) |
| Domain | `values/PdfRect.ts`: a page area, a highlight's place (page + area), and when two areas are the same highlight |
| Application | `NotesService`: add a passage to a document's notes (creating the file the first time), remove it again, find the quotes of a highlight (`excerptsOf`); changes to one file are queued so quick additions can't overwrite each other |
| Infrastructure | `TauriNotesStore` over the native `read_text_file_if_exists` (missing → null, unreadable → error) and `write_text_file`; `PdfJsViewer.selectedPassage()`, `highlightSelection()` (resolves to the new highlight's place), `removeHighlight(place)`, and `onHighlightRemoved`, seen at pdf.js's editor registry (`addEditor` / `removeEditor` on its UI manager, which has no events for these) |
| Presentation | PDF toolbar **Add to notes** (⌘E): highlights the selection in the highlighter colour and adds it to the notes; a notice offers **Open notes** and **Remove**. Removing a quoted highlight offers **Remove the quote** / **Keep** |

### Add to notes (PDF)

Select text, then **Add to notes** in the PDF toolbar or ⌘E. The passage is highlighted in
the PDF (saved into it as before; the tool stays as it was) and added to the end of
"Unsorted" in `<name>.notes.md`; the first time, the file is created. The notice names the
file and offers **Open notes** (opens it in a tab) and **Remove** (takes the quote out of
the notes again, and the highlight it made). The notice's button isn't called "Undo"
because the toolbar's Undo already means "undo the last highlight change". On a PDF that
can't be highlighted (signed, locked), the passage is still added to the notes, without a
`rect`.

Deleting a highlight that's quoted in the notes, or undoing it, shows "That highlight is
quoted in `<name>.notes.md`" with **Remove the quote** and **Keep**. The quote stays unless
the reader says so (the notice goes after a few seconds). Leaving highlight mode isn't a
deletion: pdf.js drops its editors for the file's own highlights then, and the adapter
only counts a highlight of the file as removed once pdf.js has marked it deleted.

Not yet: the iPad (writing beside a PDF opened from Files needs folder access; its own
card), the selection popover, and the Notes side panel. `removeHighlight` reaches only
highlights pdf.js has an editor for (made or opened for editing since the document
opened); removing a quote from the Notes panel will need the file's other highlights too.

## Milestones

| | What | Status |
|-|------|--------|
| R1 | Linked notes: Add to notes, the Notes panel, quote ↔ page links (Mac, then iPad) | In progress — model, notes file, Add to notes (Mac), and quote ↔ highlight removal done |
| R2 | Peek and pin references | Planned |
| R3 | Outline view of the notes file, "Add to…" | Planned |
| R4 | Board view | Planned, last |
