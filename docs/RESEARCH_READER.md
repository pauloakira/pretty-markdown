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
> — [p. 133](Geometric%20Methods.pdf#page=133&ex=7f3a9c&color=yellow)

So every rotation has a skew-symmetric logarithm. It fails for $SL(2,\mathbb{R})$.

## Unsorted

> The same argument, applied to unitary matrices, shows that exp : u(n) → U(n) is onto.
> — [p. 133](Geometric%20Methods.pdf#page=133&ex=c41d2e&color=blue)
```

An **excerpt** is a quote whose last line links to its page. All the app needs rides in
that link: the source path relative to the notes file, `#page=` (the standard PDF open
parameter, so other apps open the right page too), the excerpt id `ex` and the colour. A
quote without that link is just a quote; a hand-typed `file.pdf#page=3` is just a link.

The quote's text is escaped only where Markdown or math would misread it (`$`, `*`, `_`,
`` ` ``, `<`, `|`, `~`, a link's `](`, a list or heading marker at the start). A lone `[`
is not escaped, because `\[` opens display math in the LaTeX dialect the app also reads.

## Code

| Layer | Piece |
|-------|-------|
| Domain | `values/Excerpt.ts` (the excerpt, its link, text clean-up and escaping), `values/NotesFile.ts` (where the file lives; add, remove and read excerpts), `ports/NotesStore.ts` (read a notes file that may not exist yet; write it) |

## Milestones

| | What | Status |
|-|------|--------|
| R1 | Linked notes: Add to notes, the Notes panel, quote ↔ page links (Mac, then iPad) | In progress — domain model done |
| R2 | Peek and pin references | Planned |
| R3 | Outline view of the notes file, "Add to…" | Planned |
| R4 | Board view | Planned, last |
