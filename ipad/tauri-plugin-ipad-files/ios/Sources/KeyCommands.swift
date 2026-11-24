// Hardware keyboard shortcuts (Magic Keyboard) for pretty-markdown on iPadOS.
//
// The app's shortcuts are web `keydown` handlers. On iPadOS hardware keys go to UIKit's key
// commands first: the page only saw them while a text field had focus, and even then iPadOS
// kept several ⌘ combinations (⌘F, ⌘E, ⌘=, ⌘2, …) for itself. Reading a page, no shortcut
// reached the app, and arrows, Space and Page Down didn't scroll (WebKit scrolls the outer
// page with them, but documents scroll inside their own scroller).
//
// So the page hands its shortcut list to this file, which registers each as a UIKeyCommand
// on the web view's view controller (in the responder chain whatever has focus), most with
// priority over the system's own handling. A press is passed back to the page, which plays
// it as an ordinary keydown (or scrolls, for the reading keys). The page leaves the reading
// keys and ⌘Z out while text is being edited. The commands' titles show in the overlay
// iPadOS shows while ⌘ is held.

import ObjectiveC
import UIKit
import WebKit

/// One shortcut, as the page describes it.
class KeyCommandSpec: Decodable {
  /// Passed back to the page when pressed.
  let id: String
  /// The key: a character ("t", "[", "=", "1"), "tab" or "escape".
  let input: String
  /// Any of "command", "shift", "control", "alternate".
  let modifiers: [String]
  /// Shown in the ⌘ overlay; empty to work without being listed.
  let title: String
  /// Before what the focused view does with the key; false for keys a text field needs.
  let priority: Bool
}

class KeyCommandsArgs: Decodable {
  let commands: [KeyCommandSpec]
}

enum KeyCommands {
  /// Selector added to the view controller's class; the press reaches it through the
  /// responder chain.
  private static let action = NSSelectorFromString("prettyMarkdownKeyCommand:")
  private static var installed: [UIKeyCommand] = []
  private static weak var webView: WKWebView?

  /// Replace the registered shortcuts with `specs`, on the view controller showing `webView`.
  static func set(_ specs: [KeyCommandSpec], on webView: WKWebView) {
    self.webView = webView
    guard let controller = viewController(of: webView) else { return }
    addAction(to: type(of: controller))
    for command in installed { controller.removeKeyCommand(command) }
    installed = specs.compactMap(command)
    for command in installed { controller.addKeyCommand(command) }
    focusPage()
    if observer == nil {
      observer = NotificationCenter.default.addObserver(
        forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main
      ) { _ in KeyCommands.focusPage() }
    }
  }

  private static var observer: NSObjectProtocol?

  /// Make WebKit's content view first responder when it isn't. With no text field focused
  /// no view was, so the page got no key events at all (not even ⌘ or ⇧ on their own).
  static func focusPage() {
    guard let webView = webView, webView.window != nil, let content = contentView(of: webView),
      !content.isFirstResponder
    else { return }
    content.becomeFirstResponder()
  }

  /// WebKit's view that takes the keys (the web view itself only passes taps on).
  private static func contentView(of webView: WKWebView) -> UIView? {
    webView.scrollView.subviews.first { NSStringFromClass(type(of: $0)).contains("WKContentView") }
  }

  private static func command(_ spec: KeyCommandSpec) -> UIKeyCommand? {
    let named: [String: String] = [
      "tab": "\t", "escape": UIKeyCommand.inputEscape,
      "up": UIKeyCommand.inputUpArrow, "down": UIKeyCommand.inputDownArrow,
      "pageup": UIKeyCommand.inputPageUp, "pagedown": UIKeyCommand.inputPageDown,
      "home": UIKeyCommand.inputHome, "end": UIKeyCommand.inputEnd,
    ]
    let input = named[spec.input] ?? spec.input
    guard !input.isEmpty else { return nil }
    var flags: UIKeyModifierFlags = []
    for modifier in spec.modifiers {
      switch modifier {
      case "command": flags.insert(.command)
      case "shift": flags.insert(.shift)
      case "control": flags.insert(.control)
      case "alternate": flags.insert(.alternate)
      default: break
      }
    }
    let command = UIKeyCommand(
      title: spec.title, action: action, input: input, modifierFlags: flags,
      propertyList: spec.id)
    command.discoverabilityTitle = spec.title.isEmpty ? nil : spec.title
    if #available(iOS 15.0, *) { command.wantsPriorityOverSystemBehavior = spec.priority }
    return command
  }

  /// Give the controller's class the action, once: it tells the page which shortcut it was.
  private static func addAction(to cls: AnyClass) {
    guard class_getInstanceMethod(cls, action) == nil else { return }
    let block: @convention(block) (AnyObject, UIKeyCommand) -> Void = { _, command in
      guard let id = command.propertyList as? String,
        let data = try? JSONSerialization.data(withJSONObject: [id]),
        let json = String(data: data, encoding: .utf8)
      else { return }
      KeyCommands.webView?.evaluateJavaScript(
        "window.dispatchEvent(new CustomEvent('native-key-command', { detail: \(json)[0] }))")
    }
    class_addMethod(cls, action, imp_implementationWithBlock(block), "v@:@")
  }

  private static func viewController(of view: UIView) -> UIViewController? {
    var responder: UIResponder? = view
    while let next = responder?.next {
      if let controller = next as? UIViewController { return controller }
      responder = next
    }
    return nil
  }
}
