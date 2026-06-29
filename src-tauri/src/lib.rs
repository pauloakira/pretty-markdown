use std::path::PathBuf;
use tauri::Manager;

/// Path to the persisted session file in the app's config directory.
fn session_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("No config dir: {e}"))?;
    Ok(dir.join("session.json"))
}

/// Read the saved session JSON, or `None` if there is no saved session.
#[tauri::command]
fn read_session(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let path = session_path(&app)?;
    match std::fs::read_to_string(&path) {
        Ok(contents) => Ok(Some(contents)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("Failed to read session: {e}")),
    }
}

/// Write the session JSON (creating the config directory if needed).
#[tauri::command]
fn write_session(app: tauri::AppHandle, contents: String) -> Result<(), String> {
    let path = session_path(&app)?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| format!("Failed to create config dir: {e}"))?;
    }
    std::fs::write(&path, contents).map_err(|e| format!("Failed to write session: {e}"))
}

/// Remove the saved session (used when the user opts not to restore tabs).
#[tauri::command]
fn clear_session(app: tauri::AppHandle) -> Result<(), String> {
    let path = session_path(&app)?;
    match std::fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(format!("Failed to clear session: {e}")),
    }
}

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
        .invoke_handler(tauri::generate_handler![
            read_text_file,
            write_text_file,
            read_session,
            write_session,
            clear_session
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
