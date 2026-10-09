# pretty-markdown for iPad

The iPad version is **the same app**, not a copy. It's built from the same React code and
Rust core for Tauri's iOS target. Tauri generates the Xcode project in
[`src-tauri/gen/apple`](../src-tauri/gen/apple), where it requires it to be. This folder
holds the iPad plan, notes and helper scripts.

- **Status and roadmap:** [PLAN.md](PLAN.md)
- **Install target:** personal use on your own iPad with a **free Apple ID**. No App
  Store, no paid developer account.

> The Mac app is unaffected by the iPad work. Platform-specific Rust is fenced with
> `#[cfg(desktop)]` / `#[cfg(mobile)]`, so the macOS build compiles exactly what it did
> before. Always check the Mac build (`npm test`, `cd src-tauri && cargo check`) after an
> iPad change.

## Prerequisites (one time)

- Xcode (with the iPadOS simulator runtimes)
- Rust iOS targets:
  ```bash
  rustup target add aarch64-apple-ios aarch64-apple-ios-sim
  ```
- `npx tauri ios init` has already been run (the generated project is committed). It
  installs XcodeGen and libimobiledevice via Homebrew if they're missing.

## Run in the simulator

Simulator names repeat across iOS versions (e.g. two "iPad Air (5th generation)"), and
Tauri picks the first match. Use a uniquely named simulator, created once:

```bash
xcrun simctl create "pretty-markdown iPad" com.apple.CoreSimulator.SimDeviceType.iPad-Air-13-inch-M2 com.apple.CoreSimulator.SimRuntime.iOS-18-3
```

Then run (port 1431, so it can run alongside the Mac dev app on 1420):

```bash
npx tauri ios dev "pretty-markdown iPad" --config '{"build":{"devUrl":"http://localhost:1431","beforeDevCommand":"npx vite --port 1431 --strictPort"}}'
```

The first build compiles all Rust crates for iOS and takes a few minutes. Later builds are
fast, and editing Rust rebuilds and redeploys automatically.

To get test files into the simulator, copy them into its **On My iPad** folder. That's the
`File Provider Storage` directory of the `group.com.apple.FileProvider.LocalStorage` app
group under `~/Library/Developer/CoreSimulator/Devices/<udid>/data/Containers/Shared/AppGroup/`.

## Install on your iPad (free Apple ID)

### One-time setup

1. In Xcode → **Settings → Accounts**, sign in with your Apple ID. That creates your free
   **Personal Team**. Its ID is the `teamID` next to "(Personal Team)" in:
   ```bash
   defaults read com.apple.dt.Xcode IDEProvisioningTeamByIdentifier | grep -E 'teamID|teamName'
   ```
2. Connect the iPad by cable and unlock it. **Developer Mode** (Settings → Privacy &
   Security) only appears after a Mac has asked the iPad for developer access. Opening
   Xcode's **Window → Devices and Simulators** with the iPad connected does that, as does:
   ```bash
   xcrun devicectl device info ddiServices --device "<iPad name>"
   ```
   Turn Developer Mode on; the iPad restarts.

### Install and renew

```bash
APPLE_DEVELOPMENT_TEAM=<your team id> ./ipad/install.sh
```

[`install.sh`](install.sh):
1. Finds the connected iPad. To pick a device, pass its name or id as an argument.
2. Builds a release `.ipa` signed with your team.
3. Installs it with `devicectl`.

On the first install it also registers the iPad with your team. It also keeps your team ID
out of the committed Xcode project.

After the **first** install, trust the certificate on the iPad: **Settings → General → VPN
& Device Management** → your Apple ID → Trust.

**Free-account limits:** the app stops launching **7 days** after it was built. Run the
script again to renew; your tabs, files and their permissions survive a reinstall. At most
3 such apps per device.

**App icon:** iPadOS wants an opaque, full-bleed icon (it rounds the corners itself), so
the iOS icon set is generated from [`app-icon-ios.svg`](../src-tauri/app-icon-ios.svg). That
file has the same Σ design as the Mac's `app-icon.svg`, but without the transparent margin
and rounded corners. To regenerate it without touching the Mac icons, see PLAN.md, Phase E.
