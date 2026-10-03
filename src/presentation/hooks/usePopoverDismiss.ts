import { useEffect, type RefObject } from "react";

/**
 * Close a popover (menu, editor) on Escape, a press outside it, or the window losing
 * focus or resizing — the usual ways a native popover goes away.
 */
export function usePopoverDismiss(ref: RefObject<HTMLElement | null>, onDismiss: () => void): void {
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onDismiss();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onDismiss();
      }
    };
    // Capture phase, so a press that starts a drag or hits another control still closes it.
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("blur", onDismiss);
    window.addEventListener("resize", onDismiss);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("blur", onDismiss);
      window.removeEventListener("resize", onDismiss);
    };
  }, [ref, onDismiss]);
}

/** Shift a popover at (x, y) so its box stays inside the viewport (with a small margin). */
export function clampToViewport(x: number, y: number, width: number, height: number) {
  const margin = 6;
  return {
    left: Math.max(margin, Math.min(x, window.innerWidth - width - margin)),
    top: Math.max(margin, Math.min(y, window.innerHeight - height - margin)),
  };
}
