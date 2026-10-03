import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { GROUP_COLORS, type GroupColor, type TabGroup } from "../../domain/entities/TabGroup";
import { clampToViewport, usePopoverDismiss } from "../hooks/usePopoverDismiss";

interface GroupEditorProps {
  group: TabGroup;
  /** The group's chip; the editor opens just below it. */
  anchor: DOMRect;
  onRename: (name: string) => void;
  onRecolor: (color: GroupColor) => void;
  onOpenInGroup: () => void;
  onToggleCollapsed: () => void;
  onUngroup: () => void;
  onCloseGroup: () => void;
  onDismiss: () => void;
}

/**
 * Chrome-style group bubble: rename (applied live as you type), pick one of the nine
 * colors, and group-wide actions. Enter or Escape closes it.
 */
export function GroupEditor({
  group,
  anchor,
  onRename,
  onRecolor,
  onOpenInGroup,
  onToggleCollapsed,
  onUngroup,
  onCloseGroup,
  onDismiss,
}: GroupEditorProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [position, setPosition] = useState<CSSProperties>({ visibility: "hidden" });

  const dismiss = useCallback(() => onDismiss(), [onDismiss]);
  usePopoverDismiss(rootRef, dismiss);

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    setPosition(clampToViewport(anchor.left, anchor.bottom + 6, el.offsetWidth, el.offsetHeight));
  }, [anchor]);

  // Focus on the next frame: when opened by a right-click, the press that opened us
  // focuses the chip *after* this mounts, which would steal the caret.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const run = (action: () => void) => () => {
    action();
    onDismiss();
  };

  return (
    <div
      ref={rootRef}
      className="groupeditor"
      role="dialog"
      aria-label="Edit tab group"
      style={{ position: "fixed", ...position }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <label className="groupeditor__label" htmlFor="groupeditor-name">
        Group name
      </label>
      <input
        id="groupeditor-name"
        ref={inputRef}
        className="groupeditor__input"
        value={group.name}
        placeholder="Name this group"
        spellCheck={false}
        autoComplete="off"
        onChange={(e) => onRename(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onDismiss();
        }}
      />
      <div className="groupeditor__swatches" role="radiogroup" aria-label="Group color">
        {GROUP_COLORS.map((color) => (
          <button
            key={color}
            className={`groupeditor__swatch${color === group.color ? " groupeditor__swatch--on" : ""}`}
            role="radio"
            aria-checked={color === group.color}
            aria-label={color}
            title={color[0].toUpperCase() + color.slice(1)}
            style={{ "--group-color": `var(--group-${color})` } as CSSProperties}
            onClick={() => onRecolor(color)}
          />
        ))}
      </div>
      <div className="popmenu__sep" role="separator" />
      <button className="popmenu__item" onClick={run(onOpenInGroup)}>
        Open document in group
      </button>
      <button className="popmenu__item" onClick={run(onToggleCollapsed)}>
        {group.collapsed ? "Expand group" : "Collapse group"}
      </button>
      <button className="popmenu__item" onClick={run(onUngroup)}>
        Ungroup
      </button>
      <button className="popmenu__item popmenu__item--danger" onClick={run(onCloseGroup)}>
        Close group
      </button>
    </div>
  );
}
