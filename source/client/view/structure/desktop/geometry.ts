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
export const desktopGutter = 10

/** Paint inset for an ordinary window edge that touches no workspace boundary. */
export const windowPaintInset = desktopGutter / 2

/** The display core uses the same spacing between itself and its tracks. */
export const desktopDisplayStyle = {

    "--desktop-gutter": `${desktopGutter}px`

} as CSSProperties
