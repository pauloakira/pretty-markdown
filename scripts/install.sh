#!/usr/bin/env bash
#
# Build pretty-markdown from source and install it.
#
#   ./scripts/install.sh [--dir <path>] [--dest <path>] [--no-open]
#
# Run it from a checkout of the repo, or from anywhere: it then clones the repo into
# --dir (default ~/.pretty-markdown) and updates that clone on later runs.
#
# macOS: installs pretty-markdown.app into --dest (default /Applications, falling back to
# ~/Applications if that isn't writable), registers it for .md files, and opens it.
# Linux: builds .deb and AppImage bundles and prints where they are (not installed).
#
# It doesn't install toolchains; it checks for them and says what's missing.
# See INSTALL.md for prerequisites and troubleshooting.

set -euo pipefail

REPO_URL="${PRETTY_MARKDOWN_REPO:-https://github.com/pauloakira/pretty-markdown.git}"
APP_NAME="pretty-markdown"
CLONE_DIR="$HOME/.pretty-markdown"
DEST=""
OPEN_AFTER=1
DIR_GIVEN=0

usage() {
  sed -n '3,15p' "$0" | sed 's/^# \{0,1\}//'
}

while [ $# -gt 0 ]; do
  case "$1" in
    --dir) CLONE_DIR="$2"; DIR_GIVEN=1; shift 2 ;;
    --dest) DEST="$2"; shift 2 ;;
    --no-open) OPEN_AFTER=0; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1 (see --help)" >&2; exit 2 ;;
  esac
done

step() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
fail() { printf '\n\033[31mError:\033[0m %s\n' "$*" >&2; exit 1; }

# ---- Platform ----------------------------------------------------------------
case "$(uname -s)" in
  Darwin) OS=macos ;;
  Linux) OS=linux ;;
  *) fail "This script supports macOS and Linux. On Windows, follow INSTALL.md." ;;
esac

# ---- Prerequisites -------------------------------------------------------------
step "Checking prerequisites"
missing=()

have() { command -v "$1" >/dev/null 2>&1; }

# Is version $1 >= $2? (dotted numbers)
version_ge() {
  [ "$(printf '%s\n%s\n' "$2" "$1" | sort -t. -k1,1n -k2,2n -k3,3n | head -n1)" = "$2" ]
}

have git || missing+=("git")

if have node; then
  node_version="$(node -v | sed 's/^v//')"
  # Vite 7 needs Node ^20.19 or >=22.12.
  if ! { version_ge "$node_version" "22.12.0" || { [ "${node_version%%.*}" = "20" ] && version_ge "$node_version" "20.19.0"; }; }; then
    missing+=("Node.js 20.19+ or 22.12+ (found $node_version)")
  fi
else
  missing+=("Node.js 20.19+ or 22.12+")
fi
have npm || missing+=("npm")
{ have cargo && have rustc; } || missing+=("Rust toolchain (cargo, rustc) — https://rustup.rs")

if [ "$OS" = macos ]; then
  xcode-select -p >/dev/null 2>&1 || missing+=("Xcode Command Line Tools — run: xcode-select --install")
else
  if ! have pkg-config || ! pkg-config --exists webkit2gtk-4.1 2>/dev/null; then
    missing+=("WebKitGTK 4.1 and Tauri's Linux build deps — https://tauri.app/start/prerequisites/#linux")
  fi
fi

if [ ${#missing[@]} -gt 0 ]; then
  printf 'Missing:\n' >&2
  printf '  - %s\n' "${missing[@]}" >&2
  fail "Install the items above, then run this script again (details in INSTALL.md)."
fi
echo "git, Node $(node -v), npm $(npm -v), $(rustc --version | cut -d' ' -f1-2) — OK"

# ---- Source --------------------------------------------------------------------
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
checkout="$(cd "$script_dir/.." && pwd)"

if [ "$DIR_GIVEN" = 0 ] && [ -f "$checkout/package.json" ] && grep -q '"name": "pretty-markdown"' "$checkout/package.json"; then
  SRC="$checkout"
  step "Using this checkout: $SRC"
elif [ -d "$CLONE_DIR/.git" ]; then
  SRC="$CLONE_DIR"
  step "Updating $SRC"
  git -C "$SRC" pull --ff-only
else
  SRC="$CLONE_DIR"
  step "Cloning $REPO_URL into $SRC"
  git clone --depth 1 "$REPO_URL" "$SRC"
fi
cd "$SRC"

# ---- Build ---------------------------------------------------------------------
step "Installing JavaScript dependencies"
npm ci --no-audit --no-fund

step "Building the app (the first build compiles Rust crates and takes a few minutes)"
if [ "$OS" = macos ]; then
  npx --no-install tauri build --bundles app
else
  npx --no-install tauri build --bundles deb,appimage
fi

bundle_dir="$SRC/src-tauri/target/release/bundle"

# ---- Install -------------------------------------------------------------------
if [ "$OS" = linux ]; then
  step "Built"
  find "$bundle_dir" -maxdepth 2 \( -name '*.deb' -o -name '*.AppImage' \) -print
  echo
  echo "Install the .deb with:  sudo apt install ./<file>.deb"
  echo "or run the AppImage directly (chmod +x it first)."
  exit 0
fi

built="$bundle_dir/macos/$APP_NAME.app"
[ -d "$built" ] || fail "Build finished but $built is missing."

if [ -z "$DEST" ]; then
  DEST="/Applications"
  [ -w "$DEST" ] || DEST="$HOME/Applications"
fi
mkdir -p "$DEST"
target="$DEST/$APP_NAME.app"

if pgrep -xq "$APP_NAME"; then
  echo "Note: $APP_NAME is running — quit and reopen it to use the new version."
fi

step "Installing to $target"
rm -rf "$target"
ditto "$built" "$target"

# Register with Launch Services so Finder offers it for .md files ("Open With").
lsregister="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"
[ -x "$lsregister" ] && "$lsregister" -f "$target" || true

step "Done — $APP_NAME is installed at $target"
echo "Tip: right-click a .md file → Get Info → Open with: $APP_NAME → Change All… to make it the default."

if [ "$OPEN_AFTER" = 1 ]; then
  open "$target"
fi
