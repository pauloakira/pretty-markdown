/**
 * Put `text` on the clipboard as plain text. Resolves to whether it worked.
 *
 * A copy command first, answered here (capture phase, ahead of the app's LaTeX copy
 * handler): it runs within the click, needs no clipboard permission in WKWebView, and
 * leaves the reader's selection alone. The async Clipboard API is the fallback.
 */
export async function copyText(text: string): Promise<boolean> {
  let copied = false;
  const onCopy = (event: ClipboardEvent) => {
    if (!event.clipboardData) return;
    event.clipboardData.setData("text/plain", text);
    event.preventDefault();
    event.stopImmediatePropagation();
    copied = true;
  };
  window.addEventListener("copy", onCopy, true);
  try {
    document.execCommand("copy");
  } catch {
    // Not supported here: try the Clipboard API below.
  } finally {
    window.removeEventListener("copy", onCopy, true);
  }
  if (copied) return true;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
