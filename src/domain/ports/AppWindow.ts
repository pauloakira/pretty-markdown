/** Port: control over the application window (the shell). */
export interface AppWindow {
  /**
   * Register a handler for when the user tries to close the window. The default close is
   * suppressed; call {@link AppWindow.close} to actually quit. Resolves to an unlisten fn.
   */
  onCloseRequested(handler: () => void): Promise<() => void>;
  /** Close the window for real. */
  close(): Promise<void>;
}
