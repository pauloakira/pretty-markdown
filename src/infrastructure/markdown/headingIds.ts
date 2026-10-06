import type MarkdownIt from "markdown-it";
import { HEADING_ID_PREFIX, slugify } from "../../domain/values/Link";

/**
 * Gives every heading an id so in-document links (`[see](#method)`) have somewhere to
 * land. Slugs follow GitHub's rules, so links written for GitHub work here too; the ids
 * carry `HEADING_ID_PREFIX`, and the reader's link handler resolves `#method` to
 * `user-content-method`.
 *
 * The slug comes from the heading's plain text and inline code; math is left out, as it
 * has no stable plain-text form.
 */
export function headingIds(md: MarkdownIt): void {
  md.core.ruler.push("heading_ids", (state) => {
    const taken = new Set<string>();
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i += 1) {
      if (tokens[i].type !== "heading_open") continue;
      const text = (tokens[i + 1]?.children ?? [])
        .filter((child) => child.type === "text" || child.type === "code_inline")
        .map((child) => child.content)
        .join("");
      tokens[i].attrSet("id", HEADING_ID_PREFIX + slugify(text, taken));
    }
  });
}
