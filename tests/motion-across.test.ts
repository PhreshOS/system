import { expect, test } from "vitest"
import motionAcross from "@client/view/structure/desktop/motion-across"

test("the motion across a distance grows with the distance it crosses, gently and within bounds", () => {
    const near = motionAcross(120)
    const oneView = motionAcross(1440)
    const twoViews = motionAcross(2880)
    const across = motionAcross(20_000)

    expect(near.duration).toBe(330)
    expect(oneView.duration).toBeGreaterThan(near.duration)
    expect(twoViews.duration).toBeGreaterThan(oneView.duration)
    // Twice as far does not take twice as long.
    expect(twoViews.duration).toBeLessThan(oneView.duration * 1.5)
    expect(across.duration).toBe(1000)
    expect(motionAcross(1).duration).toBe(300)
    // The view moves as a body on a spring that arrives without passing its place.
    expect(oneView.easing).toEqual({ spring: { bounce: 0 } })
})

test("a Window is a lighter body than the view, so the same distance takes it less time", () => {
    for (const distance of [40, 400, 1440, 5000]) {
        expect(motionAcross(distance, "window").duration).toBeLessThan(motionAcross(distance).duration)
    }
    expect(motionAcross(1, "window").duration).toBe(130)
    expect(motionAcross(20_000, "window").duration).toBe(650)
    // A long crossing takes a little more, so it is not crossed at a rush.
    expect(motionAcross(4000, "window").duration).toBeGreaterThan(450)
    expect(motionAcross(300, "window").duration).toBe(Math.round(85 + 4 * Math.sqrt(300)))
    // A Window answers a hand: it sets off at once.
    expect(motionAcross(400, "window").easing).toEqual([0.22, 1, 0.36, 1])
})

test("what leaves the view starts softly, and what arrives lands softly", () => {
    expect(motionAcross(4000, "window", true).easing).toEqual([0.65, 0, 0.35, 1])
    expect(motionAcross(4000, "window").easing).toEqual([0.22, 1, 0.36, 1])
    expect(motionAcross(4000, "window", true).duration).toBe(motionAcross(4000, "window").duration)
})
