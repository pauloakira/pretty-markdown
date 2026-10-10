// iPadOS document access for pretty-markdown.
//
// On iPadOS an app can't open arbitrary paths: a file the user picks in the document
// picker (e.g. from iCloud Drive) is reachable only through a security-scoped URL, and
// only until the app quits. To reopen it on a later launch (session restore, recent
// files) the app must keep a *bookmark* for it, created while it has access.
//
// The app keeps using the file's path as the document's identity. This plugin stores one
// bookmark per path and, before every read/write, turns the path back into an accessible
// file: resolve the bookmark, start security-scoped access, and download the file if it
// only exists in iCloud.

import Foundation
import SwiftRs
import Tauri
import UIKit
import WebKit

class PathArgs: Decodable {
  let path: String
}


class IpadFilesPlugin: Plugin, UIPencilInteractionDelegate {
  /// Bookmarks by the path the app knows the document under.
  private let bookmarksKey = "pretty-markdown.bookmarks"
  /// Files we've started security-scoped access to. Access is kept for the app's lifetime
  /// (open documents are read and saved repeatedly); the system ends it when the app quits.
  private var accessing = Set<String>()
  private let lock = NSLock()
  /// Off the main thread: a coordinated read blocks while iCloud downloads the file.
  private let work = DispatchQueue(label: "pretty-markdown.ipad-files", qos: .userInitiated)

  private weak var webView: WKWebView?

  override func load(webview: WKWebView) {
    webView = webview
    // Apple Pencil double-tap (2nd generation / Pro): tell the page, which toggles
    // highlight mode on the PDF on screen.
    let pencil = UIPencilInteraction()
    pencil.delegate = self
    webview.addInteraction(pencil)
  }

  func pencilInteractionDidTap(_ interaction: UIPencilInteraction) {
    // Respect the user's choice in Settings → Apple Pencil (e.g. "Ignore").
    guard UIPencilInteraction.preferredTapAction != .ignore else { return }
    webView?.evaluateJavaScript("window.dispatchEvent(new Event('pencil-double-tap'))")
  }

  private func loadBookmarks() -> [String: Data] {
    UserDefaults.standard.dictionary(forKey: bookmarksKey) as? [String: Data] ?? [:]
  }

  private func storeBookmark(_ data: Data, for path: String) {
    var bookmarks = loadBookmarks()
    bookmarks[path] = data
    UserDefaults.standard.set(bookmarks, forKey: bookmarksKey)
  }

  private func startAccess(_ url: URL) {
    lock.lock()
    defer { lock.unlock() }
    if !accessing.contains(url.path), url.startAccessingSecurityScopedResource() {
      accessing.insert(url.path)
    }
  }

  /// Called right after the user picks a file: keep a bookmark so it can be reopened later.
  @objc public func remember(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(PathArgs.self)
    work.async {
      let url = URL(fileURLWithPath: args.path)
      self.startAccess(url)
      do {
        let data = try url.bookmarkData(
          options: [], includingResourceValuesForKeys: nil, relativeTo: nil)
        self.storeBookmark(data, for: args.path)
        invoke.resolve(["path": url.path])
      } catch {
        invoke.reject(
          "Couldn't keep access to '\(url.lastPathComponent)': \(error.localizedDescription)")
      }
    }
  }

  /// Make a known document readable now: regain access through its bookmark (following it
  /// if the file was moved or renamed), and download it if it's only in iCloud. Resolves
  /// with the path to read or write.
  @objc public func access(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(PathArgs.self)
    work.async { self.makeAccessible(args.path, invoke) }
  }

  private func makeAccessible(_ path: String, _ invoke: Invoke) {
    var url = URL(fileURLWithPath: path)

    if let data = loadBookmarks()[path] {
      var stale = false
      if let resolved = try? URL(
        resolvingBookmarkData: data, options: [], relativeTo: nil, bookmarkDataIsStale: &stale)
      {
        url = resolved
        startAccess(url)
        if stale,
          let fresh = try? url.bookmarkData(
            options: [], includingResourceValuesForKeys: nil, relativeTo: nil)
        {
          storeBookmark(fresh, for: path)
        }
      }
    }

    // A coordinated read waits for iCloud to download the file if it's only in the cloud,
    // and keeps us from reading while iCloud is mid-update.
    var coordinationError: NSError?
    var readable = url
    NSFileCoordinator(filePresenter: nil).coordinate(
      readingItemAt: url, options: [], error: &coordinationError
    ) { actual in
      readable = actual
    }
    if let error = coordinationError {
      invoke.reject("Couldn't open '\(url.lastPathComponent)': \(error.localizedDescription)")
      return
    }
    invoke.resolve(["path": readable.path])
  }
}

@_cdecl("init_plugin_ipad_files")
func initPlugin() -> Plugin {
  return IpadFilesPlugin()
}
