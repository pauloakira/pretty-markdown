use std::path::PathBuf;

/// Read a UTF-8 text file from disk and return its contents.
///
/// This is the native side of the `FileSystem` port (see the TS `TauriFileSystem`
/// adapter). Returns a `Result` so the frontend can model failure as a value rather
/// than a thrown error.
#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(PathBuf::from(&path))
        .map_err(|e| format!("Failed to read '{path}': {e}"))
}

/// Write UTF-8 text to a file on disk (overwriting). Native side of the `FileWriter` port.
#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<(), String> {
    std::fs::write(PathBuf::from(&path), contents)
        .map_err(|e| format!("Failed to write '{path}': {e}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![read_text_file, write_text_file])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
