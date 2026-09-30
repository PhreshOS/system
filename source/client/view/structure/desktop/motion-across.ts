import { type AppearanceTransaction, type Easing } from "@phreshos/core"

/**
 * The motion of anything the Desktop carries across a distance: the view over the plane, and a
 * standard Window moving, resizing, filling the view, or leaving for the Taskbar. It is chosen for
 * each move from how far it goes, not taken from the Appearance timing: a fixed short time would
 * cross a far distance so fast that frames show as jumps. So the time grows with the distance,
 * gently, as the square root, within bounds, on a curve that starts and ends softly.
 */
export default function motionAcross(distance: number, body: MovingBody = "view", departing = false): AppearanceTransaction {

    const pace = paces[body]

    // Near, the time grows as the square root; a long crossing adds a little more for each pixel
    // past a first stretch, so a far journey is not crossed at a rush.
    const duration = Math.round(Math.min(pace.maximum, Math.max(pace.minimum, pace.base + pace.growth * Math.sqrt(distance) + pace.far * Math.max(0, distance - 1000))))

    // What arrives slows as it lands; what departs, seen only as it sets off, must start softly, or
    // it is gone in the first frames.
    return Object.freeze({ duration, easing: departing ? departure : pace.easing })
}

/**
 * What is moving. The view is a camera crossing a whole scene: it sets off softly and travels
 * slowly. A Window is a light body answering a hand: it sets off at once and settles softly, and
 * the same distance takes it less time.
 */
export type MovingBody = "view" | "window"

/** The curve of something leaving the view: soft to start, gathering speed as it goes. */
const departure = [0.65, 0, 0.35, 1] as const

type Pace = Readonly<{ base: number, growth: number, far: number, minimum: number, maximum: number, easing: Easing }>

const paces: Record<MovingBody, Pace> = {
    // The view moves as a body on a spring: it arrives without passing its place, and a new move
    // taken on the way carries on from how fast it is already going.
    view: { base: 220, growth: 10, far: 0, minimum: 300, maximum: 1000, easing: Object.freeze({ spring: Object.freeze({ bounce: 0 }) }) },
    window: { base: 85, growth: 4, far: 0.05, minimum: 130, maximum: 650, easing: [0.22, 1, 0.36, 1] }
}

/** How far a box travels between two places: its center's path, and half of how much its size changes. */
export function travel(from: Box, to: Box) {

    const moved = Math.hypot(to.x + to.width / 2 - from.x - from.width / 2, to.y + to.height / 2 - from.y - from.height / 2)

    return moved + Math.hypot(to.width - from.width, to.height - from.height) / 2
}

type Box = Readonly<{ x: number, y: number, width: number, height: number }>
