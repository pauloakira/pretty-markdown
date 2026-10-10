# pretty-markdown

A beautiful, fast markdown **reader and editor** built for documents with LaTeX math.

Most markdown tools treat math as an afterthought. Real formulas break, or reading feels
like working in a code editor. `pretty-markdown` aims to feel like a great PDF reader: open
a `.md` file and it renders beautifully, with robust LaTeX support and a clean editing mode
when you want it.

## Install

### Ask your AI coding agent (easiest)

Paste this into **Claude Code**, **Codex**, **Cursor**, or any coding agent that can run
commands on your computer:

```text
Install the pretty-markdown desktop app from https://github.com/pauloakira/pretty-markdown by following its INSTALL.md.
```

The agent checks what's missing (Node.js, Rust, Xcode tools), asks before installing
anything, then builds and installs the app. Chat assistants without terminal access, such
as ChatGPT or Claude on the web, can't install it for you. Give them the same prompt and
they'll walk you through the steps.

### One command (macOS / Linux)

```bash
git clone https://github.com/pauloakira/pretty-markdown.git ~/.pretty-markdown && ~/.pretty-markdown/scripts/install.sh
```

This needs Node.js 20.19+, Rust, and on macOS the Xcode Command Line Tools. The script checks
for them and tells you what's missing. On macOS the app lands in `/Applications` and opens
`.md` files. Run `~/.pretty-markdown/scripts/install.sh` again to update.

Prerequisites, Windows steps, uninstalling, and troubleshooting are in
**[INSTALL.md](INSTALL.md)**.

## Features

- **Reads like a PDF viewer.** Clean serif typography, adjustable reading width and font
  size, light/dark/system themes, and find-in-page.
- **Robust LaTeX.** KaTeX renders instantly, and MathJax takes over for anything KaTeX
  can't handle. Both `$…$`/`$$…$$` and `\(…\)`/`\[…\]` delimiters work. `\gdef` macros work
  across a whole document. A broken formula shows an inline error chip instead of breaking
  the page. Copying a formula copies its LaTeX source.
- **Edit with live preview.** A CodeMirror source pane sits next to a live preview with
  synced scrolling. Save / Save As is available, and unsaved changes are marked on the tab.
- **Reads PDFs too.** Open PDFs in the same tabs as your notes, with zoom, fit to width,
  page navigation, working links, and search (`⌘F`).
- **Highlight PDFs.** Select text and click the highlighter, or turn on highlight mode
  (`⌘⇧H`) to mark up a paper quickly, in five colours. Highlights are saved into the PDF
  itself, so Preview, the iPad and other readers see them too. Signed PDFs are left alone.
  On iPad, in highlight mode, drag a finger or the Apple Pencil across text to highlight it
  and scroll with two fingers; double-tap the Pencil (2nd generation) to toggle the mode.
- **Tabs and tab groups.** Open several documents like browser tabs. Organize them into
  Chrome-style named, colored groups that you can collapse and drag, or group them by folder
  with one click.
- **Picks up where you left off.** Your open tabs, groups, reading position, and mode come
  back on the next launch.
- **Native.** Double-click a `.md` in Finder to open it, keep a recent-files list, reload
  when a file changes on disk, and export to PDF with vector math.
- **Offline.** No network access, no account.

## Keyboard shortcuts

| Action | macOS | Windows / Linux |
|--------|-------|-----------------|
| Open a document in a new tab | `⌘T` | `Ctrl+T` |
| Close tab | `⌘W` | `Ctrl+W` |
| Next / previous tab | `⌘⇧]` / `⌘⇧[` or `Ctrl+Tab` | `Ctrl+Shift+]` / `Ctrl+Shift+[` or `Ctrl+Tab` |
| Jump to tab 1–9 | `⌘1`–`⌘9` | `Ctrl+1`–`Ctrl+9` |
| Toggle reader / editor | `⌘E` | `Ctrl+E` |
| Save / Save as | `⌘S` / `⌘⇧S` | `Ctrl+S` / `Ctrl+Shift+S` |
| Find in page | `⌘F` | `Ctrl+F` |
| Export to PDF | `⌘P` | `Ctrl+P` |
| PDF: zoom in / out / fit width | `⌘+` / `⌘−` / `⌘0` | `Ctrl++` / `Ctrl+−` / `Ctrl+0` |
| PDF: highlight mode on / off | `⌘⇧H` (`Esc` to leave) | `Ctrl+Shift+H` (`Esc` to leave) |

**Tab groups:** right-click a tab to add it to a group or *Group tabs by folder*. Click a
group's chip to collapse it, drag the chip to move the group, and right-click the chip to
rename or recolor it.

## Development

```bash
npm install        # install JS deps (Rust crates are fetched on the first tauri run)
npm run tauri dev  # run the desktop app (Vite + Tauri) with hot reload
npm run dev        # run just the web frontend (no native shell)
npm run typecheck  # tsc --noEmit
npm test           # vitest
npm run build      # type-check + bundle the frontend
npm run tauri build  # build the release app bundle
```

There's a sample document at [samples/welcome.md](samples/welcome.md) for testing math
rendering.

| Layer | Choice |
|-------|--------|
| Shell | [Tauri 2](https://tauri.app) (Rust core + web frontend) |
| Frontend | React + TypeScript |
| Editor | [CodeMirror 6](https://codemirror.net) |
| Markdown | `markdown-it` + a custom math plugin |
| Math | [KaTeX](https://katex.org) (default) → [MathJax 3](https://www.mathjax.org) (fallback) |

The code follows a layered, ports-and-adapters architecture. Start with
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (patterns, conventions, decision log), then
[DESIGN.md](DESIGN.md) (product design and render pipeline), [ROADMAP.md](ROADMAP.md)
(milestones), and [diagram/](diagram/) (UML).

## License

[MIT](LICENSE) © 2026 Paulo Akira
