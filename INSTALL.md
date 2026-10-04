# Installing pretty-markdown

pretty-markdown is built from source. There are no prebuilt downloads yet. These steps work
for a person or an AI coding agent. **macOS** is the primary, tested platform. Linux and
Windows builds use the same toolchain but are untested.

> **For AI agents:** do the steps in order and run each command yourself. Ask the user
> before you install a missing toolchain, since it changes their system. Ask again before
> any step that needs `sudo` or an admin password. Don't skip the checks in step 1.

## 1. Check prerequisites

| Tool | Version | Check | Install (if missing) |
|------|---------|-------|----------------------|
| git | any | `git --version` | macOS: comes with the Xcode Command Line Tools |
| Node.js | 20.19+ or 22.12+ | `node -v` | <https://nodejs.org> (LTS), or `brew install node` |
| Rust | stable | `cargo -V && rustc -V` | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` then restart the shell |
| macOS only: Xcode Command Line Tools | — | `xcode-select -p` | `xcode-select --install` (opens a system dialog) |
| Linux only: WebKitGTK 4.1 + build deps | — | `pkg-config --exists webkit2gtk-4.1` | See [Tauri's Linux prerequisites](https://tauri.app/start/prerequisites/#linux) |
| Windows only: WebView2 + MSVC build tools | — | — | See [Tauri's Windows prerequisites](https://tauri.app/start/prerequisites/#windows) |

## 2. Build and install

### macOS and Linux: one command

```bash
git clone https://github.com/pauloakira/pretty-markdown.git ~/.pretty-markdown
~/.pretty-markdown/scripts/install.sh
```

The script checks the prerequisites again, runs `npm ci`, builds the app, and then:

- **macOS:** installs `pretty-markdown.app` into `/Applications`, or into `~/Applications`
  if `/Applications` isn't writable. It registers the app for `.md` files and opens it.
- **Linux:** builds a `.deb` and an AppImage and prints where they are. Install the `.deb`
  with `sudo apt install ./<file>.deb`, or `chmod +x` the AppImage and run it.

The first build compiles the Rust dependencies and takes a few minutes. Later builds are
much faster.

Options: `--dest <dir>` installs somewhere else (macOS). `--no-open` skips launching the
app. `--dir <dir>` clones into a different folder when you run the script from outside a
checkout.

### Windows: manual

```powershell
git clone https://github.com/pauloakira/pretty-markdown.git
cd pretty-markdown
npm ci
npx tauri build --bundles msi
```

Then run the installer from `src-tauri\target\release\bundle\msi\`.

## 3. Verify

- **macOS:** `ls /Applications/pretty-markdown.app` (or `~/Applications/...`) shows the
  app, and it opens to a welcome screen with an **Open a document** button.
- Open [`samples/welcome.md`](samples/welcome.md) from the clone. Its formulas should render
  as typeset math, not as raw `$...$`.

## Updating

Run the same command again. It pulls the latest `main` into `~/.pretty-markdown`, rebuilds,
and replaces the installed app. Quit the app first, or restart it afterwards.

```bash
~/.pretty-markdown/scripts/install.sh
```

## Make it the default for `.md` files (macOS)

In Finder, right-click any `.md` file → **Get Info** → **Open with:** pretty-markdown →
**Change All…**

## Uninstall (macOS)

```bash
rm -rf /Applications/pretty-markdown.app ~/Applications/pretty-markdown.app
rm -rf ~/.pretty-markdown                                           # the source clone
rm -rf ~/Library/Application\ Support/com.prettymarkdown.app       # saved tabs/session
```

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `xcrun: error: invalid active developer path` | Install the Xcode Command Line Tools: `xcode-select --install` |
| `cargo: command not found` right after installing Rust | Open a new terminal, or run `source "$HOME/.cargo/env"` |
| Vite complains about the Node version | Upgrade Node to 20.19+ or 22.12+ |
| `git clone` asks for a username/password | Use a GitHub account that can see the repository, or clone over SSH: `git clone git@github.com:pauloakira/pretty-markdown.git ~/.pretty-markdown` |
| macOS says the app "can't be opened" | That only happens to copies downloaded from elsewhere. Builds made on your own Mac aren't quarantined. Right-click the app → **Open** once |
