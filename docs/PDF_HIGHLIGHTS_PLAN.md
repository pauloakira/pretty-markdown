# PDF highlights — implementation plan

> Status: **in progress.** Planned 2026-10-08, with Apple Pencil support added the same
> day; a spike confirmed that the approach works (§2). **Done:** PR 1 (writing PDF files)
> and PR 2 (H1 + H2: highlighting and autosave) on 2026-10-09, and PR 3 (H3: drag to
> highlight on iPad, finger and Pencil) on 2026-10-10 (§7), and H4 with PDF_PLAN Phase 3.
> This plan supersedes the "sidecar file" idea in [PDF_PLAN.md §10](PDF_PLAN.md#10-future). Record decisions in
> [ARCHITECTURE.md §9](ARCHITECTURE.md#9-decision-log) as phases land.

## 1. Goal

Let the reader **highlight text in a PDF**, the way you would with a marker on a printed
paper:
1. Select a passage and it gets highlighted.
2. Change the highlight's colour or delete it.
3. Find it again next time the PDF is opened, on the Mac and on the iPad.

On the iPad, the **Apple Pencil is the main way to highlight**.
- **Turn on highlight mode**, then drag the Pencil across a line like a highlighter pen.
  Your finger keeps scrolling.
- **Outside highlight mode,** the Pencil behaves as it does everywhere else: it scrolls
  and selects. That leaves room for a later **note-taking** feature with the Pencil (§8).

### In scope

- Highlighting selected text, in a few colours (yellow by default).
- Recolouring and deleting highlights, with undo.
- Highlights are **saved into the PDF file** as standard PDF highlight annotations.
- **Existing highlights** in a PDF (made in Preview, Acrobat, or on the iPad) show up and can
  be edited.
- **iPad with the Apple Pencil, in highlight mode:** a Pencil stroke over text highlights
  that text, snapped to the lines like a real highlighter but neater. Fingers keep
  scrolling and zooming (§3.4).
- iPad without a Pencil: select with a long press, then use the floating button, the same
  as on the Mac.

### Out of scope (for now)

- Freehand highlighting (strokes not on text). Tried on the iPad, where it caused accidental
  marks, so it's off everywhere (H3 follow-up).
- Ink drawing, text notes or comments, stamps. pdf.js supports these too, so they're
  natural follow-ups (§8).
- A sidebar listing all highlights, and exporting them as markdown (§8).
- Filling forms, signing, or any other PDF editing.

## 2. Spike results (2026-10-08)

A throwaway page ran our pdf.js setup (`pdfjs-dist` 6.4.299, legacy build, the same
`PDFViewer` we use) on a real paper:

| Check | Result |
|---|---|
| Highlight selected text | ✅ pdf.js's built-in highlight editor works in our viewer. Selecting text in highlight mode highlights it. pdf.js's floating toolbar (colour picker, delete) appears with its icons. |
| Save into the PDF | ✅ `pdf.saveDocument()` returns the PDF with standard `/Highlight` annotations (with `QuadPoints`). The save is **incremental**: the original bytes are unchanged and about 2 KB is appended. It took 4 ms for a 135 KB file. |
| Reopen the saved bytes | ✅ Both highlights render again, in the chosen colour. |
| Edit after reopening | ✅ In highlight mode, a reopened highlight can be selected, recoloured and deleted. |

The spike also found two things to handle:
- **Fit-width needs our CSS fixes:** without the `box-sizing` reset that `PdfJsViewer`
  already has, the page-width zoom came out negative.
- **A harmless pdf.js warning:** `#injectLinkAnnotations` logged a `TypeError` while
  inferring links on that paper. It's unrelated to highlights (link inference); keep an
  eye on it.

## 3. Key decisions

### 3.1 Store highlights in the PDF, not in a sidecar file

| Option | Verdict |
|---|---|
| **In the PDF** (`saveDocument()`, an incremental update) | **Chosen.** Highlights are standard annotations, so they show up in Preview, the iPad Files app, Acrobat and any other reader. They travel with the file through iCloud, copies and email, and stay valid when the file is renamed or moved. pdf.js already reads and edits them. |
| A sidecar file next to the PDF (`paper.pdf.pm.json`) | Rejected. **It can't work on the iPad:** the app only gets access to the one file the user picked, not to its folder, so it can't create files next to it. It would also clutter folders, break when the PDF is moved, and be invisible to other apps. Restoring editable highlights from JSON also isn't a public pdf.js API. |
| App-private storage keyed by path | Rejected. It's invisible outside the app, lost when the file is moved, and never synced between the Mac and the iPad. |

**The trade-off:** we now *write* to the user's PDFs, where so far we only read them. The
mitigations:
- the save is incremental (the original bytes stay intact; the change is an appended
  section);
- we only write when the user actually highlights something;
- signed PDFs are never modified (§5.4).

**Known limitation:** a PDF that gets **regenerated** loses its highlights, because the
whole file is replaced. That covers recompiling LaTeX and re-exporting. This is inherent
to storing highlights in the file. A sidecar would survive, but its highlights would point
at text that has moved. Mention this in the docs; it's a non-issue for papers you read but
didn't write.

### 3.2 Save automatically

Highlights are saved **automatically**, shortly after each change (debounced, about 1 s),
and before the viewer unmounts.
- This is how Preview behaves. A highlight is a deliberate action, so losing it would be
  worse than writing it.
- It avoids a hard problem: `PdfReader` unmounts the viewer when you switch tabs, which
  throws away pdf.js's in-memory edits. Keeping "unsaved highlights" across tab switches
  would mean re-injecting them, and pdf.js has no public API for that.
- Undo stays available: pdf.js's undo (⌘Z, and its undo bar after a delete) works within
  the session. An undo is just another change, and gets saved too.

The alternative, explicit ⌘S with a dirty tab and the close/quit prompt, is listed as an
open question (§9). It would need the "keep edits across tab switches" work above.

### 3.3 Highlighting UX: floating button on selection, plus a highlight mode

- **Default:** select text and a small **Highlight** button appears next to the selection.
  This is pdf.js's `enableHighlightFloatingButton`, with no mode to switch into. One click
  highlights in the current colour.
- **Highlight mode** (a marker button in the PDF toolbar, also ⌘⇧H): every selection is
  highlighted immediately, for marking up a paper quickly. Press Esc or the button again to
  leave the mode.
- **Colours:** five, using pdf.js's `annotationEditorHighlightColors` (yellow, green,
  blue, pink, red). The last one used becomes the default, remembered in settings.
- *Verify in Phase H1* that the floating button works without the full pdf.js app UI. If
  it doesn't, ship highlight mode only.

### 3.4 Apple Pencil: in highlight mode, the Pencil highlights and the finger scrolls

**Decided (2026-10-08): the Pencil highlights only in highlight mode.**
- Highlight mode is toggled with the marker button in the PDF toolbar.
- Outside the mode, the Pencil behaves like a finger: it scrolls, taps links, and selects
  text with a long press, which you can then copy.
- This keeps the Pencil free for a later **note-taking** feature (§8). The modes would
  then be *highlight* and *write*.

**In highlight mode:**
- **A Pencil stroke over text → a text highlight.** The stroke's start and end points are
  turned into a text range: `document.caretRangeFromPoint` on pdf.js's text layer. That
  range becomes the selection, and pdf.js highlights it like any other selection. The
  result follows the text lines exactly, even if the stroke wobbles.
- **A Pencil stroke over no text** (a figure, a scanned page) → a **freehand highlight**,
  using pdf.js's free-highlight drawing. This follows the stroke, with the marker's width
  and transparency.
- **A Pencil tap on a highlight** selects it: recolour or delete in pdf.js's toolbar.
- **Fingers** scroll, pinch-zoom and long-press-select as usual. They never draw.
- **While drawing,** a live stroke preview is shown, so the Pencil feels immediate. When
  the Pencil lifts, the preview snaps to the text.
- **The colour** is the same current colour as on the Mac; pick it from the PDF toolbar.
- **Leaving the mode:** tap the marker button again or press Esc on a keyboard. Pencil
  double-tap toggles it too (below).
- **Pencil double-tap toggles highlight mode** (Apple Pencil 2nd generation). This is the
  gesture iPad users expect for switching tools.
  - The double-tap only reaches native code (`UIPencilInteraction`). A small addition to
    `tauri-plugin-ipad-files` forwards it to the web view as an event.
  - It respects the user's system setting for the gesture (*Settings → Apple Pencil*):
    when that is set to "Ignore", nothing happens.
  - Optional within H3, but cheap and high value.
- **Pencil hover** (the iPad Pro 12.9" 6th generation with the Pencil 2nd generation
  supports it) is optional polish. In highlight mode, show a highlighter cursor where the
  stroke would land.

**Target hardware:** iPad Pro 12.9" (6th generation, M2) with the **Apple Pencil (2nd
generation)**. That gives pressure, tilt, double-tap and hover. Squeeze isn't available on
this Pencil (Pencil Pro only).

**How it's told apart in the web view (WKWebView):**
- WebKit marks each touch with `Touch.touchType`: `"stylus"` for the Pencil and `"direct"`
  for a finger. Pointer events report `pointerType: "pen"`.
- In highlight mode only, on a stylus `touchstart` over a page we call
  `preventDefault()`, so the stroke doesn't scroll. Finger touches are left alone, so native scrolling, momentum and pinch keep
  working.
- iPadOS already rejects the palm while the Pencil is in use.
- *Verify these on the real iPad first* (Phase H3, step 1). The simulator has no Pencil.

## 4. Architecture changes, by layer

The layering rules still hold (see [ARCHITECTURE.md](ARCHITECTURE.md)): pdf.js stays in
infrastructure, and the presentation layer only sees the `PdfViewer` contract.

### 4.1 Domain

- **No change to documents, tabs or sessions.** With autosave, a PDF tab is never "dirty",
  so `isTabDirty` stays `false` for PDFs and session v3 needs nothing new.
- **Settings:** add `pdfHighlightColor` (the last colour used) to the settings value
  object, with a default and validation like the existing settings.

### 4.2 Application

- **`FileWriter` port:** add `writeBytes(path, bytes): Promise<Result<void>>`, next to
  `writeTextFile`.
- **`PdfSaver`** (`src/application/services/PdfSaver.ts`, in the container as
  `pdfSaver`): `save(path, bytes)` writes the bytes and remembers the **last bytes it wrote per path**
  (size and hash), so file watching can recognise our own writes (§4.4). It returns a
  `Result`, and its errors are messages for the UI.

### 4.3 Infrastructure

- **Rust: `write_file_bytes`** in `src-tauri/src/lib.rs`. It takes the **raw request
  body** (`tauri::ipc::Request` with `InvokeBody::Raw`) and the path in a header. That
  avoids JSON-encoding megabytes as a number array, the write-side twin of
  `read_file_bytes`.
  - Desktop: a plain write, matching `write_text`. An atomic temp-and-rename would replace
    the file's inode, and the file watcher and iCloud handle an in-place write more
    predictably.
  - iOS: the `async` variant goes through `accessible_path` (security-scoped bookmarks),
    exactly like `write_text_file`.
  - Add a Rust unit test that bytes round-trip unchanged.
- **`TauriFileSystem.writeBytes`** calls it. `IosFileSystem` inherits it.
- **`PdfJsViewer`:**
  - Create the viewer with `annotationEditorMode: AnnotationEditorType.NONE` (the editor
    is enabled but idle), `annotationEditorHighlightColors`, and
    `enableHighlightFloatingButton: true`.
  - Switch modes with `viewer.annotationEditorMode = { mode }`.
  - Set the current colour through the UI manager. pdf.js dispatches it with the
    `annotationeditoruimanager` event; keep a reference to it.
  - Listen to `pdf.annotationStorage.onSetModified`. On each change, debounce, then call
    `pdf.saveDocument()` and hand the bytes to `options.onSave(bytes)`. After a successful
    write, call `annotationStorage.resetModified()`.
  - `destroy()` becomes `async`, or gains a `flush()` that the reader awaits, so a pending
    save completes before the worker is torn down.
  - pdf.js disables editing on its own when the PDF's permissions forbid annotations
    (`#initializePermissions`). Surface that as "highlighting not allowed for this PDF".

### 4.4 Presentation

- **`PdfViewer` contract** (`src/presentation/pdf/PdfViewer.ts`):
  ```ts
  type PdfTool = "select" | "highlight";
  interface PdfViewerHandle {
    // ...existing
    readonly canHighlight: boolean;            // false for signed / permission-locked PDFs
    setTool(tool: PdfTool): void;
    setHighlightColor(color: string): void;
    flush(): Promise<void>;                    // finish any pending save
  }
  interface PdfMountOptions {
    // ...existing
    onSave(bytes: Uint8Array): Promise<Result<void>>;
    highlightColor: string;
  }
  ```
  Update the fake viewer used in tests to match.
- **`DocumentToolbar`, PDF branch:**
  - add a **marker button** (it toggles highlight mode and shows the current colour) and a
    colour menu;
  - disable both with a tooltip when `canHighlight` is false.
- **`PdfReader`:**
  - passes `onSave` (wired to the saver) and the colour setting;
  - awaits `flush()` before `destroy()` on unmount;
  - shows save errors in the existing banner style ("Couldn't save highlights:
    read-only file").
- **Quit:** the quit flow (⌘Q, and the window close button) awaits `flush()` on the
  active PDF viewer, so a highlight made just before quitting is written.
- **Keyboard (`useTabKeyboard`):**
  - ⌘⇧H toggles highlight mode on PDF tabs;
  - Esc leaves highlight mode;
  - make sure ⌘Z/⌘⇧Z reach pdf.js on PDF tabs, and aren't swallowed.
- **File watching:** PDF reload-on-change is still PDF_PLAN Phase 3. When it lands, it
  must **ignore our own writes**: on `file-changed`, compare the file's size and hash with
  the saver's last-written bytes for that path, and skip a match. Otherwise every
  highlight would reload the viewer.

### 4.5 iPad and Apple Pencil

- **Writing:** the iOS `write_file_bytes` uses the same bookmark path as text saves, so
  iCloud files are written in place.
- **Pencil input (§3.4)** goes in a new infrastructure module, `src/infrastructure/pdf/pencil.ts`,
  so `PdfJsViewer` stays readable. It's attached only when the device has touch, and is
  inert on the Mac. It contains:
  - `isStylus(touch)` and the stroke tracker: pointer events with `pointerType === "pen"`,
    and `getCoalescedEvents()` for a smooth preview at 120 Hz;
  - `strokeToRange(start, end, textLayer)` (a pure function, unit-tested): turns the
    stroke's endpoints into a text `Range`, or `null` when no text is under the stroke;
  - which pdf.js call to make: for text, set the selection and ask pdf.js's UI manager to
    highlight it, the same path as the floating button; for no text, drive a free
    highlight with the stroke's points;
  - the preview overlay: one absolutely positioned canvas over the page being drawn on,
    cleared when the Pencil lifts.
- **The `PdfViewer` contract** needs nothing new for the Pencil. It follows the same
  `setTool("highlight")` as the Mac's highlight mode, with the same colour and save path.
  The Pencil handlers are attached only while the tool is `"highlight"`.
- **Double-tap (Pencil 2nd generation):** `tauri-plugin-ipad-files` adds a
  `UIPencilInteraction` to the web view. On a double-tap, it emits a `pencil-double-tap`
  event, unless the user's preferred action is "Ignore". The PDF reader listens for it
  and toggles highlight mode on the active PDF tab.
- **Long-press and finger selection:** pdf.js highlights a selection when the pointer is
  released. *Verify on the real iPad* that the floating button appears after a long-press
  selection, and that the system's selection menu (Copy / Look Up) doesn't cover it.
- **Touch-sized targets** for pdf.js's editor toolbar (colour, delete), and the marker
  button in our toolbar. That ties in with [ipad/PLAN.md](../ipad/PLAN.md) Phase D.

## 5. Edge cases

1. **The same PDF open in two tabs:** tabs are already de-duplicated by path, so this
   can't happen.
2. **The PDF changes on disk while open** (another app, or iCloud from the iPad):
   - Today: our next autosave would write over it with the old content plus the
     highlights.
   - Mitigation: before saving, check the file's size and mtime against what we loaded or
     last wrote. If they differ, don't save; show "This PDF changed on disk; reload to
     keep highlighting."
   - This gets resolved properly with Phase 3's reload.
3. **Read-only file or folder:** the save fails, and the banner says so. The highlights
   stay visible until the tab closes.
4. **Signed PDFs:** an incremental update keeps the original signature bytes, but readers
   then flag the document as "modified after signing". Detect signature fields when
   loading, for example a field of type `/Sig` via `getFieldObjects()`. If there are any,
   set `canHighlight = false` and explain why in the tooltip.
5. **Encrypted PDFs (permissions only, no open password):** pdf.js respects the
   annotation permission flag. Test whether `saveDocument()` writes encrypted documents
   correctly; if not, set `canHighlight = false` for them.
6. **Large PDFs:** the save is incremental, so its cost grows with the number of
   highlights, not the file size. The file is still written in full (about 50 MB for a big
   scan). Measure it with the 300-page fixture; the debounce keeps writes rare.
7. **Scanned PDFs without a text layer:** there's nothing to select, so the floating button
   never appears. On the iPad, the Pencil falls back to freehand highlighting (§3.4). On
   the Mac, freehand highlighting stays a future item (§8).
8. **Pencil strokes across columns or pages:** a range is built from the start and end
   points, so a stroke that wanders into the next column would select everything in
   between.
   - Limit a text highlight to the **lines the stroke actually passed over**: intersect
     the range's line boxes with the stroke's vertical extent.
   - A stroke that crosses onto another page is clipped to the page where it started.
9. **A Pencil stroke that's really a tap or a scroll attempt (in highlight mode):**
   - Strokes shorter than a few points become a tap: select the highlight under it, or
     nothing.
   - In highlight mode the Pencil can't scroll; scrolling is done with a finger. Outside
     the mode, the Pencil scrolls normally.
10. **Zoom while drawing:** a pinch with the other hand cancels the stroke in progress.

## 6. Testing

- **Unit tests:**
  - the saver (records last-written bytes, recognises its own writes);
  - the settings colour validation;
  - the toolbar's highlight controls, using the fake viewer (enabled or disabled, mode
    toggle);
  - the keyboard shortcuts.
- **Rust:** `write_file_bytes` round-trips bytes; error cases (a missing directory, a
  read-only file).
- **Manual fixtures:**
  - a normal paper;
  - a PDF already highlighted in Preview (its highlights should show and be editable);
  - a signed PDF;
  - a PDF that is encrypted with permissions only;
  - a scanned PDF;
  - the 300-page PDF (to time saving).
- **`strokeToRange`:** unit-tested with a fake text layer: a single line, several lines, a
  stroke over a gap, a wobbly stroke, a stroke across columns.
- **On the real iPad, with the Pencil:**
  - highlight one line, several lines, and a word, in highlight mode;
  - outside highlight mode the Pencil scrolls and selects, and draws nothing;
  - double-tap toggles the mode, and does nothing when the system setting is "Ignore";
  - check a stroke over a figure (it should become a freehand highlight);
  - fingers still scroll, momentum works, and pinch-zoom works while the Pencil is
    resting;
  - palm on the screen while drawing;
  - landscape, portrait, and Split View;
  - performance on a 300-page PDF.
- **Cross-app checks:** after highlighting, open the file in **Preview** on the Mac and in
  the **Files app** on the iPad. The highlights should appear in the right place and
  colour.
- **Verify in the real web view** (WKWebView), not only a browser. Per our practice,
  React, WebKit and pdf.js interactions are confirmed in the running app.

## 7. Phases

### Phases H1 + H2: Highlighting and saving ✅ (2026-10-09, PR 2)
Shipped together: highlights that vanish on close would have confused daily use.

**As built:**
- **`PdfViewer` contract:**
  - `highlighting` (allowed, or not with a reason);
  - `setTool("select" | "highlight")`, `setHighlightColor`, `flush()`;
  - `onSave` and `onToolChange` options.
- **`PdfJsViewer`:**
  - pdf.js's editor runs in `NONE` mode (idle) with the floating Highlight button. It is
    `DISABLE`d for signed PDFs (`getSignatures()`), PDFs whose permissions forbid changes
    (`MODIFY_CONTENTS`), and XFA forms.
  - **Autosave:** a change schedules a save 1 s later, using pdf.js's storage hooks, its
    editor events, and pointer/key up over the pages. A save writes `saveDocument()` only
    if the annotation storage's hash changed since the last successful save.
  - Removing the last new highlight makes pdf.js mark the storage *un*modified, but the
    file still has that highlight; the hash comparison catches this.
  - One save at a time; a change made during a save is saved right after.
- **pdf.js asks its host app to change modes**: the floating button sends
  `showannotationeditorui`, and double-clicking a highlight sends
  `switchannotationeditormode`. pdf.js's own viewer app answers these; ours now does too,
  for `NONE` and `HIGHLIGHT` only, and reports mode changes back to the toolbar.
- **The toolbar colour is for new highlights:** the viewer deselects before setting it.
  pdf.js's own toolbar on a highlight recolours that one.
- **`PdfSaver`:**
  - before writing, it re-reads the file and refuses if it no longer matches what was
    loaded or last saved (§5.2), showing a banner;
  - `finishLater` / `settled` let a reopened PDF wait for the closing viewer's last save.
- **`PdfReader`:**
  - Highlight toggle and colour menu (`HighlightControl`); ⌘⇧H toggles, Esc leaves.
  - The colour is the `pdfHighlightColor` setting.
  - Flushes on unmount (then destroys), on quit (both answers of the quit prompt), and
    when the app is hidden (iPad app switching).
- **Fix found live:** the floating button lives in the text layer, under the link layer, so
  a link under it (a citation) took the click and jumped pages. While the button shows, a
  CSS rule (`.textLayer:has(> .editToolbar)`) lifts the text layer above the link layer.

- **iPad fixes, found on the device and reproduced in the simulator with logged touch
  events:**
  - iPadOS clears the text selection when it turns a tap on the floating button into
    mouse events, just before the button's click handler runs, so nothing was highlighted.
    The viewer remembers the selection on `pointerdown` and restores it in a capture-phase
    `click` listener, before pdf.js's own handler.
  - After pdf.js turns a touch selection into a highlight and clears the selection, the
    still-running selection gesture puts back a selection reaching to the end of the page.
    It is cleared again for a moment (30, 150 and 400 ms) after each new highlight.
  - **iPadOS's long-press picks the wrong word** over pdf.js's text layer: on "We" it
    selected "Abstract. W", reproduced in the simulator. `textHit.ts` finds the word under
    a point by measuring each character's on-screen box with a `Range`. While a touch
    press turns into a selection (until 400 ms after the lift, since iPadOS re-applies its
    own selection when the finger lifts), the viewer replaces it with that word.
  - **Dragging a selection handle was just as wrong:** onto the next line, the *other* end
    jumped back to "Abstract", or the handle wouldn't leave the line. Switching off the
    text layer's `scaleX` stretch didn't help, so it isn't the transform; iPadOS's selection
    is unreliable over pdf.js's absolutely positioned spans in general.
  - **Fix (`touchSelection.ts`):** pointer events still arrive during a handle drag, so the
    app decides the selection itself:
    - a touch that starts near an end of the selection drags that end and keeps the other;
    - the moving end goes to `caretAt(finger − initial offset)`, measured in the text
      layer (the nearest line when between lines);
    - whenever iPadOS applies its own selection, it's replaced again.
    - iPadOS still draws the selection, its handles and its menu.
    - Verified in the simulator on the reported paper: the end handle onto the next line,
      the start handle onto the previous line, then highlighting the result.
  - With a finger in highlight mode, a long-press highlights a single word straight away
    (there's no time to drag the handles first). For longer passages: long-press in select
    mode, drag the handles, then tap the floating button. Dragging across text is the
    Pencil's job (H3).

**Tested:**
- 189 unit and app tests. The app tests cover:
  - toolbar, ⌘⇧H and Esc;
  - colour menu and its persistence;
  - disabled-with-reason;
  - flush on tab switch, before destroy;
  - flush on quit (both answers);
  - flush on hide;
  - the changed-on-disk banner;
  - the toolbar following the viewer.
- **Live, in the browser** (the real app with Tauri's IPC mocked, a real paper):
  - floating button and highlight mode;
  - colour menu;
  - Backspace delete and ⌘Z undo, both saved;
  - close and reopen, with the highlights rendered from the file;
  - deleting a highlight that came from the file;
  - the changed-on-disk guard.
  - Every save was checked by re-reading the bytes with pdf.js: the right highlights and
    colours, and the original bytes intact.
- **Fixtures generated with pypdf and pyHanko:**
  - a **signed** PDF and a **permissions-locked** PDF: both disabled with their reason,
    and never written;
  - an **encrypted PDF that allows changes**: it saves, and reads back with the highlight.
- **Live in the real Mac app (WKWebView)**, with a temporary probe on a copy of a paper:
  - floating button → highlight → toolbar in highlight mode;
  - a second highlight in a newly picked colour;
  - autosave to the real file.
  - The saved file was checked with **pypdf** (two `/Highlight` annotations, right colours,
    original bytes intact) and rendered by **macOS Quick Look** (PDFKit): both highlights
    show, so Preview sees them too.
- **iPad simulator, with real taps:**
  - long-press, then tap the floating button: highlighted;
  - highlight mode, then long-press: highlighted, with no stray selection;
  - autosave wrote the file (135,272 → 136,340 bytes).
- **Still to check by hand:**
  - ⌘Z through the native Edit menu, in the packaged Mac app;
  - the same touch flows on the real iPad.

### Phase H1: Highlighting in the viewer (planned)
- Enable the editor in `PdfJsViewer`.
- Extend the `PdfViewer` contract.
- Add the toolbar marker button and colour menu, plus the shortcuts.
- Check the floating button (§3.3), the CSS icons in the **packaged** app, and the iPad
  touch flow.
- **Done when:** text can be highlighted, recoloured, deleted and undone on the Mac and the
  iPad. Highlights are lost on close, as expected at this stage.

### PR 1: Writing PDF files ✅ (2026-10-09)
Split out of H2 so the riskiest change, writing to the user's files, got its own review.
- `write_file_bytes` (desktop and iOS) and `FileWriter.writeBytes`.
- `PdfSaver` with own-write tracking: a `fingerprint` (size + FNV-1a) of the last write per
  path.
- **Tested:**
  - Rust, through Tauri's mock IPC: exact bytes, overwriting, a missing folder, a
    non-raw body.
  - Unit tests for `PdfSaver` and `fingerprint`.
  - **Live, with a temporary probe in the real app:**
    - **Mac:** a 4.9 MB PDF was written in 15 ms, byte-identical (`cmp`), to a path with
      spaces and accents.
    - **iPad simulator:** a 3 MB file through the bookmark path, in 153 ms, identical
      when read back.
    - Both reported a missing folder as a clear error.

### Phase H2: Saving
- Uses PR 1's `write_file_bytes` and `PdfSaver`.
- Autosave with a debounce, plus flushing on unmount and on quit.
- Error banners; signed and encrypted handling; the changed-on-disk guard (§5.2).
- **Done when:** highlights survive closing and reopening, show up in Preview and on the
  iPad through iCloud, and never touch signed PDFs.

### Phase H3: Drag to highlight on iPad (finger and Pencil) ✅ (2026-10-10, PR 3)

**Changed from the original plan (decided 2026-10-10):** after the long-press selection
proved slow and inaccurate on the device, **a finger highlights too**, not just the Pencil.
In highlight mode, one finger or the Pencil drags across text to highlight it, and two
fingers scroll. Outside the mode, nothing changes.

**As built:**
- **`dragHighlight.ts`** (active only on touch screens, and only in highlight mode):
  - a stroke that starts on text (within 14 px) is the app's; pdf.js doesn't see it;
  - a press that moves less than 6 px is a tap, left to pdf.js (selecting a highlight);
  - the stroke snaps to whole words (`toWordEdge`) and stays on the page it started on;
  - a live preview in the highlighter colour shows the covered text;
  - lifting turns it into a pdf.js highlight: the stroke becomes the selection for a
    moment, then `uiManager.highlightSelection("drag")`;
  - a stroke that starts off text (a figure, the margin) does nothing (no freehand
    highlights; see the 2026-10-10 follow-up below).
- **Two-finger scrolling:**
  - The first attempt set WebKit's native scroll views to pan with two fingers
    (`minimumNumberOfTouches = 2` on `WKChildScrollView`, set from the plugin). It reached
    the right views, but WebKit never started the two-finger pan.
  - So in this mode native panning is off (`touch-action: none`), and `dragHighlight.ts`
    scrolls by the two fingers' midpoint itself.
  - Momentum: the speed over the last 100 ms (capped at 4 px/ms), decaying 5% per frame.
  - The same swipe scrolled 1,071 px this way and 1,096 px natively.
- **Long-press selection is off in this mode** (`user-select: none`, no callout), since
  dragging highlights.
- **Pencil double-tap toggles highlight mode** (Apple Pencil 2nd generation). The plugin
  adds a `UIPencilInteraction` to the web view and, unless the user's preferred tap action
  is "Ignore", dispatches `pencil-double-tap` to the page.
- **Not done:**
  - the Pencil hover cursor;
  - touch-sized editor controls (with ipad/PLAN.md Phase D);
  - verifying that a freehand stroke over a figure works by touch.

**Follow-up (2026-10-10): no freehand highlights; Undo/Redo buttons.**
- On the iPad, freehand highlights appeared by accident: a stroke starting just off the
  text (between lines, the blank top of a page).
  - In highlight mode pdf.js's text layer covers the page, and a press on its empty parts
    (the layer itself, `endOfContent`, images) or on the editor layer starts a freehand
    stroke.
  - `PdfJsViewer` now stops such presses in highlight mode (`onEmptyPress`), leaving only
    their deselecting effect. Highlights always follow text, on the Mac too.
- **Undo and Redo buttons** in the PDF toolbar (the iPad has no ⌘Z without a keyboard).
  They are enabled from pdf.js's `editingstateschanged` (`hasSomethingToUndo` /
  `hasSomethingToRedo`) and call `uiManager.undo()` / `redo()`; autosave writes the
  result.
- Verified in the iPad simulator:
  - two strokes from blank space in highlight mode made no highlight (before the fix,
    both made freehand ones);
  - a stroke on text still highlights;
  - Undo removed it and saved the file back to its original size, and Redo restored and
    saved it.

**Follow-up (2026-10-11): freehand strokes with highlight mode off.**
- On the iPad, yellow freehand strokes appeared while scrolling with the Pencil, with the
  toolbar showing highlight mode off. They weren't saved to the file, so they were
  strokes pdf.js had started and never finished. pdf.js finishes a stroke only when a
  `pointerup` for that pointer reaches `window`. Until then it keeps drawing on every
  move of the pointer over that page, in any mode.
- Two gaps let that happen:
  - **Late mode switches.** Entering highlight mode first redraws the pages that already
    have highlights, and pdf.js records the new mode only once they've drawn. A request
    to leave the mode before then is dropped, because pdf.js still thinks it's off. The
    pending switch then turned highlighting on by itself later, e.g. as those pages drew
    while scrolling.
    - Now `PdfJsViewer` remembers the mode the reader last asked for (`wantedMode`).
    - A mode change that disagrees with it is reversed at once, and not shown in the
      toolbar.
  - **A guard that trusted reported state.** `onEmptyPress` acted only when pdf.js had
    reported highlight mode.
    - Now it also checks the editor's own mode (`uiManager.getMode()`).
    - It also blocks the press when pdf.js has armed that page's text layer for strokes
      (its `highlighting` class), whatever the mode.
- Not reproduced exactly in the simulator, which can't send Pencil input (nor hover).
  Checked there:
  - toggling on and off;
  - a stroke on text still highlights;
  - a stroke on blank space draws nothing;
  - after scrolling and zoom changes in highlight mode, no page stays armed once the mode
    is off.

**Tested in the iPad simulator, on the VEM paper:**
- a one-finger drag highlights "We consider the discretization of a boundary", snapped
  to words, with no scrolling;
- a two-line stroke highlights exactly the lines crossed;
- two fingers scroll in highlight mode;
- normal one-finger scrolling outside the mode is unchanged;
- 210 tests pass (`toWordEdge` unit tests included).
- **Real iPad (iPad Pro 12.9", Apple Pencil 2nd generation):** confirmed by the user, including the Pencil.

**Original plan:**
- **Step 1, a device check (a short spike on the real iPad):** confirm that WKWebView
  reports `touchType: "stylus"` and `pointerType: "pen"`. Confirm that cancelling a stylus
  `touchstart` stops scrolling without breaking finger scrolling.
- Build `pencil.ts`: the stroke tracker, `strokeToRange`, the preview overlay, and the
  free-highlight fallback.
- Touch-sized editor controls and a touch-sized marker button.
- Optional: Pencil double-tap toggles highlight mode (native `UIPencilInteraction` in
  `tauri-plugin-ipad-files`), and the hover cursor.
- **Done when:**
  - in highlight mode, a highlighter-style Pencil stroke over text produces a neat text
    highlight on the iPad;
  - outside the mode, the Pencil and fingers behave as before;
  - the highlights save to iCloud and appear on the Mac.

### Phase H4: Integration with PDF reload ✅ (2026-10-10, with PDF_PLAN Phase 3)
- Built in PDF_PLAN Phase 3: the watcher reloads a changed PDF unless the bytes are
  `PdfSaver`'s own last write. Verified live: a highlight save didn't reload; replacing
  the file did, at the same page.

**Original plan:**
- When PDF_PLAN Phase 3's reload-on-change lands (or as part of it), skip our own writes,
  and reload cleanly after external changes.
- Update the docs: PDF_PLAN §1 "Out of scope", DESIGN.md, the README feature list, and
  ARCHITECTURE §9 (decisions 3.1 and 3.2).

## 8. Future

- **Freehand highlight on the Mac** (pdf.js has a "free highlight" mode), useful for
  scanned PDFs. The iPad gets it with the Pencil in H3.
- **Taking notes with the Pencil on iPad.** Handwritten notes and drawings on the page
  (pdf.js's ink editor, saved into the PDF like highlights), in a *write* mode next to
  *highlight* mode. Another option is handwriting into a markdown note beside the PDF. To
  be planned separately.
- **Pencil eraser mode:** a stroke over a highlight deletes it.
- **Notes on highlights** (pdf.js 6 has a comment manager).
- **A highlights sidebar:** all highlights in the PDF, with their text and page; click to
  jump.
- **Export highlights to markdown:** a quote per highlight, grouped by page, as a new
  markdown tab. It plays to the app's strength: notes next to the paper.

## 9. Open questions

1. **Autosave vs ⌘S:** autosave (recommended, §3.2), or explicit save with a dirty tab and
   the close/quit prompt? Explicit save needs extra work to keep unsaved highlights across
   tab switches.
2. **Default mode:** floating button on selection (recommended), or require switching into
   highlight mode first?
3. **Colours:** pdf.js's default five, or a custom palette that matches the app's theme?

**Decided:**
- **Pencil behaviour (2026-10-08):** the Pencil highlights **only in highlight mode**.
  Outside it, the Pencil scrolls and selects like a finger. Pencil note-taking is a later
  feature (§3.4, §8).
- **Hardware (2026-10-08):** Apple Pencil (2nd generation) on the iPad Pro 12.9" (6th
  generation). Double-tap and hover are available; squeeze isn't.
