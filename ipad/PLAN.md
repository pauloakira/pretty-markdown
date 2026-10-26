# iPad version — plan

> Status: **Phase A (spike) done** (2026-10-06); **Phase B implemented** (2026-10-07);
> **Phase C done** (2026-10-10, verified on the iPad); Phase D in progress. Same codebase as the Mac app; see
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

## Phase C: Open from Files and the share sheet ✅ (2026-10-10)

**As built:**
- **Document types for iPad** in iOS-only config, so the Mac's associations are unchanged:
  - `src-tauri/tauri.ios.conf.json` declares markdown and PDF by content type
    (`net.daringfireball.markdown`, `com.adobe.pdf`). iPadOS ignores the extension list,
    so markdown wasn't offered before.
  - `src-tauri/Info.ios.plist` imports the markdown type (`.md`, `.markdown`, conforming
    to plain text) and sets `LSSupportsOpeningDocumentsInPlace`: the app opens the
    original file, not a copy, so edits and highlights land in iCloud.
- **Access to the opened file:** iPadOS grants it through the URL object, but Tauri passes
  only the path on. The iPad plugin wraps the app delegate's `application(_:open:options:)`
  (`OpenedDocuments` in `IpadFilesPlugin.swift`): it starts access and stores a bookmark
  under the path, as for a picked file. Tauri's `Opened` event then reaches the page
  through the existing `open-files` flow, and `access(path)` reopens it on later launches.
  The plugin is created before the app delegate exists, so the wrap is installed at
  `didFinishLaunching`, which still comes before a launch-time URL.
- **Verified in the simulator** (Files → long-press → Share → pretty-markdown):
  - offered for both `.pdf` and `.md`;
  - while running: the PDF opens as a new tab;
  - from a cold start: the session's tabs restore and the shared note opens as a new tab,
    with math rendered;
  - the tab's path is the original file in Files storage (no Inbox copy), and the hook
    stores its bookmark.
- **Verified on the iPad** (2026-10-10), where the sandbox is enforced: files shared from
  iCloud Drive open, and reopen after a force-quit.

## Phase D: Touch and iPad UX (in progress)

- ✅ **Tabs and tab groups by touch** (2026-10-10). On iPad a long-press sent no
  `contextmenu`, so the tab menu (Add to group, Group tabs by folder) never opened, and a
  tab drag was taken over by the strip's own scrolling (`pointercancel`). Now it works like
  Safari's tabs on iPad (`TabBar.tsx`):
  - **tap** opens a tab, and **swipe** scrolls the strip (it no longer activates the tab
    under the finger);
  - **hold** (450 ms) opens the tab's menu, or a group chip's editor;
  - **hold and drag** moves a tab (into or out of groups) or a whole group; the menu
    closes as the drag starts, and the strip doesn't scroll meanwhile (a non-passive
    `touchmove`);
  - mouse and trackpad are unchanged.
  - Tested: 5 app tests (`App.tabs.test.tsx`), and in the iPad simulator with real touches
    — hold → menu → Group tabs by folder; hold-drag a PDF into another group; hold the
    chip → editor; tap the chip → collapse.
- ✅ **Text selection and highlighting by touch** in PDFs: see docs/PDF_HIGHLIGHTS_PLAN.md
  (H3 and the iPad fixes).
- ✅ **Smoother PDF scrolling** (2026-10-11): page canvases up to 12 MP, so each page is
  drawn once instead of as a low-resolution copy plus a sharp part redrawn while
  scrolling. Main-thread stalls are about half. Then (2026-10-11):
  - Drawn pages are bounded to the visible ones plus the pre-drawing window, freed at once
    on a zoom change (bounds memory).
  - Page canvases are CPU-backed on the iPad (2026-10-12). GPU-backed ones froze the page
    for ~75 ms after each page was drawn and left stale bands on screen in landscape.
    Measured on the device: stalls halved, no stale bands.
  - "Fit width" fits the typical page, not a smaller cover.

  Details in docs/PDF_PLAN.md §5.
- ✅ **No black area after switching apps or unlocking** (2026-10-26). Coming back in
  landscape, the right part of a PDF (past 1024 pt, an upright iPad's width) could stay
  black, even while scrolling, until the zoom changed.
  - Found on the device with a native probe of the views and their drawn layers. Every
    view kept its full 1366 pt frame, but the PDF scroller's last column of WebKit tiles
    (1024 to 1366) was missing. iPadOS lays a backgrounded app out at other sizes for its
    snapshots, and WebKit kept the stale coverage.
  - Changing the web view's frame didn't help; changing the scroller's size does. On
    return (`visibilitychange`, at 250 ms and 1 s) the viewer narrows the scroller by a
    pixel for one frame, without re-fitting the page.
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

## Phase F: Publish to the App Store (optional; not decided)

The free Personal Team can't publish. Publishing needs the **Apple Developer Program**
($99/year), which also gives TestFlight and 1-year development builds. Suggested order:
first TestFlight for personal use, then the App Store once Phase D is done.

**F1. Account and toolchain**
- **Enroll in the Apple Developer Program.**
  - *Individual:* fast; your legal name is shown as the seller.
  - *Organization:* needs a D-U-N-S number; takes longer.
- **Toolchain:** since 2026-04-28 App Store Connect only accepts builds made with
  **Xcode 26+ and the iPadOS 26 SDK**.
  - This Mac has Xcode 16.2 on macOS 15.1, so upgrade macOS first.
  - Xcode 26.0 needs macOS 15.6+; Xcode 26.4+ needs macOS 26.2+.
  - The deployment target can stay at iPadOS 14. Only the SDK we build against changes.
- **Re-verify after the upgrade:** check the Tauri iOS build, and the Mac build and tests,
  with the new Xcode.

**F2. Things Apple requires in the app**
- **Privacy manifest** (`PrivacyInfo.xcprivacy` in the Xcode project). Declare:
  - no tracking and no data collected;
  - the "required reason" APIs we use: `UserDefaults` (for the bookmarks; reason
    `CA92.1`), plus any that WebKit or Tauri make us declare (check Xcode's privacy
    report).
- **Export compliance:** the app uses no custom encryption. Set
  `ITSAppUsesNonExemptEncryption = NO` in Info.plist.
- **Distribution signing:** an App Store export (`--export-method app-store-connect`)
  with the paid team. `install.sh` stays for development builds.
- **Bundle ID** `com.prettymarkdown.app`: register it in the developer account. Pick a
  store name; "pretty-markdown" may need a variant if it's taken.

**F3. Review-readiness (Apple tests on real iPads)**
- **Finish Phase D first:** long-press instead of right-click, the clipped settings gear,
  safe areas and Split View, and PDF export (or hide it).
- **Hide or replace what doesn't work on iPad:**
  - *Save As* (currently it does nothing);
  - anything that mentions the Mac (⌘ shortcuts in tooltips are fine with a keyboard).
- **No crashes on first launch** with an empty session. Apple's review usually starts with
  an empty install.
- **All code is bundled.** We never download JS, which guideline 2.5.2 requires; pdf.js,
  KaTeX and MathJax ship inside the app.

**F4. Store listing (App Store Connect)**
- **Name, subtitle, description, keywords and category** (Productivity, or Developer Tools).
- **Screenshots:** 13" iPad screenshots are required. Show markdown with math, a PDF, and
  tabs.
- **Privacy policy URL:** a short "collects nothing" page, e.g. in the GitHub repo.
- **Support URL:** the repo's issues page.
- **Age rating questionnaire:** answer it; the app should rate 4+.
- **Price:** free or paid.
- **App icon:** done (the 1024px full-bleed Σ from Phase E).

**F5. Ship**
1. **TestFlight internal testing:** no review, builds last 90 days.
2. **Submit for review.** Expect a day or two, and maybe a round of questions.
3. **Each update:** bump the version, then upload and submit again.

**Later, maybe: the Mac App Store.** The same membership covers it, but the Mac app would
need the App Sandbox. Its file watching, opening arbitrary paths, and session restore would
then work through security-scoped bookmarks, like the iPad version already does. Until
then, the Mac app ships as today (GitHub, `scripts/install.sh`).

## Risks

| Risk | Mitigation |
|---|---|
| WKWebView on iPadOS has a tighter canvas memory budget; large PDFs at Retina resolution could be killed | Tune pdf.js's page buffer and `maxCanvasPixels` on iPad; test with a 300-page PDF on the real device |
| iCloud files not downloaded yet | Download on open with progress (Phase B) |
| Free provisioning expires every 7 days | `ipad/install.sh` renews in one command (Phase E); data and bookmarks survive a reinstall |
| App Store review rejects touch/iPad issues | Finish Phase D before submitting; test on the real iPad and in TestFlight first |
| A change breaks the Mac build | Platform code fenced with `cfg(desktop)` / `cfg(mobile)`; Mac checks after every iPad change; macOS CI later |
