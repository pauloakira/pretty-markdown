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

*Not done yet; see PLAN.md, Phase E. Expected steps:*

1. In Xcode, open `src-tauri/gen/apple/pretty-markdown.xcodeproj`, go to **Signing &
   Capabilities**, and choose your **Personal Team** (sign in with your Apple ID).
2. On the iPad, go to **Settings → Privacy & Security → Developer Mode** and turn it on
   (it restarts).
3. Connect the iPad, or use the same network with pairing enabled, then build and install.
4. On the iPad, go to **Settings → General → VPN & Device Management** and trust your
   developer certificate.

**Free-account limits:** the app stops launching **after 7 days** and has to be
reinstalled from the Mac (your files and data stay). At most 3 such apps per device.
