import { EdgeHold, type Direction } from "@client/view/structure/desktop/edge-hold"
import { afterEach, beforeEach, expect, test, vi } from "vitest"

const right: Direction = { x: 1, y: 0 }
const corner: Direction = { x: 1, y: 1 }
const away: Direction = { x: 0, y: 0 }

beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal("window", globalThis)
})

afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

test("a hold that settles waits 300 milliseconds to settle, then 700 more to take the view", () => {
    const travels: Direction[] = []
    const settled: (Direction | null)[] = []
    const hold = new EdgeHold(direction => { travels.push(direction); return 300 }, { onSettled: value => settled.push(value) })

    hold.update(right)
    vi.advanceTimersByTime(299)
    expect(settled).toEqual([])

    vi.advanceTimersByTime(1)
    expect(settled).toEqual([right])
    expect(hold.settled).toEqual(right)

    vi.advanceTimersByTime(699)
    expect(travels).toEqual([])

    vi.advanceTimersByTime(1)
    expect(travels).toEqual([right])

    // Once the view arrived, another after a half second.
    vi.advanceTimersByTime(800)
    expect(travels).toEqual([right, right])
})

test("a hand that leaves before 300 milliseconds neither settles nor takes the view", () => {
    const travel = vi.fn(() => 300)
    const onSettled = vi.fn()
    const hold = new EdgeHold(travel, { onSettled })

    hold.update(right)
    vi.advanceTimersByTime(250)
    hold.update(away)
    vi.advanceTimersByTime(5000)

    expect(onSettled).not.toHaveBeenCalled()
    expect(travel).not.toHaveBeenCalled()
    expect(hold.settled).toBeNull()
})

test("once settled, another edge settles at once and waits 700 milliseconds to take the view", () => {
    const travels: Direction[] = []
    const settled: (Direction | null)[] = []
    const hold = new EdgeHold(direction => { travels.push(direction); return 300 }, { onSettled: value => settled.push(value) })

    hold.update(right)
    vi.advanceTimersByTime(300)
    hold.update(corner)
    expect(settled).toEqual([right, corner])

    vi.advanceTimersByTime(700)
    expect(travels).toEqual([corner])

    hold.update(away)
    expect(settled).toEqual([right, corner, null])
})

test("a hold that only travels, as the Map's, takes the view after 700 milliseconds", () => {
    const travel = vi.fn(() => 300)
    const hold = new EdgeHold(travel)

    hold.update(right)
    vi.advanceTimersByTime(700)

    expect(travel).toHaveBeenCalledWith(right)
    expect(hold.settled).toBeNull()
})

test("where the plane goes no further, it says so until the hand leaves", () => {
    const blocked: boolean[] = []
    const hold = new EdgeHold(() => null, { onBlocked: value => blocked.push(value) })

    hold.update(right)
    vi.advanceTimersByTime(700)
    expect(blocked).toEqual([true])

    hold.update(away)
    expect(blocked).toEqual([true, false])
})
