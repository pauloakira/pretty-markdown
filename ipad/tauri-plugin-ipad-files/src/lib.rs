//! iPadOS support for pretty-markdown: document access (security-scoped bookmarks +
//! iCloud downloads), plus the Apple Pencil double-tap for PDF highlighting. See `ios/Sources/IpadFilesPlugin.swift` for the why.
//!
//! The app depends on this crate only when building for iOS, so the desktop build never
//! compiles it. Nothing here is callable from the webview: the app's own file commands
//! call [`IpadFiles::remember`] and [`IpadFiles::access`].

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
