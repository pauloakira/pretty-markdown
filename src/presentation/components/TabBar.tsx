import {
  Fragment,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
} from "react";
import { isTabDirty, type Tab, type TabId } from "../../domain/entities/Tab";
import type { GroupColor, GroupId, TabGroup } from "../../domain/entities/TabGroup";
import { findGroup, resolveDrop, type Workspace } from "../../domain/entities/Workspace";
import { GroupEditor } from "./GroupEditor";
import { TabContextMenu } from "./TabContextMenu";

/** Group commands the tab bar can issue (backed by the TabManager). */
export interface TabGroupActions {
  create: (tabId: TabId) => GroupId | null;
  addTo: (tabId: TabId, groupId: GroupId) => void;
  removeFrom: (tabId: TabId) => void;
  rename: (groupId: GroupId, name: string) => void;
  recolor: (groupId: GroupId, color: GroupColor) => void;
  toggleCollapsed: (groupId: GroupId) => void;
  ungroup: (groupId: GroupId) => void;
  byFolder: () => void;
}

interface TabBarProps {
  workspace: Workspace;
  busy: boolean;
  groups: TabGroupActions;
  onSelect: (id: TabId) => void;
  onClose: (id: TabId) => void;
  /** Close several tabs at once (dirty ones still go through the save prompt). */
  onCloseMany: (ids: readonly TabId[]) => void;
  onNew: () => void;
  onNewInGroup: (groupId: GroupId) => void;
  /** `outside`: dropped on empty bar space or a group chip rather than on a tab. */
  onDrop: (id: TabId, gap: number, outside: boolean) => void;
  onOpenSettings: () => void;
}

const DRAG_THRESHOLD = 5;

interface DragState {
  id: TabId;
  startX: number;
  pointerId: number;
  dragging: boolean;
}

/** Where the pointer is during a drag: the insertion gap, and whether it's off the tabs. */
interface DropSpot {
  gap: number;
  outside: boolean;
}

/** Past the last tab by this much counts as empty bar space. */
const OUTSIDE_MARGIN = 12;

interface DropHint {
  x: number;
  text: string;
  color: GroupColor;
}

/** Inline style carrying a group's color to the chip and its tabs' underline. */
export function groupColorStyle(color: GroupColor): CSSProperties {
  return { "--group-color": `var(--group-${color})` } as CSSProperties;
}

/** A group's label for menus and hints (unnamed groups are described by their color). */
export function groupLabel(group: TabGroup): string {
  return group.name || `${group.color[0].toUpperCase()}${group.color.slice(1)} group`;
}

/**
 * Tab bar with Chrome-style tab groups and pointer-based drag-to-reorder.
 *
 * Each group renders as a colored chip followed by its tabs (underlined in the group's
 * color); clicking the chip collapses/expands it, right-clicking opens the group editor.
 * Right-clicking a tab opens the tab menu (add to / remove from a group, close).
 *
 * Drag uses pointer events (not HTML5 drag, which is unreliable in WKWebView): press-and-
 * move past a threshold starts a drag, an insertion marker follows the cursor — with a
 * hint when the drop would join or leave a group — and release commits via `onDrop`.
 */
export function TabBar({
  workspace,
  busy,
  groups,
  onSelect,
  onClose,
  onCloseMany,
  onNew,
  onNewInGroup,
  onDrop,
  onOpenSettings,
}: TabBarProps) {
  const { tabs, activeTabId } = workspace;
  const barRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [dragId, setDragId] = useState<TabId | null>(null);
  const [spot, setSpot] = useState<DropSpot | null>(null);
  const gap = spot?.gap ?? null;
  const [hint, setHint] = useState<DropHint | null>(null);
  const [menu, setMenu] = useState<{ tabId: TabId; x: number; y: number } | null>(null);
  const [editingId, setEditingId] = useState<GroupId | null>(null);
  const [editorAnchor, setEditorAnchor] = useState<DOMRect | null>(null);

  const editing = findGroup(workspace, editingId);

  // Anchor the editor under its chip. Measured after render so a just-created group's
  // chip exists; re-measured as tabs change so it follows the chip.
  useLayoutEffect(() => {
    if (!editingId) return;
    const chip = listRef.current?.querySelector<HTMLElement>(
      `[data-group-id="${CSS.escape(editingId)}"]`,
    );
    if (!chip) {
      setEditingId(null); // the group is gone
      return;
    }
    const rect = chip.getBoundingClientRect();
    setEditorAnchor((prev) =>
      prev && prev.left === rect.left && prev.bottom === rect.bottom ? prev : rect,
    );
  }, [editingId, workspace]);

  /**
   * Insertion gap (0..visible tabs) for a pointer x, by tab midpoints. The pointer is
   * `outside` when it's over a group chip (between two tabs' boxes) or past the last tab.
   */
  const spotAt = (clientX: number): DropSpot => {
    const list = listRef.current;
    if (!list) return { gap: 0, outside: false };
    const rects = Array.from(list.querySelectorAll<HTMLElement>("[data-tab-id]")).map((el) =>
      el.getBoundingClientRect(),
    );
    for (let i = 0; i < rects.length; i += 1) {
      if (clientX < rects[i].left + rects[i].width / 2) {
        const prevRight = i > 0 ? rects[i - 1].right : -Infinity;
        return { gap: i, outside: clientX < rects[i].left - 1 && clientX > prevRight + 1 };
      }
    }
    const last = rects[rects.length - 1];
    return { gap: rects.length, outside: last !== undefined && clientX > last.right + OUTSIDE_MARGIN };
  };

  /** "Joins X" / "Leaves X" when dropping at `next` would change the tab's group. */
  const hintFor = (id: TabId, next: DropSpot, clientX: number): DropHint | null => {
    const tab = tabs.find((t) => t.id === id);
    const target = resolveDrop(workspace, id, next.gap, next.outside);
    if (!tab || !target || target.groupId === tab.groupId) return null;
    const joining = findGroup(workspace, target.groupId);
    const leaving = findGroup(workspace, tab.groupId);
    const group = joining ?? leaving;
    if (!group) return null;
    const left = barRef.current?.getBoundingClientRect().left ?? 0;
    return {
      x: clientX - left,
      text: `${joining ? "Joins" : "Leaves"} ${groupLabel(group)}`,
      color: group.color,
    };
  };

  const onTabPointerDown = (e: ReactPointerEvent<HTMLDivElement>, id: TabId) => {
    if (e.button === 1) {
      onClose(id);
      return;
    }
    if (e.button !== 0) return;
    onSelect(id); // activate on press, like a browser
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { id, startX: e.clientX, pointerId: e.pointerId, dragging: false };
  };

  const onTabPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (!drag.dragging) {
      if (Math.abs(e.clientX - drag.startX) < DRAG_THRESHOLD) return;
      drag.dragging = true;
      setDragId(drag.id);
    }
    const next = spotAt(e.clientX);
    setSpot(next);
    setHint(hintFor(drag.id, next, e.clientX));
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // capture may already be gone
    }
    if (drag?.dragging && spot) onDrop(drag.id, spot.gap, spot.outside);
    setDragId(null);
    setSpot(null);
    setHint(null);
  };

  const startGroup = (tabId: TabId) => {
    const id = groups.create(tabId);
    if (id) setEditingId(id); // name it right away, as Chrome does
  };

  // Render tabs in order, emitting a chip at the start of each group and skipping the
  // tabs of collapsed groups. `visibleIndex` counts rendered tabs (drag gaps use it).
  const visibleCount = tabs.filter((t) => !findGroup(workspace, t.groupId)?.collapsed).length;
  let visibleIndex = 0;
  const renderTab = (tab: Tab, group: TabGroup | null) => {
    const index = visibleIndex;
    visibleIndex += 1;
    const className = [
      "tab",
      tab.id === activeTabId ? "tab--active" : "",
      group ? "tab--grouped" : "",
      tab.id === dragId ? "tab--dragging" : "",
      dragId !== null && gap === index ? "tab--insert-before" : "",
      dragId !== null && gap === visibleCount && index === visibleCount - 1
        ? "tab--insert-after"
        : "",
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <div
        key={tab.id}
        data-tab-id={tab.id}
        className={className}
        style={group ? groupColorStyle(group.color) : undefined}
        title={tab.document.path ?? tab.document.name}
        onPointerDown={(e) => onTabPointerDown(e, tab.id)}
        onPointerMove={onTabPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu({ tabId: tab.id, x: e.clientX, y: e.clientY });
        }}
      >
        <span className="tab__name">{tab.document.name}</span>
        {isTabDirty(tab) && <span className="tab__dirty" aria-label="Unsaved changes">●</span>}
        <button
          className="tab__close"
          aria-label="Close tab"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onClose(tab.id);
          }}
        >
          ×
        </button>
      </div>
    );
  };

  const items: ReactElement[] = [];
  const seen = new Set<GroupId>();
  for (const tab of tabs) {
    const group = findGroup(workspace, tab.groupId);
    if (!group) {
      items.push(renderTab(tab, null));
      continue;
    }
    if (seen.has(group.id)) continue;
    seen.add(group.id);
    const members = tabs.filter((t) => t.groupId === group.id);
    items.push(
      <Fragment key={group.id}>
        <div
          className={`tabgroup__head${group.collapsed ? " tabgroup__head--collapsed" : ""}`}
          style={groupColorStyle(group.color)}
        >
          <button
            className={`tabgroup__chip${group.name ? "" : " tabgroup__chip--unnamed"}`}
            data-group-id={group.id}
            aria-expanded={!group.collapsed}
            aria-label={`${groupLabel(group)}, ${members.length} tab${members.length === 1 ? "" : "s"}`}
            title={`${groupLabel(group)} — click to ${group.collapsed ? "expand" : "collapse"}, right-click to edit`}
            onClick={() => groups.toggleCollapsed(group.id)}
            onContextMenu={(e) => {
              e.preventDefault();
              setEditingId(group.id);
            }}
          >
            {group.name && <span className="tabgroup__name">{group.name}</span>}
            {group.collapsed && <span className="tabgroup__count">{members.length}</span>}
          </button>
        </div>
        {!group.collapsed && members.map((t) => renderTab(t, group))}
      </Fragment>,
    );
  }

  const menuTab = menu ? tabs.find((t) => t.id === menu.tabId) ?? null : null;

  return (
    <div className="tabbar" ref={barRef}>
      <div className="tabbar__list" ref={listRef}>
        {items}
      </div>
      <button
        className="tabbar__new"
        aria-label="Open a document in a new tab"
        onClick={onNew}
        disabled={busy}
      >
        +
      </button>
      <button
        className="tabbar__settings"
        aria-label="Settings"
        title="Settings"
        onClick={onOpenSettings}
      >
        ⚙
      </button>
      {hint && (
        <div className="tabbar__drop-hint" style={{ ...groupColorStyle(hint.color), left: hint.x }}>
          {hint.text}
        </div>
      )}
      {menu && menuTab && (
        <TabContextMenu
          x={menu.x}
          y={menu.y}
          tab={menuTab}
          groups={workspace.groups}
          groupSizes={Object.fromEntries(
            workspace.groups.map((g) => [g.id, tabs.filter((t) => t.groupId === g.id).length]),
          )}
          canCloseOthers={tabs.length > 1}
          onNewGroup={() => startGroup(menuTab.id)}
          onAddToGroup={(groupId) => groups.addTo(menuTab.id, groupId)}
          onRemoveFromGroup={() => groups.removeFrom(menuTab.id)}
          onGroupByFolder={groups.byFolder}
          onCloseTab={() => onClose(menuTab.id)}
          onCloseOthers={() => onCloseMany(tabs.filter((t) => t.id !== menuTab.id).map((t) => t.id))}
          onDismiss={() => setMenu(null)}
        />
      )}
      {editing && editorAnchor && (
        <GroupEditor
          key={editing.id}
          group={editing}
          anchor={editorAnchor}
          onRename={(name) => groups.rename(editing.id, name)}
          onRecolor={(color) => groups.recolor(editing.id, color)}
          onOpenInGroup={() => onNewInGroup(editing.id)}
          onToggleCollapsed={() => groups.toggleCollapsed(editing.id)}
          onUngroup={() => groups.ungroup(editing.id)}
          onCloseGroup={() =>
            onCloseMany(tabs.filter((t) => t.groupId === editing.id).map((t) => t.id))
          }
          onDismiss={() => setEditingId(null)}
        />
      )}
    </div>
  );
}
