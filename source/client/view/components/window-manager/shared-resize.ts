import { minimumWindowSize, type WindowRegion } from "./window-geometry"

export interface SharedResizeWindow {

    identity: string

    geometry: WindowRegion

    depth: number
}

export interface SharedResizeBoundary {

    identity: string

    orientation: "horizontal" | "vertical"

    position: number

    start: number

    end: number

    before: readonly string[]

    after: readonly string[]

    segments: readonly SharedResizeSegment[]
}

export interface SharedResizeSegment {

    start: number

    end: number

    depth: number
}

const alignmentTolerance = 1

/** Finds connected contacts between opposite edges of visible standard windows. */
export function sharedResizeBoundaries(windows: readonly SharedResizeWindow[]) {

    const contacts: Contact[] = []

    for (let firstIndex = 0; firstIndex < windows.length; firstIndex++) {

        for (let secondIndex = firstIndex + 1; secondIndex < windows.length; secondIndex++) {

            const first = windows[firstIndex]

            const second = windows[secondIndex]

            verticalContact(contacts, first, second)

            verticalContact(contacts, second, first)

            horizontalContact(contacts, first, second)

            horizontalContact(contacts, second, first)
        }
    }

    const groups: Contact[][] = []

    for (const contact of contacts) {

        const touching = groups.filter(group => group.some(member => connected(member, contact)))

        if (!touching.length) {

            groups.push([contact])

            continue
        }

        const merged = [contact, ...touching.flat()]

        for (const group of touching) groups.splice(groups.indexOf(group), 1)

        groups.push(merged)
    }

    return groups.map(boundary)
}

/** Applies one boundary displacement while preserving every participant's far edge. */
export function resizeSharedBoundary(boundary: SharedResizeBoundary, windows: readonly SharedResizeWindow[], requestedDelta: number) {

    const participants = new Map(windows.map(window => [window.identity, window.geometry]))

    let minimumDelta = Number.NEGATIVE_INFINITY

    let maximumDelta = Number.POSITIVE_INFINITY

    for (const identity of boundary.before) {

        const geometry = required(participants, identity)

        minimumDelta = Math.max(minimumDelta, minimum(boundary.orientation) - span(geometry, boundary.orientation))
    }

    for (const identity of boundary.after) {

        const geometry = required(participants, identity)

        maximumDelta = Math.min(maximumDelta, span(geometry, boundary.orientation) - minimum(boundary.orientation))
    }

    const delta = Math.min(Math.max(requestedDelta, minimumDelta), maximumDelta)

    const geometries = new Map<string, WindowRegion>()

    for (const identity of boundary.before) {

        const geometry = required(participants, identity)

        geometries.set(identity, boundary.orientation === "vertical"
            ? { ...geometry, width: geometry.width + delta }
            : { ...geometry, height: geometry.height + delta })
    }

    for (const identity of boundary.after) {

        const geometry = required(participants, identity)

        geometries.set(identity, boundary.orientation === "vertical"
            ? { ...geometry, x: geometry.x + delta, width: geometry.width - delta }
            : { ...geometry, y: geometry.y + delta, height: geometry.height - delta })
    }

    return { delta, geometries }
}

interface Contact {

    orientation: SharedResizeBoundary["orientation"]

    position: number

    start: number

    end: number

    before: string

    after: string

    depth: number
}

function verticalContact(contacts: Contact[], before: SharedResizeWindow, after: SharedResizeWindow) {

    const edge = before.geometry.x + before.geometry.width

    if (!near(edge, after.geometry.x)) return

    const start = Math.max(before.geometry.y, after.geometry.y)

    const end = Math.min(before.geometry.y + before.geometry.height, after.geometry.y + after.geometry.height)

    if (end <= start) return

    contacts.push({ orientation: "vertical", position: (edge + after.geometry.x) / 2, start, end, before: before.identity, after: after.identity, depth: Math.max(before.depth, after.depth) })
}

function horizontalContact(contacts: Contact[], before: SharedResizeWindow, after: SharedResizeWindow) {

    const edge = before.geometry.y + before.geometry.height

    if (!near(edge, after.geometry.y)) return

    const start = Math.max(before.geometry.x, after.geometry.x)

    const end = Math.min(before.geometry.x + before.geometry.width, after.geometry.x + after.geometry.width)

    if (end <= start) return

    contacts.push({ orientation: "horizontal", position: (edge + after.geometry.y) / 2, start, end, before: before.identity, after: after.identity, depth: Math.max(before.depth, after.depth) })
}

function connected(first: Contact, second: Contact) {

    return first.orientation === second.orientation
        && near(first.position, second.position)
        && second.start <= first.end + alignmentTolerance
        && first.start <= second.end + alignmentTolerance
}

function boundary(contacts: readonly Contact[]): SharedResizeBoundary {

    const orientation = contacts[0].orientation

    const before = [...new Set(contacts.map(contact => contact.before))].sort()

    const after = [...new Set(contacts.map(contact => contact.after))].sort()

    return {
        identity: `${orientation}:${before.join(",")}:${after.join(",")}`,
        orientation,
        position: contacts.reduce((total, contact) => total + contact.position, 0) / contacts.length,
        start: Math.min(...contacts.map(contact => contact.start)),
        end: Math.max(...contacts.map(contact => contact.end)),
        before,
        after,
        segments: boundarySegments(contacts)
    }
}

function boundarySegments(contacts: readonly Contact[]): SharedResizeSegment[] {

    const points = [...new Set(contacts.flatMap(contact => [contact.start, contact.end]))].sort((first, second) => first - second)

    const segments: SharedResizeSegment[] = []

    for (let index = 0; index < points.length - 1; index++) {

        const start = points[index]

        const end = points[index + 1]

        const covering = contacts.filter(contact => contact.start < end && contact.end > start)

        if (!covering.length) continue

        const depth = Math.max(...covering.map(contact => contact.depth))

        const previous = segments.at(-1)

        if (previous && previous.end === start && previous.depth === depth) {

            previous.end = end

            continue
        }

        segments.push({ start, end, depth })
    }

    return segments
}

function span(geometry: WindowRegion, orientation: SharedResizeBoundary["orientation"]) {

    return orientation === "vertical" ? geometry.width : geometry.height
}

function minimum(orientation: SharedResizeBoundary["orientation"]) {

    return orientation === "vertical" ? minimumWindowSize.width : minimumWindowSize.height
}

function near(first: number, second: number) {

    return Math.abs(first - second) <= alignmentTolerance
}

function required(windows: ReadonlyMap<string, WindowRegion>, identity: string) {

    const geometry = windows.get(identity)

    if (!geometry) throw new Error(`The shared resize Window "${identity}" is unavailable`)

    return geometry
}
