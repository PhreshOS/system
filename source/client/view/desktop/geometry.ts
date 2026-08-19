import { type CSSProperties } from "react"

/**
 * The gap between adjacent painted windows, in pixels. Each window uses
 * half inside its own box; the ordinary workspace uses the other half
 * at its boundary. The gutter remains private desktop layout state and never
 * enters the layer-independent value returned by `host.desktop.size()`.
 *
 * The visible window edge, taskbar edge and Start Menu geometry derive from
 * this value rather than restating its pixel or rem equivalent.
 */
export const desktopGutter = 12

/** Paint inset for an ordinary window edge that touches no workspace boundary. */
export const windowPaintInset = desktopGutter / 2

/** The display core uses the same spacing between itself and its tracks. */
export const desktopDisplayStyle = {

    margin: desktopGutter,

    gap: desktopGutter

} satisfies CSSProperties

/** The shared CSS anchor joining the taskbar and its Start Menu. */
export const taskbarAnchorName = "--desktop-taskbar"

/**
 * The Start Menu stays in the browser's top layer while CSS anchor positioning
 * keeps its geometry attached to the taskbar.
 */
export const startMenuStyle = {

    positionAnchor: taskbarAnchorName,

    top: "auto",

    right: "auto",

    bottom: `calc(anchor(top) + ${desktopGutter}px)`,

    left: "anchor(left)",

    maxHeight: `min(32rem, calc(100vh - var(--spacing-taskbar) - ${desktopGutter * 3}px))`,

    width: `min(22rem, calc(100vw - ${desktopGutter * 2}px))`

} satisfies CSSProperties

/** System dialogs share the Start Menu's taskbar offset and center on it. */
export const systemDialogStyle = {

    positionAnchor: taskbarAnchorName,

    top: "auto",

    right: "auto",

    bottom: `calc(anchor(top) + ${desktopGutter}px)`,

    left: "anchor(center)",

    translate: "-50% 0",

    width: `min(28rem, calc(100vw - ${desktopGutter * 2}px))`

} satisfies CSSProperties
