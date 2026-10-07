# iPad version — plan

> Status: **Phase A (spike) done** (2026-10-06). Same codebase as the Mac app; see
> [README.md](README.md) for running it. Record decisions in
> [ARCHITECTURE.md §9](../docs/ARCHITECTURE.md#9-decision-log).

## Goal

A personal-use iPad build of pretty-markdown that reads the same markdown and PDF files as
the Mac, from **iCloud Drive**, installed with a **free Apple ID**. It isn't for the App
Store. The Mac app must keep working exactly as before at every step.

## Phase A: Spike ✅ (2026-10-06)

- **Tauri iOS target:** `tauri ios init` generated `src-tauri/gen/apple` (a universal
  app with iPad orientations).
- **Desktop-only Rust fenced off:** file watching (`notify`, a desktop-only dependency;
  `watch_file`/`unwatch_file` are no-ops on mobile) and the ⌘Q menu handler.
- **Ran it in an iPad simulator** (iPad Air 13" on iOS 18.3):
  - ✅ The app UI, tabs and document toolbar work unchanged.
  - ✅ Markdown with KaTeX and the MathJax fallback render perfectly.
  - ✅ The PDF viewer works: crisp (Retina is 2× natively), the toolbar works, and touch
    scrolling has smooth momentum with pages pre-drawn ahead.
  - ✅ The open dialog shows the native iPadOS document picker (iCloud Drive / On My iPad)
    and accepts `.md` and `.pdf`.
  - ⚠️ The picker hands back a **temporary imported copy** as a `file://` URL
    (`…/tmp/<bundle>-Inbox/…`), not the original file. The spike makes the Rust file
    commands accept `file://` URLs, so documents open, but edits wouldn't reach the
    original and the copies vanish (session restore will break). → Phase B.
  - ⚠️ The settings gear is clipped at the right edge of the tab bar. → Phase D.

## Phase B: File access done right (the main work)

iPadOS apps can't open arbitrary paths. A file picked from iCloud Drive is reachable only
through a **security-scoped URL**, and to reopen it after a relaunch the app must keep a
**bookmark** for it.

- **Open in place:** present `UIDocumentPickerViewController` in open mode, not import, so
  we read and save the real iCloud file. That likely needs a small Swift Tauri plugin;
  check first whether `tauri-plugin-dialog` exposes this on iOS.
- **Bookmarks:** create bookmark data when a file is picked, store it, and resolve it on
  launch (session restore and recent files), with `startAccessingSecurityScopedResource` /
  `stop…` around each read and write.
- **iCloud placeholders:** files not yet downloaded must be fetched first
  (`startDownloadingUbiquitousItem`), with a "downloading…" state in the UI.
- **Coordinated access:** read and write through `NSFileCoordinator`, so saving a markdown
  file doesn't race iCloud sync.
- **Architecture:** a document-access port with two adapters. The desktop adapter is
  today's path-based one; the iOS adapter uses bookmark ids. Sessions and recent files
  store an opaque document reference instead of assuming a path. The domain stays
  unchanged.

## Phase C: Open from Files and the share sheet

- Declare markdown and PDF document types, with `LSSupportsOpeningDocumentsInPlace`
  (Xcode already warns that it's missing).
- Handle URLs opened from Files, "Open in…", and the share sheet. On iOS the existing
  `RunEvent::Opened` delivers them.

## Phase D: Touch and iPad UX

- **Long-press** for the tab and chip menus (right-click doesn't exist on iPad).
- **Pinch to zoom** in PDFs, mapped to the viewer's zoom with fit-width snapping.
- Bigger touch targets in the tab bar and toolbars; hover-only details made reachable.
- Fix the settings gear clipping; respect safe areas in landscape and Split View.
- Hardware keyboard shortcuts (Magic Keyboard) already work through the same handlers.
  Verify them.
- PDF export: `window.print` isn't available in WKWebView on iOS. Offer the share sheet or
  the native print dialog instead, or hide the option.

## Phase E: Install on the iPad

- Signing with the free Personal Team, Developer Mode, trusting the certificate (steps in
  the README).
- A script in this folder to rebuild and reinstall over USB or Wi-Fi, since free builds
  expire every 7 days.

## Risks

| Risk | Mitigation |
|---|---|
| WKWebView on iPadOS has a tighter canvas memory budget; large PDFs at Retina resolution could be killed | Tune pdf.js's page buffer and `maxCanvasPixels` on iPad; test with a 300-page PDF on the real device |
| iCloud files not downloaded yet | Download on open with progress (Phase B) |
| Free provisioning expires every 7 days | A one-command reinstall script (Phase E); data and bookmarks survive a reinstall |
| A change breaks the Mac build | Platform code fenced with `cfg(desktop)` / `cfg(mobile)`; Mac checks after every iPad change; macOS CI later |
