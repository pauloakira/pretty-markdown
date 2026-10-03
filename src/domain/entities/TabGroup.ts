export type GroupId = string;

/** Chrome's tab-group palette. The presentation layer maps each name to a light/dark hue. */
export const GROUP_COLORS = [
  "grey",
  "blue",
  "red",
  "yellow",
  "green",
  "pink",
  "purple",
  "cyan",
  "orange",
] as const;

export type GroupColor = (typeof GROUP_COLORS)[number];

export function isGroupColor(value: unknown): value is GroupColor {
  return typeof value === "string" && (GROUP_COLORS as readonly string[]).includes(value);
}

/**
 * A named, colored set of adjacent tabs (like Chrome's tab groups). Membership lives on
 * the tab (`Tab.groupId`); the group only carries its label and whether it's collapsed.
 * An empty `name` is allowed — the chip then shows just the color.
 */
export interface TabGroup {
  readonly id: GroupId;
  readonly name: string;
  readonly color: GroupColor;
  readonly collapsed: boolean;
}

export function createGroup(id: GroupId, name: string, color: GroupColor): TabGroup {
  return { id, name, color, collapsed: false };
}

/** The first palette color not already taken, cycling once all are in use (as Chrome does). */
export function nextGroupColor(groups: readonly TabGroup[]): GroupColor {
  const used = new Set(groups.map((g) => g.color));
  // Skip grey for automatic picks: it reads as "disabled" next to the others.
  const free = GROUP_COLORS.find((c) => c !== "grey" && !used.has(c));
  return free ?? GROUP_COLORS[1 + (groups.length % (GROUP_COLORS.length - 1))];
}
