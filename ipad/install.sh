#!/usr/bin/env bash
#
# Build pretty-markdown for iPad and install it on a connected iPad.
#
#   APPLE_DEVELOPMENT_TEAM=<team id> ./ipad/install.sh [device name or id]
#
# Builds signed with a free Apple ID stop launching after 7 days (a paid team's last a
# year): run this again to renew. Your open tabs and file permissions survive a reinstall.
#
# Find your team ID in Xcode → Settings → Accounts, or with:
#   defaults read com.apple.dt.Xcode IDEProvisioningTeamByIdentifier | grep -E 'teamID|teamName' 
#
# One-time setup on the iPad: Developer Mode on (Settings → Privacy & Security; it only
# appears after a Mac has asked for developer access — opening Xcode's Devices window
# with the iPad connected does that), and after the first install trust the certificate in
# Settings → General → VPN & Device Management. Details in ipad/README.md.

set -euo pipefail

TEAM="${APPLE_DEVELOPMENT_TEAM:?Set APPLE_DEVELOPMENT_TEAM to your team ID (see the top of this script)}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT="$ROOT/src-tauri/gen/apple/pretty-markdown.xcodeproj"
PBXPROJ="$PROJECT/project.pbxproj"
IPA="$ROOT/src-tauri/gen/apple/build/arm64/pretty-markdown.ipa"
cd "$ROOT"

step() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }

# ---- Pick the iPad -------------------------------------------------------------------
step "Looking for a connected iPad"
DEVICES_JSON="$(mktemp)"
# Tauri writes the team ID into the Xcode project during the build; keep it out of git
# (only if the project had no other local changes).
restore_pbxproj=0
git diff --quiet -- "$PBXPROJ" && restore_pbxproj=1
cleanup() {
  rm -f "$DEVICES_JSON"
  if [ "$restore_pbxproj" = 1 ]; then git checkout -q -- "$PBXPROJ"; fi
}
trap cleanup EXIT
xcrun devicectl list devices --json-output "$DEVICES_JSON" >/dev/null
# Prints "<devicectl id> <hardware udid> <name>" for the requested or first connected iPad.
read -r DEVICE_ID UDID NAME < <(python3 - "$DEVICES_JSON" "${1:-}" <<'EOF'
import json, sys
devices = json.load(open(sys.argv[1]))["result"]["devices"]
wanted = sys.argv[2]
for d in devices:
    props, hw = d.get("deviceProperties", {}), d.get("hardwareProperties", {})
    name = props.get("name", "")
    if wanted and wanted not in (name, d.get("identifier"), hw.get("udid")):
        continue
    if not wanted and (hw.get("deviceType") != "iPad" or d.get("connectionProperties", {}).get("tunnelState") != "connected"):
        continue
    print(d["identifier"], hw.get("udid", ""), name.replace(" ", "_"))
    break
EOF
) || true
if [ -z "${DEVICE_ID:-}" ]; then
  echo "No connected iPad found. Connect it (cable or same Wi-Fi), unlock it, and try again." >&2
  echo "Devices seen:" >&2
  xcrun devicectl list devices >&2
  exit 1
fi
echo "Using ${NAME//_/ } ($UDID)"

build() {
  step "Building (release, signed with team $TEAM)"
  APPLE_DEVELOPMENT_TEAM="$TEAM" npx tauri ios build --target aarch64 --export-method debugging
}

install() {
  step "Installing on ${NAME//_/ }"
  xcrun devicectl device install app --device "$DEVICE_ID" "$IPA"
}

build
if output="$(install 2>&1)"; then
  echo "$output"
  step "Done. Open pretty-markdown on the iPad."
  exit 0
fi
echo "$output" >&2
if ! grep -q "cannot be installed on this device" <<<"$output"; then
  exit 1
fi

# First install on this iPad: the provisioning profile doesn't list it yet. Building for
# the specific device with registration allowed adds it to the team's profile. (That
# xcodebuild run stops at the Rust step, which needs the Tauri CLI; the registration
# happens before it.)
step "Registering this iPad with the team (first install only)"
xcodebuild -project "$PROJECT" -scheme pretty-markdown_iOS -configuration release \
  -destination "id=$UDID" -allowProvisioningUpdates -allowProvisioningDeviceRegistration \
  DEVELOPMENT_TEAM="$TEAM" build >/dev/null 2>&1 || true
build
install
step "Done. Open pretty-markdown on the iPad (first time: trust the certificate in Settings → General → VPN & Device Management)."
