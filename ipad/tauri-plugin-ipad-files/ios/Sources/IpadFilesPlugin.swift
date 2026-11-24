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
import ObjectiveC
import SwiftRs
import Tauri
import UIKit
import WebKit

class PathArgs: Decodable {
  let path: String
}

class PrintArgs: Decodable {
  let title: String
}

class ExportArgs: Decodable {
  /// The file name to suggest, e.g. "notes.md".
  let name: String
  let contents: String
}

/// The bookmarks, by the path the app knows each document under (in UserDefaults).
enum Bookmarks {
  private static let key = "pretty-markdown.bookmarks"

  static func all() -> [String: Data] {
    UserDefaults.standard.dictionary(forKey: key) as? [String: Data] ?? [:]
  }

  static func store(_ data: Data, for path: String) {
    var bookmarks = all()
    bookmarks[path] = data
    UserDefaults.standard.set(bookmarks, forKey: key)
  }
}

/// Files opened from outside the app: "Open in pretty-markdown" from Files, the share sheet,
/// or another app. iPadOS hands the app a security-scoped URL for the document *in place*
/// (Info.ios.plist: LSSupportsOpeningDocumentsInPlace), and the access belongs to that URL
/// object. Tauri passes the file on to the page as a plain path, which carries no access,
/// so this hook catches the URL first: it starts access and keeps a bookmark under the
/// path, exactly as for a picked file, and the app's normal file reading then just works.
enum OpenedDocuments {
  private static var installed = false

  /// Wrap the app delegate's `application(_:open:options:)`. The plugin is created before
  /// the app delegate exists, so this waits for launch to finish, which is before iPadOS
  /// delivers a URL the app was launched to open.
  static func install() {
    if UIApplication.shared.delegate != nil {
      wrapDelegate()
      return
    }
    var observer: NSObjectProtocol?
    observer = NotificationCenter.default.addObserver(
      forName: UIApplication.didFinishLaunchingNotification, object: nil, queue: nil
    ) { _ in
      if let observer { NotificationCenter.default.removeObserver(observer) }
      wrapDelegate()
    }
  }

  private static func wrapDelegate() {
    guard !installed, let delegate = UIApplication.shared.delegate,
      let cls = object_getClass(delegate)
    else { return }
    let selector = NSSelectorFromString("application:openURL:options:")
    guard let method = class_getInstanceMethod(cls, selector) else { return }
    installed = true
    typealias OpenURL = @convention(c) (AnyObject, Selector, UIApplication, NSURL, NSDictionary) -> Bool
    let original = unsafeBitCast(method_getImplementation(method), to: OpenURL.self)
    let hook: @convention(block) (AnyObject, UIApplication, NSURL, NSDictionary) -> Bool = {
      this, app, url, options in
      keep(url as URL)
      return original(this, selector, app, url, options)
    }
    method_setImplementation(method, imp_implementationWithBlock(hook))
  }

  private static func keep(_ url: URL) {
    guard url.isFileURL else { return }
    // Access lasts until the app quits; the bookmark brings it back on later launches.
    _ = url.startAccessingSecurityScopedResource()
    if let data = try? url.bookmarkData(options: [], includingResourceValuesForKeys: nil, relativeTo: nil) {
      Bookmarks.store(data, for: url.path)
    }
  }
}

class IpadFilesPlugin: Plugin, UIPencilInteractionDelegate {
  /// Files we've started security-scoped access to. Access is kept for the app's lifetime
  /// (open documents are read and saved repeatedly); the system ends it when the app quits.
  private var accessing = Set<String>()
  private let lock = NSLock()
  /// Off the main thread: a coordinated read blocks while iCloud downloads the file.
  let work = DispatchQueue(label: "pretty-markdown.ipad-files", qos: .userInitiated)

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

  func startAccess(_ url: URL) {
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
        Bookmarks.store(data, for: args.path)
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

    if let data = Bookmarks.all()[path] {
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
          Bookmarks.store(fresh, for: path)
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
      if isMissingFile(error) {
        invoke.reject("'\(url.lastPathComponent)' \(missingFile)")
      } else {
        invoke.reject("Couldn't open '\(url.lastPathComponent)': \(error.localizedDescription)")
      }
      return
    }
    invoke.resolve(["path": readable.path])
  }
}

/// The end of the message for a document that isn't there any more; the page recognises it
/// to drop the file from Recent. Keep in step with `MISSING_FILE` in src-tauri/src/lib.rs.
let missingFile = "isn't there any more. It may have been moved, renamed or deleted."

/// Whether a file error means there's no file at that path (deleted, or a temporary copy
/// the system has cleared away).
func isMissingFile(_ error: NSError) -> Bool {
  if error.domain == NSCocoaErrorDomain,
    error.code == NSFileNoSuchFileError || error.code == NSFileReadNoSuchFileError
  {
    return true
  }
  if error.domain == NSPOSIXErrorDomain, error.code == Int(ENOENT) { return true }
  if let underlying = error.userInfo[NSUnderlyingErrorKey] as? NSError {
    return isMissingFile(underlying)
  }
  return false
}

// MARK: - Printing and Save As

extension IpadFilesPlugin {
  /// Print the page (Export PDF): the system print sheet, whose share button also saves or
  /// sends the PDF. WKWebView on iOS ignores `window.print()`, so the page asks for this.
  /// The page's print stylesheet applies, as it does on the Mac, so only the document it
  /// put in `#print-root` is printed. Resolves when the sheet closes.
  /// The page's keyboard shortcuts, as hardware key commands (KeyCommands.swift).
  @objc public func setKeyCommands(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(KeyCommandsArgs.self)
    DispatchQueue.main.async {
      if let webView = self.webView { KeyCommands.set(args.commands, on: webView) }
      invoke.resolve()
    }
  }

  @objc public func printPage(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(PrintArgs.self)
    DispatchQueue.main.async {
      guard let webView = self.webView else {
        invoke.reject("Nothing to print.")
        return
      }
      let info = UIPrintInfo(dictionary: nil)
      // The job name is the saved PDF's name: "notes", not "notes.md".
      info.jobName = (args.title as NSString).deletingPathExtension
      info.outputType = .general
      let controller = UIPrintInteractionController.shared
      controller.printInfo = info
      controller.printFormatter = webView.viewPrintFormatter()
      controller.present(animated: true) { _, _, _ in
        invoke.resolve()
      }
    }
  }

  /// Save As: write `contents` to a file named `name` and let the reader choose where it
  /// goes (the Files "Save to" sheet). The saved file is remembered like an opened one, so
  /// the tab keeps editing it and it reopens after a relaunch. Resolves with its path, or
  /// no path if the reader cancelled.
  @objc public func exportFile(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(ExportArgs.self)
    let folder = FileManager.default.temporaryDirectory
      .appendingPathComponent(UUID().uuidString, isDirectory: true)
    let draft = folder.appendingPathComponent(args.name)
    do {
      try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
      try args.contents.write(to: draft, atomically: true, encoding: .utf8)
    } catch {
      invoke.reject("Couldn't prepare '\(args.name)': \(error.localizedDescription)")
      return
    }
    DispatchQueue.main.async {
      guard let presenter = self.topViewController() else {
        try? FileManager.default.removeItem(at: folder)
        invoke.reject("Couldn't show where to save.")
        return
      }
      let picker = UIDocumentPickerViewController(forExporting: [draft], asCopy: true)
      let delegate = ExportDelegate { url in
        try? FileManager.default.removeItem(at: folder)
        guard let url = url else {
          invoke.resolve(["path": NSNull()])
          return
        }
        self.work.async {
          self.startAccess(url)
          if let data = try? url.bookmarkData(
            options: [], includingResourceValuesForKeys: nil, relativeTo: nil)
          {
            Bookmarks.store(data, for: url.path)
          }
          invoke.resolve(["path": url.path])
        }
      }
      picker.delegate = delegate
      // The picker holds its delegate weakly: keep it until the sheet is done.
      objc_setAssociatedObject(picker, &ExportDelegate.key, delegate, .OBJC_ASSOCIATION_RETAIN)
      presenter.present(picker, animated: true)
    }
  }

  private func topViewController() -> UIViewController? {
    var top = webView?.window?.rootViewController
    while let presented = top?.presentedViewController { top = presented }
    return top
  }
}

/// Reports where the Files sheet saved the file, or nil if it was cancelled.
private final class ExportDelegate: NSObject, UIDocumentPickerDelegate {
  static var key = 0
  private var done: ((URL?) -> Void)?

  init(_ done: @escaping (URL?) -> Void) { self.done = done }

  func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
    finish(urls.first)
  }

  func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
    finish(nil)
  }

  private func finish(_ url: URL?) {
    done?(url)
    done = nil
  }
}

@_cdecl("init_plugin_ipad_files")
func initPlugin() -> Plugin {
  OpenedDocuments.install()
  return IpadFilesPlugin()
}
