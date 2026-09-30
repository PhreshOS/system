import { Button, ContextMenu, Panel, Surface, Text, Tooltip, useAppearance, useColor, useScale } from "@phreshos/react-ui"
import { Map as MapIcon, Maximize2 } from "@phreshos/react-ui/icons"
import WindowMenu from "../../window-menu"
import TaskbarTooltip from "../taskbar-tooltip"
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react"
import { planeReach, type WindowRegion } from "@client/view/components/window-manager/window-geometry"
import { type AppearanceTaskbar } from "@phreshos/core"
import { useReducedMotion } from "@libs/react-motion"
import { motion } from "motion/react"
import { cssEasing, motionTransition } from "@client/view/appearance/motion"
import motionAcross from "../../../../motion-across"
import { EdgeHold, against, useViewTravel } from "../../../../edge-hold"
import { createPortal } from "react-dom"
import SnapPreview, { type SnapTarget } from "../../../../windows/snap-preview"
import { desktopMargins } from "../../../desktop-layers"
import { surfaceLifecyclePose, surfacePresenceTransition } from "@client/view/appearance/surface-presence"
import { shellSurfaceClassName } from "../../shell-surface"
import { floatingShadow } from "@client/view/appearance/floating-shadow"
import { type ViewportControl as Viewport } from "../../../../viewport-offset"

/** A standard Window as the map shows it: where it is on the plane. */
export interface MappedWindow {

    identity: string

    title: string

    icon: string

    /** Its top-left corner and size on the plane, whose zero is the center. */
    region: WindowRegion

    /** Whether it is the front Window. */
    front: boolean

    minimized: boolean

    maximized: boolean

    /** Brings the view to the Window and the Window to the front. */
    show(): void

    /** Moves the Window into the view on screen and brings it to the front. */
    bringHere(): void

    /** Shows the Window where it is, or minimizes it. */
    toggleMinimized(): void

    /** Maximizes the Window in its view, or restores it. */
    fill(): void

    /** Closes the Window, which exits its Process. */
    close(): void

    /** Moves the Window so its center is at this point of the plane. */
    moveTo(center: { x: number, y: number }): void
}

/**
 * One Taskbar button for where this Desktop looks on the plane of standard
 * Windows. It names the current view when it is not the center, and opens a
 * map of the plane: a grid of whole views, a frame for the view itself
 * above them, and the Windows above both. Choosing a view moves there; dragging the frame
 * moves the view anywhere.
 *
 * The map opens and closes as the Start Menu does: a native popover, which the
 * browser closes when something else on the Desktop is pressed, and which closes
 * itself when focus crosses into a Program frame; either way the press goes on
 * to what it was meant for.
 */
export default function ViewportControl({ viewport, windows, taskbar, spacing, onOpenChange }: Readonly<{
    viewport: Viewport
    windows: readonly MappedWindow[]
    taskbar: AppearanceTaskbar
    spacing: number
    onOpenChange: (open: boolean) => void
}>) {

    const id = useId()

    const trigger = useRef<HTMLButtonElement>(null)

    const surface = useRef<HTMLDivElement>(null)

    const [open, setOpen] = useState(false)

    // Where the map opens, measured from the button when it opens, and the room it has there.
    const [anchor, setAnchor] = useState<CSSProperties>({})

    const [room, setRoom] = useState<Room | null>(null)

    // How far the map moves inward so it stays on the screen, once it is drawn.
    const [inward, setInward] = useState(0)

    const openAtPressStart = useRef(false)

    const reducedMotion = useReducedMotion()

    const transaction = useAppearance().transaction

    const vertical = taskbar.position === "left" || taskbar.position === "right"

    const centered = viewport.offset.x === 0 && viewport.offset.y === 0

    const place = `${viewport.view.x}, ${viewport.view.y}`

    const close = useCallback(function () {

        if (surface.current?.matches(":popover-open")) surface.current.hidePopover()

    }, [])

    useEffect(function () {

        // Program frames are separate documents, so focus crossing into one is what closes the map there.
        function closeForProgramFrame() {

            if (document.activeElement instanceof HTMLIFrameElement && !surface.current?.contains(document.activeElement)) close()
        }

        window.addEventListener("blur", closeForProgramFrame)

        return () => window.removeEventListener("blur", closeForProgramFrame)

    }, [close])

    // The map's button can be carried: dragged out, it leaves a ghost in the hand, and held against an
    // edge of the screen, the ghost takes the view that way, as a held Window does. It is what the
    // hand holds when there is no Window to carry, and it belongs to the Shell, so no Program under
    // the edge can take the hand from it.
    const travel = useViewTravel(viewport)

    const travelNow = useRef(travel)

    travelNow.current = travel

    // The button as it is lifted: where the hand is, where on the button it holds it, and how large
    // the button is drawn, so the ghost is the button itself; the button left behind is faint.
    const [ghost, setGhost] = useState<{ x: number, y: number, grip: { x: number, y: number }, scale: number } | null>(null)

    const lifted = useRef({ grip: { x: 0, y: 0 }, scale: 1 })

    // A carry that ended over the button is not also a press.
    const carried = useRef(false)

    // Where the ghost is held against the Desktop's edges: the placement a Window would take there,
    // shown as a Window's is, but only as a sign; nothing is placed when the hand lets go. It turns to
    // danger where the plane goes no further.
    const [edge, setEdge] = useState<{ zone: SnapTarget | null, shown: SnapTarget | null, blocked: boolean, surface: HTMLElement | null }>({ zone: null, shown: null, blocked: false, surface: null })

    function carry(event: ReactPointerEvent<HTMLElement>) {

        if (event.button !== 0) return

        const start = { x: event.clientX, y: event.clientY }

        const pointer = event.pointerId

        const held = event.target as Element

        const edges = new EdgeHold(direction => travelNow.current(direction), blocked => setEdge(current => ({ ...current, blocked })))

        const windowSurface = document.querySelector<HTMLElement>("[data-window-surface]")

        const button = trigger.current

        if (button) {

            const bounds = button.getBoundingClientRect()

            lifted.current = { grip: { x: start.x - bounds.left, y: start.y - bounds.top }, scale: button.offsetWidth ? bounds.width / button.offsetWidth : 1 }
        }

        carried.current = false

        function move(motion: PointerEvent) {

            if (motion.pointerId !== pointer) return

            if (!carried.current) {

                if (Math.hypot(motion.clientX - start.x, motion.clientY - start.y) < 6) return

                carried.current = true

                // Held by the Shell from here on, even over a Program's frame.
                try { held.setPointerCapture(pointer) } catch { /* The press already ended. */ }

                close()
            }

            setGhost({ x: motion.clientX, y: motion.clientY, ...lifted.current })

            // Measured as the Desktop measures a Window's drag: in its own pixels, at its scale.
            const bounds = windowSurface?.getBoundingClientRect()

            const scale = bounds && windowSurface?.clientWidth ? bounds.width / windowSurface.clientWidth : 1

            const width = windowSurface?.clientWidth ?? window.innerWidth

            const height = windowSurface?.clientHeight ?? window.innerHeight

            const direction = against((motion.clientX - (bounds?.left ?? 0)) / scale, (motion.clientY - (bounds?.top ?? 0)) / scale, width, height)

            edges.update(direction)

            const zone = direction.x || direction.y ? placementAt(direction) : null

            setEdge(current => ({ ...current, zone, shown: zone ?? current.shown, surface: windowSurface }))
        }

        function end(motion: PointerEvent) {

            if (motion.pointerId !== pointer) return

            edges.stop()

            setGhost(null)

            setEdge(current => ({ ...current, zone: null, blocked: false }))

            removeEventListener("pointermove", move)

            removeEventListener("pointerup", end)

            removeEventListener("pointercancel", end)

            // The press that may follow on this same release is still told it was a carry.
            setTimeout(() => { carried.current = false })
        }

        addEventListener("pointermove", move)

        addEventListener("pointerup", end)

        addEventListener("pointercancel", end)
    }

    function toggle() {

        if (carried.current) return

        const element = surface.current

        if (!element || !trigger.current) return

        // A press on the button while the map is open already closed it.
        if (openAtPressStart.current) return close()

        setAnchor(anchorStyle(trigger.current, taskbar, spacing))

        setRoom(roomBeside(trigger.current, taskbar, spacing))

        setInward(0)

        element.showPopover()
    }

    // It starts where its button starts; where it would pass the screen's far edge, it moves back just
    // enough to stay one spacing inside, as far as the Start Menu's corner at most.
    useLayoutEffect(function () {

        const element = surface.current

        if (!open || !element || !trigger.current) return

        // Layout measures, which the entrance's brief growth does not change; the Desktop's scale comes from the button.
        const scale = trigger.current.offsetWidth ? trigger.current.getBoundingClientRect().width / trigger.current.offsetWidth : 1

        const screen = { width: window.innerWidth / scale, height: window.innerHeight / scale }

        const beyond = vertical ? element.offsetTop + element.offsetHeight - (screen.height - spacing) : element.offsetLeft + element.offsetWidth - (screen.width - spacing)

        const start = (vertical ? element.offsetTop : element.offsetLeft) - spacing

        // The map settles its own size after it is first drawn, so this looks again after every drawing.
        if (beyond > 0.5 && start > 0.5) setInward(current => current + Math.min(beyond, start))

    })

    return <>

        {/* Showing its icon alone, it names itself on hover and focus; pressed and dragged, it is carried. */}
        <span style={{ display: "contents" }} onPointerDownCapture={carry}>
        <TaskbarTooltip label={centered ? "Map" : `Map, near ${place}`} iconOnly={centered || vertical}>
            <Button ref={trigger} size="small" iconOnly={centered && !vertical} className={vertical ? "px-0" : undefined} color={centered ? undefined : "primary:soft"}
                style={ghost ? { opacity: 0.35 } : undefined}
                aria-label={centered ? "Map" : `Map, near ${place}`} aria-controls={id} aria-expanded={open} aria-haspopup="dialog"
                onPressStart={() => { openAtPressStart.current = surface.current?.matches(":popover-open") ?? false }}
                onPress={toggle}>
                <MapIcon />{!centered && !vertical && <span className="tabular-nums">{place}</span>}
            </Button>
        </TaskbarTooltip>
        </span>

        {edge.shown && edge.surface && createPortal(<SnapPreview
            shown={edge.shown}
            visible={edge.zone !== null}
            blocked={edge.blocked}
            bare={false}
            paintSurfaceSize={{ width: edge.surface.clientWidth, height: edge.surface.clientHeight }}
            paintInset={spacing / 2}
            paintMargins={desktopMargins(spacing, taskbar)}
            reducedMotion={reducedMotion}
            zIndex={2147483646}
        />, edge.surface)}

        {ghost && createPortal(<div aria-hidden="true" inert className="pointer-events-none fixed"
            style={{ left: ghost.x - ghost.grip.x, top: ghost.y - ghost.grip.y, transform: `scale(${ghost.scale})`, transformOrigin: "0 0", zIndex: 2147483647 }}>
            <Button size="small" iconOnly={centered && !vertical} className={vertical ? "px-0" : undefined} color={centered ? undefined : "primary:soft"}>
                <MapIcon />{!centered && !vertical && <span className="tabular-nums">{place}</span>}
            </Button>
        </div>, document.body)}

        <motion.div
            ref={surface}
            id={id}
            role="dialog"
            popover="auto"
            aria-labelledby={`${id}-label`}
            tabIndex={-1}
            className={`${shellSurfaceClassName} pointer-events-auto fixed hidden open:block`}
            style={{
                ...anchor,
                ...(vertical ? { top: Number(anchor.top ?? 0) - inward } : { left: Number(anchor.left ?? 0) - inward }),
                transitionBehavior: "allow-discrete",
                transitionDuration: reducedMotion ? "0ms" : String(transaction.duration) + "ms",
                transitionTimingFunction: cssEasing(transaction.easing),
                transitionProperty: "display, overlay"
            }}
            initial={false}
            animate={open ? surfaceLifecyclePose.visible : surfaceLifecyclePose.hidden}
            transition={surfacePresenceTransition(reducedMotion, transaction)}
            onBeforeToggle={event => { setOpen(event.newState === "open"); onOpenChange(event.newState === "open") }}
            onToggle={event => { if (event.newState === "open") event.currentTarget.focus() }}
        >

            {/* Always drawn, like the Start Menu, so it leaves as it came. */}
            <Panel shadow={floatingShadow}><ViewMap labelId={`${id}-label`} viewport={viewport} windows={windows} centered={centered} menus={surface.current} room={room} /></Panel>

        </motion.div>

    </>
}

/** The space a panel has on the screen, in the Desktop's own pixels. */
interface Room {
    width: number
    height: number
}

/**
 * The room beside the Taskbar for the map: the whole screen, less one spacing at its edges and the
 * Taskbar with its spacings on the Taskbar's side, as the Start Menu has.
 */
function roomBeside(button: HTMLElement, taskbar: AppearanceTaskbar, spacing: number): Room {

    const rectangle = button.getBoundingClientRect()

    const scale = button.offsetWidth ? rectangle.width / button.offsetWidth : 1

    const screen = { width: window.innerWidth / scale, height: window.innerHeight / scale }

    const taskbarSide = taskbar.size + spacing * 3

    return taskbar.position === "top" || taskbar.position === "bottom"
        ? { width: screen.width - spacing * 2, height: screen.height - taskbarSide }
        : { width: screen.width - taskbarSide, height: screen.height - spacing * 2 }
}

/**
 * Like the Start Menu, the map opens two spacings beyond the Taskbar's edge, starting where the button
 * starts. Taskbar positions name physical screen edges, so every inset stays physical.
 */
function anchorStyle(button: HTMLElement, taskbar: AppearanceTaskbar, spacing: number): CSSProperties {

    // The Desktop's scale preference enlarges what it shows; fixed insets are counted before it.
    const rectangle = button.getBoundingClientRect()

    const scale = button.offsetWidth ? rectangle.width / button.offsetWidth : 1

    const inset = taskbar.size + spacing * 2

    const style = { position: "fixed", top: "auto", right: "auto", bottom: "auto", left: "auto", margin: 0 } satisfies CSSProperties

    if (taskbar.position === "bottom") return { ...style, left: rectangle.left / scale, bottom: inset }

    if (taskbar.position === "top") return { ...style, left: rectangle.left / scale, top: inset }

    if (taskbar.position === "left") return { ...style, left: inset, top: rectangle.top / scale }

    return { ...style, right: inset, top: rectangle.top / scale }
}

/** `menus` is the map's own surface: menus open inside it, since the map is above everything else on the page. */
function ViewMap({ labelId, viewport, windows, centered, menus, room }: Readonly<{ labelId: string, viewport: Viewport, windows: readonly MappedWindow[], centered: boolean, menus: HTMLElement | null, room: Room | null }>) {

    const space = useScale(useAppearance().spacing)

    const primary = useColor("primary").base

    // The lines between views, as faint as React UI's separators.
    const line = `color-mix(in oklab, ${useColor("foreground").base} 10%, transparent)`

    const { surface } = viewport

    const columns = range.maxX - range.minX + 1

    const rows = range.maxY - range.minY + 1

    // The panel's own words and spaces around the plane, measured once it is drawn.
    const title = useRef<HTMLElement>(null)

    const footer = useRef<HTMLDivElement>(null)

    const [chrome, setChrome] = useState({ width: space.large * 2, height: space.large * 2 + space.medium * 2 + space.xlarge * 3 })

    useLayoutEffect(function () {

        const words = (title.current?.offsetHeight ?? 0) + (footer.current?.offsetHeight ?? 0)

        if (words) setChrome(current => {
            const height = space.large * 2 + space.medium * 2 + words
            return current.height === height ? current : { ...current, height }
        })
    })

    // One view on the map: its width from the spacing, its height in the view's own proportion, smaller
    // when the room beside the Taskbar is smaller, and both whole pixels so the lines between views stay even.
    const ratio = surface.height / surface.width

    const preferred = space.xlarge * 3.25

    const width = room ? Math.min(preferred, (room.width - chrome.width) / columns, (room.height - chrome.height) / rows / ratio) : preferred

    const cell = room ? { width: Math.max(1, Math.floor(width)), height: Math.max(1, Math.floor(width * ratio)) } : { width: Math.round(width), height: Math.round(width * ratio) }

    /** Where a point of the plane falls on the map. */
    const mapX = (planeX: number) => (planeX / surface.width + 0.5 - range.minX) * cell.width

    const mapY = (planeY: number) => (planeY / surface.height + 0.5 - range.minY) * cell.height

    const drag = useRef<{ pointer: { x: number, y: number }, offset: { x: number, y: number }, scale: number } | null>(null)

    // The Window whose title shows, by pointer or focus.

    // The whole view a released frame would settle on, shown while it is dragged.
    const [settle, setSettle] = useState<{ x: number, y: number } | null>(null)

    // Where that mark last stood, so it can fade out in place.
    const lastSettle = useRef(settle)

    if (settle) lastSettle.current = settle

    const shownSettle = settle ?? lastSettle.current

    const reducedMotion = useReducedMotion()

    const transaction = useAppearance().transaction

    // The map is small and the view is large, so every pixel the hand moves is many on the
    // screen. The frame therefore does not jump to the pointer: it follows it, smoothed each
    // frame, which melts the hand's small jolts and keeps its intent.
    const following = useRef<{ target: { x: number, y: number }, shown: { x: number, y: number }, frame: number, last: number } | null>(null)

    const placeView = useRef(viewport.place)

    placeView.current = viewport.place

    function chase(time: number) {

        const state = following.current

        if (!state) return

        const step = state.last ? Math.min(time - state.last, 64) : 16

        state.last = time

        const share = 1 - Math.exp(-step / 60)

        state.shown = { x: state.shown.x + (state.target.x - state.shown.x) * share, y: state.shown.y + (state.target.y - state.shown.y) * share }

        placeView.current(state.shown)

        const near = Math.abs(state.target.x - state.shown.x) < 0.5 && Math.abs(state.target.y - state.shown.y) < 0.5

        state.frame = near && !drag.current ? 0 : requestAnimationFrame(chase)
    }

    function stopFollowing() {

        if (following.current?.frame) cancelAnimationFrame(following.current.frame)

        following.current = null
    }

    function grab(event: ReactPointerEvent<HTMLDivElement>) {

        event.currentTarget.setPointerCapture(event.pointerId)

        drag.current = { pointer: { x: event.clientX, y: event.clientY }, offset: viewport.offset, scale: shownScale(event.currentTarget) }

        stopFollowing()

        following.current = { target: viewport.offset, shown: viewport.offset, frame: 0, last: 0 }
    }

    function follow(event: ReactPointerEvent<HTMLDivElement>) {

        const started = drag.current

        if (!started) return

        // The frame stays on the map: its center goes no further than the outer views' centers.
        const point = {
            x: clamp(started.offset.x + (event.clientX - started.pointer.x) / started.scale / cell.width * surface.width, range.minX * surface.width, range.maxX * surface.width),
            y: clamp(started.offset.y + (event.clientY - started.pointer.y) / started.scale / cell.height * surface.height, range.minY * surface.height, range.maxY * surface.height)
        }

        // The frame follows the pointer, smoothed; a nearby whole view is only marked until release.
        const state = following.current

        if (state) {

            state.target = point

            if (!state.frame) state.frame = requestAnimationFrame(chase)
        }

        setSettle(nearView(point, surface))
    }

    function release() {

        stopFollowing()

        if (drag.current && settle) viewport.moveTo(settle)

        drag.current = null

        setSettle(null)
    }

    // The panel is as wide as the map; its words wrap under it.
    return <div className="grid" style={{ gap: space.medium, padding: space.large, width: columns * cell.width, boxSizing: "content-box" }}>

        <Text ref={title} id={labelId} size="medium" className="flex items-center" style={{ fontWeight: 500, gap: space.small }}><MapIcon aria-hidden />Map</Text>

        <div className="relative">

        {/* The plane, a well recessed into the Panel like the Start Menu's; views and Windows sit on it, and the frame above them. */}
        <Surface depth="recessed" color="background" material="extended" className="relative overflow-hidden" style={{ width: columns * cell.width, height: rows * cell.height }}>

            {/* One clear cell per view, so the well shows as it does in the Start Menu. */}
            <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${columns}, ${cell.width}px)`, gridTemplateRows: `repeat(${rows}, ${cell.height}px)` }}>

                {Array.from({ length: rows }, (_, row) => Array.from({ length: columns }, (_, column) => {

                    const view = { x: range.minX + column, y: range.minY + row }

                    const inside = windows.filter(window => viewOf(window.region, surface).x === view.x && viewOf(window.region, surface).y === view.y)

                    return <Button key={`${view.x},${view.y}`} size="small" depth="flat" color="transparent" radius={0}
                        aria-label={`View ${view.x}, ${view.y}${inside.length ? `, ${inside.map(window => window.title).join(", ")}` : ""}`}
                        style={{ width: "100%", height: "100%", paddingInline: 0 }}
                        onPress={() => viewport.moveTo(view)} />
                }))}

            </div>

            {/* The lines between views: one at the end of each view, and one pixel short of the map, so the last is left out. */}
            <div aria-hidden="true" className="pointer-events-none absolute left-0 top-0" style={{
                width: columns * cell.width - 1,
                height: rows * cell.height - 1,
                backgroundImage: `linear-gradient(to right, transparent calc(100% - 1px), ${line} calc(100% - 1px)), linear-gradient(to bottom, transparent calc(100% - 1px), ${line} calc(100% - 1px))`,
                backgroundSize: `${cell.width}px 100%, 100% ${cell.height}px`
            }} />

            {/* Where the frame will settle when released: the whole view it is near, lightly tinted.
                It fades in and out, and keeps its last place while it fades away. */}
            {shownSettle && <motion.div aria-hidden="true" className="pointer-events-none absolute"
                initial={{ opacity: 0 }}
                animate={{ opacity: settle ? 1 : 0 }}
                transition={surfacePresenceTransition(reducedMotion, transaction)}
                style={{
                    left: mapX(shownSettle.x * surface.width) - cell.width / 2, top: mapY(shownSettle.y * surface.height) - cell.height / 2, width: cell.width, height: cell.height,
                    background: `color-mix(in oklab, ${primary} 18%, transparent)`
                }} />}

            {/* The view itself, over the views and dragged anywhere on the map. It travels with the
                same motion as the view it stands for; under a dragging hand it follows at once. */}
            <motion.div className="absolute left-0 top-0" style={{ width: cell.width, height: cell.height }} initial={false}
                animate={{ x: mapX(viewport.offset.x) - cell.width / 2, y: mapY(viewport.offset.y) - cell.height / 2 }}
                transition={viewport.transaction && !reducedMotion ? motionTransition(viewport.transaction) : { duration: 0 }}>
                <Surface aria-hidden="true" color="primary" material={{ opacity: 0.3, backdrop: 0 }} radius="small" className="cursor-grab touch-none active:cursor-grabbing"
                    style={{ width: "100%", height: "100%" }}
                    onPointerDown={grab} onPointerMove={follow} onPointerUp={release} onPointerCancel={() => { drag.current = null; setSettle(null) }} />
            </motion.div>

            {/* The Windows above everything, since they are dragged too. */}
            {windows.map(window => <MapWindow key={window.identity} window={window} viewport={viewport} menus={menus} mapX={mapX} mapY={mapY} cell={cell} />)}

        </Surface>

        </div>

        <div ref={footer} className="flex items-center justify-between" style={{ gap: space.medium }}>

            <Text size="xsmall" tone="secondary">Choose a view or a Window, drag the frame, or drag a Window to move it.</Text>

            <Button size="small" disabled={centered} onPress={viewport.home}>Center</Button>

        </div>

    </div>
}

/**
 * A Window on the map: a small card around its icon where the Window's center is, in a light tint
 * of the secondary color like the Start Menu's cards, and in the primary color when it is the front
 * Window. Its title shows in a Tooltip on hover and focus. Pressing it brings the view to the view the Window is in, and the Window to the front; its menu is the Window's menu, as in the Taskbar; dragging it moves the
 * Window anywhere on the map.
 */
function MapWindow({ window, viewport, menus, mapX, mapY, cell }: Readonly<{
    window: MappedWindow
    viewport: Viewport
    menus: HTMLElement | null
    mapX: (planeX: number) => number
    mapY: (planeY: number) => number
    cell: { width: number, height: number }
}>) {

    const space = useScale(useAppearance().spacing)

    const { surface } = viewport

    const center = { x: window.region.x + window.region.width / 2, y: window.region.y + window.region.height / 2 }

    // Where the card is while it is dragged, until the Window arrives there.
    const [dragged, setDragged] = useState<{ x: number, y: number } | null>(null)

    // A drag that has just ended is not also a press.
    const moved = useRef(false)

    useEffect(() => setDragged(null), [window.region.x, window.region.y])

    const shown = dragged ?? center

    // The card travels with the motion its Window takes, chosen from how far it goes; under a
    // dragging hand it follows at once.
    const reducedMotion = useReducedMotion()
    const last = useRef(center)
    const distance = Math.hypot(center.x - last.current.x, center.y - last.current.y)
    useEffect(() => { last.current = center }, [center.x, center.y])
    const cardMotion = dragged || reducedMotion ? { duration: 0 } : motionTransition(motionAcross(distance, "window"))

    const icon = space.medium + space.xsmall

    const card = icon + space.xsmall * 2

    // The maximize mark on a card's corner.
    const mark = Math.round(card / 2)

    // The card is a Button, which keeps its pointer events to itself, and the pointer soon leaves so small
    // a card; so the drag listens before the Button does, and then follows the pointer across the page.
    function down(event: ReactPointerEvent<HTMLDivElement>) {

        if (event.button !== 0) return

        const pointer = { x: event.clientX, y: event.clientY }

        const start = center

        const scale = shownScale(event.currentTarget)

        let last: { x: number, y: number } | null = null

        moved.current = false

        function move(event: PointerEvent) {

            const delta = { x: (event.clientX - pointer.x) / scale, y: (event.clientY - pointer.y) / scale }

            // It becomes a drag once the pointer leaves where it went down; until then it may be a press.
            if (!moved.current && Math.hypot(delta.x, delta.y) < space.xsmall) return

            moved.current = true

            // The center stays inside the map's outer views; the Desktop keeps the whole Window on the plane.
            last = {
                x: clamp(start.x + delta.x / cell.width * surface.width, (range.minX - 0.5) * surface.width + 1, (range.maxX + 0.5) * surface.width - 1),
                y: clamp(start.y + delta.y / cell.height * surface.height, (range.minY - 0.5) * surface.height + 1, (range.maxY + 0.5) * surface.height - 1)
            }

            setDragged(last)
        }

        function end(event: PointerEvent) {

            removeEventListener("pointermove", move)
            removeEventListener("pointerup", end)
            removeEventListener("pointercancel", end)

            if (event.type === "pointerup" && last) window.moveTo(last)

            else setDragged(null)
        }

        addEventListener("pointermove", move)
        addEventListener("pointerup", end)
        addEventListener("pointercancel", end)
    }

    return <motion.div className="absolute left-0 top-0 touch-none" onPointerDownCapture={down}
        style={{ width: card, height: card }} initial={false}
        animate={{ x: mapX(shown.x) - card / 2, y: mapY(shown.y) - card / 2 }} transition={cardMotion}>

        {/* Its title shows on hover and focus, above the card; a press, and so a drag, closes it. */}
        <Tooltip>

            <ContextMenu>

                <ContextMenu.Trigger>

                    {/* The front Window is apricot; a minimized one fades; a maximized one carries the title bar's maximize mark. */}
                    <Button size="xsmall" iconOnly depth="flat" color={window.front ? "primary:soft" : "secondary:subtle"}
                        aria-label={windowState(window) ? `${window.title}, ${windowState(window)}` : window.title}
                        onPress={() => { if (!moved.current) window.show() }}
                        style={{ width: card, height: card, paddingInline: 0, opacity: window.minimized ? 0.45 : 1 }}>
                        <img src={window.icon} alt="" draggable={false} className="object-contain" style={{ width: icon, height: icon }} />
                    </Button>

                </ContextMenu.Trigger>

                <ContextMenu.Content portalContainer={menus ?? undefined}>

                    <WindowMenu title={window.title} minimized={window.minimized} maximized={window.maximized}
                        onGoTo={window.show} onBringHere={window.bringHere} onToggleMinimized={window.toggleMinimized} onFill={window.fill} onClose={window.close} />

                </ContextMenu.Content>

            </ContextMenu>

            <Tooltip.Content placement="top" portalContainer={menus ?? undefined}>{window.title}{windowState(window) && ` · ${windowState(window)}`}</Tooltip.Content>

        </Tooltip>

        {window.maximized && <Surface aria-hidden="true" color={window.front ? "primary" : "secondary"} radius="full" className="pointer-events-none grid place-items-center"
            style={{ position: "absolute", top: -mark / 3, right: -mark / 3, width: mark, height: mark, opacity: window.minimized ? 0.45 : 1 }}>
            <Maximize2 style={{ width: mark * 0.6, height: mark * 0.6 }} strokeWidth={2.5} />
        </Surface>}

    </motion.div>
}

/** What sets a Window apart on the map, in words. */
function windowState(window: MappedWindow) {

    return [window.minimized && "Minimized", window.maximized && "Maximized"].filter(Boolean).join(", ")
}

/** How much larger than its own pixels an element is shown: the Desktop's scale preference, which pointer distances include. */
function shownScale(element: HTMLElement) {

    return element.offsetWidth ? element.getBoundingClientRect().width / element.offsetWidth : 1
}

/** The whole view a dragged frame is near enough to settle on when released, if any. */
function nearView(center: { x: number, y: number }, surface: { width: number, height: number }) {

    const view = { x: Math.round(center.x / surface.width), y: Math.round(center.y / surface.height) }

    const near = Math.abs(center.x - view.x * surface.width) < surface.width * snapReach && Math.abs(center.y - view.y * surface.height) < surface.height * snapReach

    return near ? view : null
}

/** How near a whole view the frame settles on it, as a share of the view. */
const snapReach = 0.2

/** The whole view a region's center is in. */
function viewOf(region: WindowRegion, surface: { width: number, height: number }) {

    return { x: Math.round((region.x + region.width / 2) / surface.width), y: Math.round((region.y + region.height / 2) / surface.height) }
}

/** The whole plane: the views its reach covers on each side of the center. */
const range = { minX: -planeReach, maxX: planeReach, minY: -planeReach, maxY: planeReach }

function clamp(value: number, minimum: number, maximum: number) {

    return Math.min(maximum, Math.max(minimum, value))
}

/** The placement a Window takes against edges of the Desktop: a half against a side, a quarter in a corner. */
function placementAt(direction: Readonly<{ x: number, y: number }>): SnapTarget {

    return {
        position: { x: direction.x > 0 ? "0/1" : "-1/2", y: direction.y > 0 ? "0/1" : "-1/2" },
        size: { width: direction.x ? "1/2" : "1/1", height: direction.y ? "1/2" : "1/1" }
    }
}
