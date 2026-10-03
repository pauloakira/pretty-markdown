/** Port: control over the application shell (window + app lifecycle). */
export interface AppWindow {
  /**
   * Register a handler for when the user tries to close the window *or* quit the app
   * (e.g. ⌘Q). The default action is suppressed; call {@link AppWindow.close} to actually
   * quit. Resolves to an unlisten fn.
   */
  onCloseRequested(handler: () => void): Promise<() => void>;
  /** Quit the app for real. */
  close(): Promise<void>;
}
