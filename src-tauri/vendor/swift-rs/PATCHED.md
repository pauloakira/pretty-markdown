# swift-rs 1.0.9, patched

This is swift-rs 1.0.9 from crates.io with one change, in `src-rs/build.rs`
(search for "pretty-markdown patch").

**Why:** on Xcode 27, SwiftPM makes `@_cdecl` functions local in static
archives. swift-rs 1.0.9 makes each package's own functions global again, but
not those of its `SwiftRs` helper module, which every archive embeds. Nothing
then exports `retain_object`, `release_object` and `string_from_bytes`, and the
iOS app fails to link with "Undefined symbols". The patch exports them from
Tauri's archive only, so there's exactly one global copy.

It's used through `[patch.crates-io]` in `src-tauri/Cargo.toml`. Remove both
once a swift-rs release fixes this upstream.
