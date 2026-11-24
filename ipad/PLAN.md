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
  - Changing the web view's frame didn't help; changing the scroller's size does. The
    scroller is narrowed by a pixel for one frame (at 250 ms and 1 s), without re-fitting
    the page (`src/presentation/webkit/retile.ts`, touch devices only).
  - When: the page becoming visible again, and every new scroller appearing. A PDF
    opened after a return started out with the same missing column. Used by the PDF
    viewer and the markdown reader.
- ✅ **Pinch to zoom** in PDFs (2026-11-23), `src/infrastructure/pdf/pinchZoom.ts`.
  - The pages grow or shrink under the fingers, anchored between them, and follow them as
    they move; pdf.js redraws them sharp 400 ms after the last change. 25%–400%, as the
    toolbar.
  - Ending within 6% of the fit-width scale snaps to Fit width (the toolbar's Fit width
    lights up again, and the page keeps fitting on rotation or Split View).
  - iPadOS's own pinch zoomed the whole app; it's off over the pages (`touch-action:
    pan-x pan-y`, gesture events cancelled). Works in highlight mode too.
  - On the Mac, a trackpad pinch does the same (gesture events, or ctrl+wheel).
  - Tested: unit tests, and in the simulator with real two-finger touches — 121% → 241%
    anchored at the fingers, back to Fit width by the snap, out to 60% without one, in
    highlight mode, and one-finger scrolling unchanged.
- ✅ **Touch targets** (2026-11-23): every control a finger taps is hit across at least
  44×44 pt (Apple's minimum), on touch screens only (`@media (pointer: coarse)`, the
  "Touch targets" block at the end of theme.css); the Mac is unchanged, size for size.
  - Tab bar 44 pt tall, with a 28 pt close button hit across 44; + and the gear 44 wide.
  - Document toolbar 48 pt with 36 pt controls, each hit across 46 pt by a `::after`
    reaching past it (segmented groups no longer clip their segments to allow it). The
    narrow-window steps start wider to match, and in Slide Over (≤ 400 pt) the page field
    goes and the bar tightens; checked at 320–1366 pt with nothing past the edge.
  - Menus, the selection's actions, the Notes panel's footer and "Add a note" rows.
  - **Quote cards' actions** (Colour, Copy, Delete) only showed on hover. On a touch
    screen each card has a ⋯ button that opens them as 44 pt buttons; choosing a colour
    or touching elsewhere closes it.
  - Measured with an audit that probes what a touch at each point would hit
    (`elementFromPoint`), not just the drawn size; tried in the simulator (toolbar, ⋯ →
    Colour → green saved, touch elsewhere closes).
- ✅ **Settings gear, landscape and Split View** (2026-11-23).
  - The gear was the "⚙" character, drawn on iPadOS as an emoji wider than its 38 px
    button, so it was cut off at the tab bar's edge. It's now a drawn icon
    (`SettingsIcon`), the same on every platform, in the tab bar and on the welcome screen.
  - The document toolbar is a container (`container: doctoolbar`) and compacts itself as
    the window narrows instead of running off the edge (a PDF's needed ~750 px, so in
    portrait Split View and Slide Over its right half was unreachable):
    - ≤ 860 px: the document's name goes (the tab shows it);
    - ≤ 760 px: Add to notes, Highlight and Fit width become icons (names kept for
      VoiceOver and tooltips);
    - ≤ 560 px: zoom; ≤ 470 px: the page count; ≤ 400 px: Undo/Redo; ≤ 340 px: Fit
      width (pinch and ⌘+/⌘−/⌘0 still zoom, ⌘Z still undoes);
    - a markdown document's toolbar drops its name at ≤ 380 px; the contents button
      never shrinks.
  - Checked in WebKit at 320, 375, 507, 694, 1024 and 1366 px (nothing past the edge),
    and in the simulator in portrait and landscape (safe areas respected: nothing under
    the status bar or the home indicator).
  - Still to do: the Notes panel beside the page is too narrow in Split View; it should
    become a sheet there (the R3 bottom-sheet card).
- ✅ **Add to notes by the selection** (2026-11-23): the selection popover (colours, Add to
  notes, Copy as quote) now shows on the iPad too, below the selection and its end handle,
  under iPadOS's own menu. Tried in the simulator: long-press → Add to notes; drag a
  handle → Add to notes (two words); long-press → green. Details in
  docs/RESEARCH_READER.md, "The selection popover".
- ✅ **Hardware keyboard (Magic Keyboard)** (2026-11-23). Verifying found they didn't work:
  - Reading a page (no text field focused), *no* key reached the page: iPadOS sends
    hardware keys to UIKit's key commands, and no view was first responder. With a field
    focused, plain keys arrived but iPadOS kept several ⌘ combinations (⌘F, ⌘E, ⌘=, ⌘2,
    ⌘⇧L…). Arrows, Space and Page Down didn't scroll: WebKit scrolls the outer page with
    them, and documents scroll inside their own scroller.
  - Now the page hands its shortcut list (`presentation/keyboard/shortcuts.ts`, the
    shortcuts for what's showing) to the plugin, which registers each as a `UIKeyCommand`
    on the web view's controller with priority over the system (KeyCommands.swift). A
    press comes back and is played to the page as its keydown, so the handlers are the
    Mac's. Titles show in the overlay iPadOS shows while ⌘ is held.
  - Reading keys (↑ ↓, Space, ⇧Space, Page Up/Down, Home/End, ⌘↑/⌘↓) scroll the document;
    they and ⌘Z are left to a text field while one is being edited.
  - ⌘Z / ⌘⇧Z undo and redo highlights outside highlight mode too (the Mac as well).
  - Tested with real hardware-key events in the simulator (a throwaway XCUITest runner,
    `typeKey`) and a probe logging each key and the app's state: every ⌘ shortcut in the
    list reached its handler and did its job, reliably (15/15 for the zoom and undo keys,
    10/10 straight after a tap on the page); typing in the find field (letters, Space)
    stays the field's; ↓ ↓, Page Down and Home scrolled (simulator `press_key`).
  - Not verified: Escape (no tool here sends it; the page side is unit-tested), and a real
    iPad. In the simulator the first ⌘ press after the test runner brings the app forward
    was sometimes dropped (likely the simulator connecting its keyboard) — check on a device.
- ✅ **A tidy Recent list** (2026-11-24). It showed full container paths (some as
  `file://` URLs, the leading slash drawn at the end by the right-to-left truncation),
  the same file twice, and a temporary "Open in" copy that failed with a raw "No such
  file" error.
  - Each entry shows where the file is, as Files names it: "iCloud Drive › Papers",
    "On My iPad › Papers", "Temporary copy" for copies handed over by another app, and
    "~/Documents/…" on the Mac (`recentLocation` in `domain/values/RecentFile.ts`).
  - One entry per file: a `file://` URL and its path, or `/private/var/…` and `/var/…`,
    are the same file. Stored URLs become paths, so they open as the same tab and name.
  - A file that isn't there any more says so plainly ("'Old copy.pdf' isn't there any
    more. It may have been moved, renamed or deleted.") and leaves Recent. Other errors
    (no permission, say) leave the entry alone. A Clear button empties the list.
  - Tested in the simulator with an old-style list planted by a probe: the four entries
    showed as three with readable locations; the deleted copy gave the message and left
    the list; the entry saved as a `file://` URL opened as "VEM paper.pdf"; a session tab
    saved as a URL restored under its name; Clear emptied the list.
- ✅ **Export PDF and Save As** (2026-11-23). Both did nothing on the iPad.
  - **Export PDF** opens the system print sheet: WKWebView on iOS ignores
    `window.print()`, so the page asks the plugin (`printPage`, with the web view's print
    formatter). The print stylesheet applies as on the Mac, so only the document prints,
    maths as vector. The sheet's share button saves or sends the PDF, named after the
    document without ".md".
  - **Save As** (⇧⌘S) opens the Files "Save" sheet (`exportFile`): the plugin writes the
    text to a temporary file and exports a copy where the reader chooses. The new file is
    remembered (bookmark) like a picked one, so the tab keeps editing it, Save writes
    there, and it reopens after a relaunch. Copy mode shows "Save"; moving the temporary
    file would show "Move".
  - Tested in the simulator: the print preview shows only the document, Save to Files is
    offered; Save As into On My iPad, an edit saved to the new file (the original
    untouched), relaunch reopens it, Cancel changes nothing.

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

## Phase F: Publish to the App Store (decided 2026-11-23: the iPad only)

**Decision:** the iPad app goes to the App Store; the Mac app stays free on GitHub
(`scripts/install.sh`), outside the Mac App Store. The work is tracked on the board as
"App Store: …" and "iPad: …" cards.

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
- ✅ **Privacy manifest** (2026-11-23): `src-tauri/gen/apple/pretty-markdown_iOS/PrivacyInfo.xcprivacy`,
  a resource of the app target (added to `project.pbxproj` by hand: regenerating with
  XcodeGen also picks up local build products under `Externals/` and rewrites
  Info.plist). It declares:
  - no tracking and no data collected;
  - the "required reason" APIs found with `nm -u` on the built binary: `UserDefaults`
    (the bookmarks; `CA92.1`) and `stat`/`fstat`/`lstat` (Rust's file metadata) as file
    timestamps (`3B52.1` for files the reader picked, `C617.1` for the app's container).
    No boot-time or disk-space APIs. **Re-run the check before each submission** when
    dependencies change:
    `nm -u <app>/pretty-markdown | grep -E '_(f?l?stat|fstatat|getattrlist.*|f?statv?fs|mach_absolute_time)$|NSUserDefaults'`.
- ✅ **Export compliance** (2026-11-23): `ITSAppUsesNonExemptEncryption = NO` in
  `src-tauri/Info.ios.plist` (merged into the iOS Info.plist only).
- **Version and build numbers:** `CFBundleShortVersionString` is the app's version
  (`tauri.conf.json`). Each upload needs a higher `CFBundleVersion` (one to three integers);
  the upload script will set `bundle.iOS.bundleVersion` to the commit count
  (`git rev-list --count HEAD`), which only grows. Not `tauri ios build --build-number`,
  which appends to the version.
- **Distribution signing:** an App Store export (`--export-method app-store-connect`)
  with the paid team. `install.sh` stays for development builds.
- **Bundle ID** `com.prettymarkdown.app`: register it in the developer account. Pick a
  store name; "pretty-markdown" may need a variant if it's taken.

**F3. Review-readiness (Apple tests on real iPads)**
- **Finish Phase D first:** long-press instead of right-click; the Notes panel in Split
  View.
- **Hide or replace what doesn't work on iPad:**
  - ✅ *Save As* and *Export PDF* work (Phase D, 2026-11-23);
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
