//! iPadOS support for pretty-markdown: document access (security-scoped bookmarks +
//! iCloud downloads), plus the Apple Pencil double-tap for PDF highlighting. See `ios/Sources/IpadFilesPlugin.swift` for the why.
//!
//! The app depends on this crate only when building for iOS, so the desktop build never
//! compiles it. Nothing here is callable from the webview: the app's own file commands
//! call [`IpadFiles::remember`], [`IpadFiles::access`], [`IpadFiles::allow_folder`], [`IpadFiles::print`] and
//! [`IpadFiles::export`].

use serde::{Deserialize, Serialize};
use tauri::{
    plugin::{Builder, PluginHandle, TauriPlugin},
    Manager, Runtime,
};

#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_ipad_files);

#[derive(Serialize)]
struct PathArgs<'a> {
    path: &'a str,
}

#[derive(Deserialize)]
struct PathResponse {
    path: String,
}

#[derive(Serialize)]
struct PrintArgs<'a> {
    title: &'a str,
}

#[derive(Serialize)]
struct ExportArgs<'a> {
    name: &'a str,
    contents: &'a str,
}

#[derive(Serialize)]
struct KeyCommandsArgs<'a, T: Serialize> {
    commands: &'a T,
}

#[derive(Deserialize)]
struct MaybePathResponse {
    path: Option<String>,
}

/// Handle to the Swift side; available as managed state once the plugin is set up.
pub struct IpadFiles<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> IpadFiles<R> {
    /// Keep a bookmark for a file the user just picked, so it can be reopened after the
    /// app restarts.
    pub fn remember(&self, path: &str) -> Result<String, String> {
        self.0
            .run_mobile_plugin::<PathResponse>("remember", PathArgs { path })
            .map(|r| r.path)
            .map_err(|e| e.to_string())
    }

    /// Make a known document accessible now (bookmark, security scope, iCloud download)
    /// and return the path to read or write.
    pub fn access(&self, path: &str) -> Result<String, String> {
        self.0
            .run_mobile_plugin::<PathResponse>("access", PathArgs { path })
            .map(|r| r.path)
            .map_err(|e| e.to_string())
    }

    /// Print the page with the system print sheet (which can also save or share a PDF).
    /// Returns when the sheet closes.
    pub fn print(&self, title: &str) -> Result<(), String> {
        self.0
            .run_mobile_plugin::<serde::de::IgnoredAny>("printPage", PrintArgs { title })
            .map(|_| ())
            .map_err(|e| e.to_string())
    }

    /// Let the reader allow the folder of the document at `path` (the Files folder picker,
    /// opened there), so files beside it can be made and read. Returns the folder chosen,
    /// already remembered, or None if they cancelled.
    pub fn allow_folder(&self, path: &str) -> Result<Option<String>, String> {
        self.0
            .run_mobile_plugin::<MaybePathResponse>("allowFolder", PathArgs { path })
            .map(|r| r.path)
            .map_err(|e| e.to_string())
    }

    /// Save `contents` as a new file named `name` where the user chooses (the Files "Save
    /// to" sheet). Returns its path, already remembered, or None if they cancelled.
    pub fn export(&self, name: &str, contents: &str) -> Result<Option<String>, String> {
        self.0
            .run_mobile_plugin::<MaybePathResponse>("exportFile", ExportArgs { name, contents })
            .map(|r| r.path)
            .map_err(|e| e.to_string())
    }
}

impl<R: Runtime> IpadFiles<R> {
    /// Register the page's keyboard shortcuts as hardware key commands (KeyCommands.swift):
    /// a list of `{ id, input, modifiers, title, priority }`. A press comes back to the page as a
    /// `native-key-command` event carrying the id.
    pub fn set_key_commands<T: Serialize>(&self, commands: &T) -> Result<(), String> {
        self.0
            .run_mobile_plugin::<serde::de::IgnoredAny>(
                "setKeyCommands",
                KeyCommandsArgs { commands },
            )
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
}

/// Access the plugin from an app handle.
pub trait IpadFilesExt<R: Runtime> {
    fn ipad_files(&self) -> &IpadFiles<R>;
}

impl<R: Runtime, T: Manager<R>> IpadFilesExt<R> for T {
    fn ipad_files(&self) -> &IpadFiles<R> {
        self.state::<IpadFiles<R>>().inner()
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("ipad-files")
        .setup(|app, api| {
            #[cfg(target_os = "ios")]
            {
                let handle = api.register_ios_plugin(init_plugin_ipad_files)?;
                app.manage(IpadFiles(handle));
            }
            #[cfg(not(target_os = "ios"))]
            let _ = (app, api);
            Ok(())
        })
        .build()
}
