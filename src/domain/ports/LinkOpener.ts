/** Port: open a link outside the app (in the user's default browser or mail client). */
export interface LinkOpener {
  openExternal(url: string): Promise<void>;
}
