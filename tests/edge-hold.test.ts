import { EdgeHold, against, type Direction } from "@client/view/structure/desktop/edge-hold"
import { afterEach, beforeEach, expect, test, vi } from "vitest"

const right: Direction = { x: 1, y: 0 }
const away: Direction = { x: 0, y: 0 }

beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal("window", globalThis)
})

afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

test("a point is held against an edge only within 3 pixels of it, or beyond it", () => {
    expect(against(500, 400, 1000, 800)).toEqual({ x: 0, y: 0 })
    expect(against(4, 400, 1000, 800)).toEqual({ x: 0, y: 0 })
    expect(against(3, 400, 1000, 800)).toEqual({ x: -1, y: 0 })
    expect(against(-20, 400, 1000, 800)).toEqual({ x: -1, y: 0 })
    expect(against(996, 400, 1000, 800)).toEqual({ x: 0, y: 0 })
    expect(against(997, 797, 1000, 800)).toEqual({ x: 1, y: 1 })
    expect(against(500, 900, 1000, 800)).toEqual({ x: 0, y: 1 })
})

test("held against an edge, it takes the view after 700 milliseconds, then again once the view arrived", () => {
    const travels: Direction[] = []
    const hold = new EdgeHold(direction => { travels.push(direction); return 300 })

    hold.update(right)
    vi.advanceTimersByTime(699)
    expect(travels).toEqual([])

    vi.advanceTimersByTime(1)
    expect(travels).toEqual([right])

    // The view takes 300 milliseconds, then a half second passes.
    vi.advanceTimersByTime(800)
    expect(travels).toEqual([right, right])
})

test("a hand that leaves the edge before 700 milliseconds does not take the view", () => {
    const travel = vi.fn(() => 300)
    const hold = new EdgeHold(travel)

    hold.update(right)
    vi.advanceTimersByTime(500)
    hold.update(away)
    vi.advanceTimersByTime(5000)

    expect(travel).not.toHaveBeenCalled()
})

test("where the plane goes no further, it says so until the hand leaves", () => {
    const blocked: boolean[] = []
    const hold = new EdgeHold(() => null, value => blocked.push(value))

    hold.update(right)
    vi.advanceTimersByTime(700)
    expect(blocked).toEqual([true])

    hold.update(away)
    expect(blocked).toEqual([true, false])
})
