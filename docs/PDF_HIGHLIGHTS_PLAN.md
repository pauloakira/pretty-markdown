# PDF highlights — implementation plan

> Status: **planned, not started** (2026-10-08). A spike confirmed that the approach works
> (§2). This plan supersedes the "sidecar file" idea in
> [PDF_PLAN.md §10](PDF_PLAN.md#10-future). Record decisions in
> [ARCHITECTURE.md §9](ARCHITECTURE.md#9-decision-log) as phases land.

## 1. Goal

Let the reader **highlight text in a PDF**, the way you would with a marker on a printed
paper:
1. Select a passage and it gets highlighted.
2. Change the highlight's colour or delete it.
3. Find it again next time the PDF is opened, on the Mac and on the iPad.

### In scope

- Highlighting selected text, in a few colours (yellow by default).
- Recolouring and deleting highlights, with undo.
- Highlights are **saved into the PDF file** as standard PDF highlight annotations.
- **Existing highlights** in a PDF (made in Preview, Acrobat, or on the iPad) show up and can
  be edited.
- Works on the iPad (touch selection), through the same code.

### Out of scope (for now)

- Freehand highlighting, ink drawing, text notes or comments, stamps. pdf.js supports
  these too, so they're natural follow-ups (§8).
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
- **A small `PdfAnnotationSaver`** (or a method on `DocumentService`):
  `save(path, bytes)` writes the bytes and remembers the **last bytes it wrote per path**
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

### 4.5 iPad

- **Writing:** the iOS `write_file_bytes` uses the same bookmark path as text saves, so
  iCloud files are written in place.
- **Touch:** long-press selects text in WKWebView, and pdf.js highlights a selection when
  the pointer is released. *Verify on the real iPad* that both the floating button and
  highlight mode work with touch, and that the system's selection menu doesn't get in the
  way.
- **The editor toolbar** needs touch-sized targets. That ties in with
  [ipad/PLAN.md](../ipad/PLAN.md) Phase D.

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
   never appears. Freehand highlighting (§8) would be the answer there.

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
- **Cross-app checks:** after highlighting, open the file in **Preview** on the Mac and in
  the **Files app** on the iPad. The highlights should appear in the right place and
  colour.
- **Verify in the real web view** (WKWebView), not only a browser. Per our practice,
  React, WebKit and pdf.js interactions are confirmed in the running app.

## 7. Phases

### Phase H1: Highlighting in the viewer (no saving yet)
- Enable the editor in `PdfJsViewer`.
- Extend the `PdfViewer` contract.
- Add the toolbar marker button and colour menu, plus the shortcuts.
- Check the floating button (§3.3), the CSS icons in the **packaged** app, and the iPad
  touch flow.
- **Done when:** text can be highlighted, recoloured, deleted and undone on the Mac and the
  iPad. Highlights are lost on close, as expected at this stage.

### Phase H2: Saving
- `write_file_bytes` (desktop and iOS) and `FileWriter.writeBytes`.
- The saver, with own-write tracking.
- Autosave with a debounce, plus flushing on unmount and on quit.
- Error banners; signed and encrypted handling; the changed-on-disk guard (§5.2).
- **Done when:** highlights survive closing and reopening, show up in Preview and on the
  iPad through iCloud, and never touch signed PDFs.

### Phase H3: Integration with PDF reload
- When PDF_PLAN Phase 3's reload-on-change lands (or as part of it), skip our own writes,
  and reload cleanly after external changes.
- Update the docs: PDF_PLAN §1 "Out of scope", DESIGN.md, the README feature list, and
  ARCHITECTURE §9 (decisions 3.1 and 3.2).

## 8. Future

- **Freehand highlight** (pdf.js has a "free highlight" mode), useful for scanned PDFs.
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
