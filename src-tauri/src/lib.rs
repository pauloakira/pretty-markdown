#[cfg(desktop)]
use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{Emitter, Manager};

/// Quit for real. Called by the frontend once the user has answered the quit prompt.
#[tauri::command]
fn exit_app(app: tauri::AppHandle) {
    app.exit(0);
}

/// Menu id of our replacement for the app menu's Quit item.
#[cfg(desktop)]
const QUIT_MENU_ID: &str = "pm-quit";

/// Install Tauri's default menu with one change: the app menu's built-in Quit item is
/// swapped for our own ⌘Q item.
///
/// The built-in item calls `-[NSApp terminate:]`, and tao doesn't implement the cancellable
/// `applicationShouldTerminate:`, so that path exits immediately with no chance to show the
/// "reopen tabs?" prompt. Our item instead emits `quit-requested` to the frontend. Every
/// other item (notably the Edit menu, which macOS uses to route ⌘C/⌘V/⌘Z into the
/// webview) is left untouched.
#[cfg(target_os = "macos")]
fn install_menu(app: &tauri::AppHandle) -> tauri::Result<()> {
    use tauri::menu::{Menu, MenuItem, MenuItemKind};

    let menu = Menu::default(app)?;
    if let Some(MenuItemKind::Submenu(app_menu)) = menu.items()?.into_iter().next() {
        for item in app_menu.items()? {
            if let MenuItemKind::Predefined(predefined) = &item {
                if predefined.text()?.starts_with("Quit") {
                    app_menu.remove(&item)?;
                }
            }
        }
        let quit = MenuItem::with_id(
            app,
            QUIT_MENU_ID,
            format!("Quit {}", app.package_info().name),
            true,
            Some("CmdOrCtrl+Q"),
        )?;
        app_menu.append(&quit)?;
    }
    app.set_menu(menu)?;
    Ok(())
}

/// Watches open files and emits `file-changed` when they change on disk (desktop only).
#[cfg(desktop)]
struct FileWatcher(Mutex<RecommendedWatcher>);

#[cfg(desktop)]
#[tauri::command]
fn watch_file(state: tauri::State<FileWatcher>, path: String) -> Result<(), String> {
    state
        .0
        .lock()
        .unwrap()
        .watch(Path::new(&path), RecursiveMode::NonRecursive)
        .map_err(|e| e.to_string())
}

#[cfg(desktop)]
#[tauri::command]
fn unwatch_file(state: tauri::State<FileWatcher>, path: String) -> Result<(), String> {
    match state.0.lock().unwrap().unwatch(Path::new(&path)) {
        Ok(()) => Ok(()),
        // Unwatching a path that isn't watched is fine.
        Err(notify::Error {
            kind: notify::ErrorKind::WatchNotFound,
            ..
        }) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

/// iOS/iPadOS has no file watching: accept and ignore, so the frontend works unchanged.
#[cfg(mobile)]
#[tauri::command]
fn watch_file(path: String) -> Result<(), String> {
    let _ = path;
    Ok(())
}

#[cfg(mobile)]
#[tauri::command]
fn unwatch_file(path: String) -> Result<(), String> {
    let _ = path;
    Ok(())
}

/// Files requested via the OS (double-click / `open`) that arrived before the frontend
/// was ready to receive them. Drained by `take_pending_files`.
#[derive(Default)]
struct PendingFiles(Mutex<Vec<String>>);

/// Drain and return files queued for opening (called once by the frontend on launch).
#[tauri::command]
fn take_pending_files(state: tauri::State<PendingFiles>) -> Vec<String> {
    let mut files = state.0.lock().unwrap();
    std::mem::take(&mut *files)
}

/// Buffer opened files and notify the frontend (which may already be listening).
fn dispatch_opened(app: &tauri::AppHandle, paths: Vec<String>) {
    if paths.is_empty() {
        return;
    }
    if let Some(state) = app.try_state::<PendingFiles>() {
        state.0.lock().unwrap().extend(paths.clone());
    }
    let _ = app.emit("open-files", paths);
}

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
    std::fs::read_to_string(file_path(&path)).map_err(|e| format!("Failed to read '{path}': {e}"))
}

/// A filesystem path from what the frontend passes: a plain path (desktop), or a
/// `file://` URL, which is what the iOS/iPadOS document picker returns.
fn file_path(path: &str) -> PathBuf {
    if path.starts_with("file://") {
        if let Some(local) = tauri::Url::parse(path)
            .ok()
            .and_then(|u| u.to_file_path().ok())
        {
            return local;
        }
    }
    PathBuf::from(path)
}

/// Read a file's raw bytes — all of them, or only the first `max_bytes` (enough to check a
/// signature without reading a large file). Native side of `FileReader.readBytes`.
///
/// Returns a raw IPC response, which reaches the frontend as an `ArrayBuffer`: no JSON
/// array of numbers or base64, so even large PDFs cross the bridge cheaply.
#[tauri::command]
fn read_file_bytes(path: String, max_bytes: Option<u64>) -> Result<tauri::ipc::Response, String> {
    let mut file = std::fs::File::open(file_path(&path))
        .map_err(|e| format!("Failed to read '{path}': {e}"))?;
    let mut bytes = Vec::new();
    match max_bytes {
        Some(limit) => file.take(limit).read_to_end(&mut bytes),
        None => file.read_to_end(&mut bytes),
    }
    .map_err(|e| format!("Failed to read '{path}': {e}"))?;
    Ok(tauri::ipc::Response::new(bytes))
}

/// Write UTF-8 text to a file on disk (overwriting). Native side of the `FileWriter` port.
#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<(), String> {
    std::fs::write(file_path(&path), contents).map_err(|e| format!("Failed to write '{path}': {e}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(PendingFiles::default());

    // Menus are desktop-only (iPadOS apps have none); this is the ⌘Q item from install_menu.
    #[cfg(desktop)]
    let builder = builder.on_menu_event(|app, event| {
        if event.id() == QUIT_MENU_ID {
            let _ = app.emit("quit-requested", ());
        }
    });

    builder
        .invoke_handler(tauri::generate_handler![
            read_text_file,
            read_file_bytes,
            write_text_file,
            read_session,
            write_session,
            clear_session,
            take_pending_files,
            exit_app,
            watch_file,
            unwatch_file
        ])
        .setup(|app| {
            // Files passed on the command line (CLI / Windows / Linux file-association launch).
            let args: Vec<String> = std::env::args()
                .skip(1)
                .filter(|a| !a.starts_with('-'))
                .filter(|a| Path::new(a).exists())
                .collect();
            if !args.is_empty() {
                if let Some(state) = app.try_state::<PendingFiles>() {
                    state.0.lock().unwrap().extend(args);
                }
            }

            // A single watcher for all open files; emits changed paths to the frontend.
            #[cfg(desktop)]
            {
                let handle = app.handle().clone();
                let watcher =
                    notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
                        if let Ok(event) = res {
                            if matches!(
                                event.kind,
                                EventKind::Modify(_) | EventKind::Create(_) | EventKind::Remove(_)
                            ) {
                                let paths: Vec<String> = event
                                    .paths
                                    .iter()
                                    .map(|p| p.to_string_lossy().into_owned())
                                    .collect();
                                if !paths.is_empty() {
                                    let _ = handle.emit("file-changed", paths);
                                }
                            }
                        }
                    })
                    .map_err(|e| e.to_string())?;
                app.manage(FileWatcher(Mutex::new(watcher)));
            }

            #[cfg(target_os = "macos")]
            install_menu(app.handle())?;

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|app, event| match event {
            // macOS delivers double-clicked files via the Opened event, both at launch
            // and while the app is already running.
            tauri::RunEvent::Opened { urls } => {
                let paths: Vec<String> = urls
                    .iter()
                    .filter_map(|u| u.to_file_path().ok())
                    .map(|p| p.to_string_lossy().into_owned())
                    .collect();
                dispatch_opened(app, paths);
            }
            _ => {}
        });
}
