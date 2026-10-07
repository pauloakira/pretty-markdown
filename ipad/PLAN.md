# iPad version — plan

> Status: **Phase A (spike) done** (2026-10-06); **Phase B implemented** (2026-10-07),
> pending a real-device check. Same codebase as the Mac app; see
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

## Phase B: File access done right (the main work) — implemented, device check pending

**As built (2026-10-07):**
- [`tauri-plugin-ipad-files`](tauri-plugin-ipad-files) is a small Swift and Rust plugin,
  an iOS-only dependency, so the Mac never compiles it. It has two calls:
  - `remember(path)`: start security-scoped access and store a bookmark for the path, in
    UserDefaults.
  - `access(path)`: resolve the bookmark (following moves and refreshing stale bookmarks),
    start access, and do a coordinated read, which makes iCloud download a cloud-only
    file first. It returns the path to read or write. The work runs off the main thread.
- The iOS versions of `read_text_file` / `read_file_bytes` / `write_text_file` are `async`
  and call `access` first. The desktop versions are unchanged, sharing the read/write
  helpers.
- `IosFileSystem` is chosen at build time via `TAURI_ENV_PLATFORM`. It opens the picker in
  **scoped (open-in-place)** mode and calls `remember_document` right after a pick. The
  document's identity stays its real path, so sessions, recent files, de-duplication and
  *Group tabs by folder* need no change.
- **Verified in the simulator:** a picked file is opened in place (the session stores the
  original path, not a temporary copy), its bookmark is stored, and quitting and
  relaunching restores the tab through the bookmark.
- **Not verifiable in the simulator:** the simulator neither enforces the iPadOS file
  sandbox nor signs into iCloud. Real-device checks still to do:
  - a file picked from iCloud Drive reopens after the app is force-quit;
  - a file evicted to the cloud downloads on open;
  - saving an edited markdown file updates it in iCloud.
- **Known v1 limitations:** writes are plain writes after a coordinated read (not a
  coordinated write); Save As to a new location isn't available on iPad.

**Original plan:**

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

## Phase E: Install on the iPad ✅ (2026-10-07)

- **Installed on a real iPad Pro 12.9" (iPadOS 26.6)** with the free Personal Team, built
  with Xcode 16.2.
- **Gotchas found on the way:**
  - Developer Mode is hidden until the Mac requests developer services from the iPad.
  - The first install fails with "provisioning profile cannot be installed on this device"
    until the iPad is registered with the team. An `xcodebuild … -destination id=<udid>
    -allowProvisioningDeviceRegistration` run does that.
  - `tauri ios build` writes `DEVELOPMENT_TEAM` into `project.pbxproj`; we keep it out of
    git.
- **[`install.sh`](install.sh)** does all of this in one command and is how the app is
  renewed every 7 days.
- **Signing:** we stay on the free Personal Team. The 7-day limit is Apple's for free
  accounts. A paid developer membership would give 1-year builds; we decided against it.
- **App icon:** iOS needs an opaque, full-bleed icon, so the iOS set comes from
  `src-tauri/app-icon-ios.svg`. Regenerate it without touching the Mac icons:
  1. `npx tauri icon src-tauri/app-icon-ios.svg -o <tmp> --ios-color "#3f6bc8"`
  2. Strip the alpha channel from the PNGs in `<tmp>/ios`.
  3. Copy them into `src-tauri/icons/ios/` and
     `src-tauri/gen/apple/Assets.xcassets/AppIcon.appiconset/`.

## Risks

| Risk | Mitigation |
|---|---|
| WKWebView on iPadOS has a tighter canvas memory budget; large PDFs at Retina resolution could be killed | Tune pdf.js's page buffer and `maxCanvasPixels` on iPad; test with a 300-page PDF on the real device |
| iCloud files not downloaded yet | Download on open with progress (Phase B) |
| Free provisioning expires every 7 days | `ipad/install.sh` renews in one command (Phase E); data and bookmarks survive a reinstall |
| A change breaks the Mac build | Platform code fenced with `cfg(desktop)` / `cfg(mobile)`; Mac checks after every iPad change; macOS CI later |
