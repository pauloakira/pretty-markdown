import { useEffect } from "react";
import { installLatexCopy } from "../clipboard/latexCopy";

/** Installs the copy-as-LaTeX handler for the app's lifetime. */
export function useLatexCopy(): void {
  useEffect(() => installLatexCopy(), []);
}
