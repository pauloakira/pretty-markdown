// No commands are exposed to the webview: the app's own Rust file commands call this
// plugin directly (see src/lib.rs), so there's nothing to grant in capabilities.
const COMMANDS: &[&str] = &[];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).ios_path("ios").build();
}
