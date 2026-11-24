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
| Domain | `values/Link.ts` `resolveFileLink`: a link to another file, relative to the document's folder, with a PDF's `#page=` and `rect` |
| Infrastructure | `markdown/excerptBlocks.ts`: renders an excerpt as an excerpt block (below) |
| Infrastructure | `PdfJsViewer.revealPassage(target)` (with `pdf/revealArea.ts`): scrolls a passage into view and flashes it |
| Infrastructure | `TauriNotesStore` over the native `read_text_file_if_exists` (missing → null, unreadable → error) and `write_text_file`; `PdfJsViewer.selectedPassage()`, `highlightSelection()` (resolves to the new highlight's place), `removeHighlight(place)`, and `onHighlightRemoved`, seen at pdf.js's editor registry (`addEditor` / `removeEditor` on its UI manager, which has no events for these) |
| Presentation | `useFileLinks` (links in a Markdown document to other files, via `FileLinkContext`), the PDF tab's **Back** pill and ⌘[, over `ViewState.back` |
| Presentation | `NotesPanel` (the notes beside the page) and the toolbar's **Read · Notes**, over `ViewState.notes`; `NotesService.readNotes`; `PdfViewerHandle.markPassage` outlines a hovered quote's passage |
| Presentation | `SelectionPopover` (the Mac): actions by a selection, over `PdfMountOptions.selectionActions` / `onSelectionChange` (the adapter's `pdf/selectionWatch.ts`); `quoteToMarkdown` for Copy as quote |
| Domain / Presentation | Quote cards: `NotesFile.segmentNotes` (the notes as text and excerpts, each with its note), `setNote`, `takeExcerpt` / `restoreExcerpt`, `setExcerptColor`; `NotesService.setNote` / `removeFromNotes` / `restoreToNotes` / `setColor`; `ExcerptCard` in the `NotesPanel`; `PdfViewerHandle.recolorHighlight` |
| Domain / Infrastructure / Presentation | Edits made elsewhere: `ports/FileWatcher.ts` (watch a path; independent watches), `TauriFileWatcher` (counts watchers per path over `watch_file` / `unwatch_file` and one `file-changed` listener), used by `useFileWatch` (tabs) and the `NotesPanel`; `NotesFile.noteOf` / `sameNote`; `NotesService.setNote(…, from)` resolves to `saved`, `changed` (with the other note) or `gone` |
| Presentation | PDF toolbar **Add to notes** (⌘E): highlights the selection in the highlighter colour, adds it to the notes and opens its card in the Notes panel, note ready. Removing a quoted highlight offers **Remove the quote** / **Keep** |

### Add to notes (PDF)

Select text, then **Add to notes** in the PDF toolbar or ⌘E. The passage is highlighted in
the PDF (saved into it as before; the tool stays as it was) and added to the end of
"Unsorted" in `<name>.notes.md`; the first time, the file is created. The Notes panel
opens (if it isn't open) with the new quote's card marked and its note open, so the
reader can write their thought on it straight away; the card's Delete takes it out again,
with its highlight. On a PDF that
can't be highlighted (signed, locked), the passage is still added to the notes, without a
`rect`.

Deleting a highlight that's quoted in the notes, or undoing it, shows "That highlight is
quoted in `<name>.notes.md`" with **Remove the quote** and **Keep**. The quote stays unless
the reader says so (the notice goes after a few seconds). Leaving highlight mode isn't a
deletion: pdf.js drops its editors for the file's own highlights then, and the adapter
only counts a highlight of the file as removed once pdf.js has marked it deleted.

Not yet: the iPad (writing beside a PDF opened from Files needs folder access; its own
card). `removeHighlight` reaches only
highlights pdf.js has an editor for (made or opened for editing since the document
opened); removing a quote from the Notes panel will need the file's other highlights too.

### The selection popover

Selecting text in a PDF shows a small dark bar above the selection (below it when there's
no room), in place of pdf.js's own Highlight button. It appears once the selection is made
(the pointer released, or a keyboard change settled), follows the selection as the page
scrolls, hides while the selection is out of view, and goes with the selection or on
Escape. It isn't shown in highlight mode, where a selection is highlighted at once.

- **The colours** highlight the passage in that colour, and it becomes the highlighter
  colour (as picking it in the toolbar does). The tool stays as it was. The current colour
  is ringed. Not shown on a PDF that can't be highlighted.
- **Add to notes** (⌘E) does what the toolbar's does. Notes on a quote are written in its
  card in the Notes panel, which opens with the note ready.
- **Copy as quote** copies `> text` and `> — [p. 12](Paper.pdf#page=12)`: an ordinary quote
  (no excerpt id, so pasted into notes it isn't taken for an excerpt), linked by the PDF's
  name, which is right for notes beside it and readable anywhere else. Nothing is
  highlighted.

A dragged selection takes whole words: when the pointer is released, an end that falls
inside a word moves to the word's edge (`pdf/wordSnap.ts`), visibly, so a quote and its
highlight never stop at "grid po". Ends between words and punctuation stay where they are.

**On the iPad** (2026-11-23) the same popover shows, below the selection: iPadOS puts its
own menu (Copy · Look Up · Translate · …) above it, and the popover sits clear of the end
handle so the selection can still be stretched. Its colours and buttons are full-size
(44 pt) and it shows no shortcut. A long-press on a word, then Add to notes, quotes it;
dragging a handle first quotes more. iPadOS clears the text selection as it turns a tap
into a click, so the popover remembers the selection when pressed and puts it back before
acting (as the viewer does for pdf.js's own button). The PDF's scroller is its own stacking
context, so the page's link layer can't come up through the popover.

Adding a highlight that's already on the page to the notes (hold it and drag it to the
panel, or an action on it) is a card of its own.

### Excerpts in the notes

In the notes file, an excerpt renders as an **excerpt block** (the design's QuoteBlock).
It has a bar in a deeper shade of its highlight colour, the quote in the reading font at
full strength, and a small "↗ p. 133 · Geometric Methods" link back to its page. The
link keeps its own text, so the reader can reword it ("Theorem 4.8"), and the document's
name is added after it. The block carries `data-excerpt`, `data-source` and `data-page`
for the cards that light up the passage and jump to it.

Only a quote whose last line is a dash and then an excerpt link (one with an `ex` id)
becomes a block. A quote that merely ends in a link, or puts the dash and link on the same
line as its text, stays an ordinary quote. A reader may spread a quote over several lines
or paragraphs, and those all stay in the block. Math in the rest of the notes is
untouched: the plugin runs after the math rules and only changes the quote's own tokens.

### Following a quote's link

Clicking "↗ p. 133" opens the PDF in a tab (or switches to it) at that page. The passage
lands a third of the way down the window, so the lines before it are in view too, and it is
outlined for a moment in the accent colour. A quote without a `rect` (from a PDF that
couldn't be highlighted) goes to the top of its page.

If the PDF was already open, its tab remembers where the reader was, and a
**‹ Back to p. 12** pill at the top of the page returns there (⌘[ does too). Each PDF tab
keeps its own list, so several jumps are undone one at a time. The contents sidebar and
Go to page are jumps as well. A PDF opened by the link has nowhere to go back to: the notes
are a tab switch away (or open the Notes panel beside the page).

Other links to files work the same way from any Markdown document: `other.notes.md` or
`../paper.pdf#page=3` opens in a tab, relative to the document's folder. Links to files
the app doesn't read (images, folders) and `file:` URLs still do nothing.

### The Notes panel

**Read · Notes** in a PDF's toolbar, or ⇧⌘N, puts the PDF's notes file beside the page.
Reading looks exactly as before until it's opened. Each PDF tab remembers whether its panel
is open and how wide it is (drag its left edge; the page keeps at least 360 px), and so
does the saved session.

The panel shows the notes file with each quote as a **card**: the quote, its "↗ p. 133"
link, and the reader's **note** on it. A quote's note is whatever is written after it up
to the next quote or heading, so a paragraph typed under a quote in any editor shows in
its card, and a note written in the card is plain Markdown under the quote in the file.
Titles, headings and text before the first quote show as they are around the cards.

- **Writing a note**: "Add a note" on a card, or a click on its note, edits it in place.
  It's saved as the reader types (shortly after the last key) and when they finish (Esc,
  ⌘↩ or clicking away); an emptied note is removed. Links in a note still work as links.
- **Add to notes** opens the panel with the new card marked and its note open, focused.
- **A card's menu** (on hover, top right): **Colour** recolours the quote and its
  highlight on the page; **Copy** copies the quote as Markdown (as Copy as quote does);
  **Delete** takes out the quote and its note. "Quote deleted · Undo" shows for six
  seconds; the highlight comes off the page once Undo is no longer offered (or the panel
  closes), so Undo brings back both. Undo restores the file exactly when nothing else
  changed it meanwhile, and otherwise puts the card back where it was.
- **Following a quote** ("↗ p. 133") stays in this tab: the page scrolls to the passage and
  flashes it, and Back (⌘[) returns. Other links open from the notes file's folder.
- **Hovering a card** outlines its passage on the page where it is, without scrolling.
  Quotes from other documents have nothing to outline.
- With no notes yet, the panel says how to start them (Add to notes, ⌘E).
- **Open as tab ↗** opens the whole notes file in its own tab (headings, reordering).

**Edits made elsewhere.** The panel watches the notes file and reads it again when it
changes on disk: saved from its tab, edited in another app, or synced from another device
(and when the window comes back to the front, which covers iPadOS, where files can't be
watched). Each change the panel makes reads the file first and edits only its own part, so
it never writes over the rest. A note being written is the one place both sides can touch:
- if the note changes elsewhere while the reader has nothing unsaved, the card takes the
  new text in;
- if they have unsaved words, nothing is saved over the other version. The card shows it
  and asks: **Keep both** (theirs, then the reader's below), **Use mine** or **Use theirs**. The
  check is made again at each save, so a change not yet heard of is caught there too.
  Closing the panel before choosing keeps both.

The card tells its own saves, which come back through the watcher, from changes made
elsewhere by remembering what it wrote. A note whose quote was deleted elsewhere can't be
saved, and the panel says so.

Recolouring and removing reach the highlights pdf.js has an editor for: those made or
edited since the document opened. A quote of an older highlight is recoloured in the
notes only.

Board joins the switch in R4. The Notes · Outline switch of the design comes with R3.

## Milestones

| | What | Status |
|-|------|--------|
| R1 | Linked notes: Add to notes, the Notes panel, quote ↔ page links (Mac, then iPad) | In progress — model, notes file, Add to notes (Mac), quote ↔ highlight removal, excerpt blocks in the notes, following a quote's link (with Back), the Notes panel and the selection popover (Mac and iPad) done |
| R2 | Peek and pin references | Planned |
| R3 | Outline view of the notes file, "Add to…" | Planned |
| R4 | Board view | Planned, last |
