import { beforeEach, expect, test, vi } from "vitest"
import { animate, motionValue, type MotionValue, type ValueAnimationTransition } from "motion/react"
import { WindowGeometryAnimation } from "@client/view/structure/desktop/windows/window-geometry-animation"

vi.mock("motion/react", async importOriginal => ({
    ...await importOriginal<typeof import("motion/react")>(),
    animate: vi.fn((value: MotionValue<number>, target: number, options: ValueAnimationTransition<number>) => {
        const start = value.get()
        const run = {
            stop: vi.fn(),
            progress: (fraction: number) => value.set(start + (target - start) * fraction),
            finish: () => { value.set(target); options.onComplete?.() }
        }
        runs.push(run)
        return run
    })
}))

const runs: { stop: ReturnType<typeof vi.fn>, progress: (fraction: number) => void, finish: () => void }[] = []
const timing = { duration: 120, easing: "ease-out" } as const
const initial = { x: 10, y: 20, width: 300, height: 200 }

beforeEach(() => {
    runs.length = 0
    vi.mocked(animate).mockClear()
})

function create() {
    const values = {
        x: motionValue(initial.x), y: motionValue(initial.y),
        width: motionValue(initial.width), height: motionValue(initial.height)
    }
    const layout = { width: motionValue(initial.width), height: motionValue(initial.height) }
    return { values, layout, animator: new WindowGeometryAnimation(values, layout) }
}

test("resize keeps destination layout fixed while visible dimensions interpolate", () => {
    const { animator, values, layout } = create()
    animator.transition({ ...initial, width: 600, height: 400 }, timing)
    expect(layout.width.get()).toBe(600)
    expect(layout.height.get()).toBe(400)
    expect(values.width.get() / layout.width.get()).toBe(0.5)
    for (const run of runs) run.progress(0.5)
    expect(values.width.get()).toBe(450)
    expect(values.height.get()).toBe(300)
    expect(layout.width.get()).toBe(600)
    expect(layout.height.get()).toBe(400)
    expect(values.width.get() / layout.width.get()).toBe(0.75)
    for (const run of runs) run.finish()
    expect(values.width.get() / layout.width.get()).toBe(1)
    expect(values.height.get() / layout.height.get()).toBe(1)
})

test("retargeting preserves visible size and pointer interruption restores unscaled layout", () => {
    const { animator, values, layout } = create()
    animator.transition({ ...initial, width: 600 }, timing)
    runs[0].progress(0.5)
    animator.transition({ ...initial, width: 900 }, timing)
    expect(values.width.get()).toBe(450)
    expect(layout.width.get()).toBe(900)
    animator.stop()
    expect(values.width.get()).toBe(450)
    expect(layout.width.get()).toBe(450)
    animator.set({ ...initial, width: 480 })
    expect(values.width.get()).toBe(480)
    expect(layout.width.get()).toBe(480)
})

test("zero-size destinations retain finite backing dimensions until completion", () => {
    const { animator, values, layout } = create()
    animator.transition({ ...initial, width: 0, height: 0 }, timing)
    expect(layout.width.get()).toBe(300)
    expect(layout.height.get()).toBe(200)
    for (const run of runs) run.finish()
    expect(values.width.get()).toBe(0)
    expect(layout.width.get()).toBe(0)
    animator.transition(initial, timing)
    expect(layout.width.get()).toBe(300)
    expect(values.width.get()).toBe(0)
})

test("a stream of width targets does not restart the position or height animation", () => {
    const { animator } = create()
    animator.transition({ ...initial, x: 100, width: 400, height: 500 }, timing)
    for (let width = 401; width <= 420; width++) {
        animator.transition({ ...initial, x: 100, width, height: 500 }, timing)
    }
    expect(runs).toHaveLength(23)
    expect(runs[0].stop).not.toHaveBeenCalled()
    expect(runs[2].stop).not.toHaveBeenCalled()
    expect(runs[1].stop).toHaveBeenCalledOnce()
    expect(vi.mocked(animate).mock.calls[0][2]).toMatchObject({
        type: "tween", duration: 0.12, ease: "easeOut"
    })
})

test("repeated destinations retain their animation and complete only the latest request", () => {
    const { animator } = create()
    const original = vi.fn()
    const latest = vi.fn()
    const target = { ...initial, width: 400 }
    animator.transition(target, timing, original)
    for (let i = 0; i < 100; i++) animator.transition(target, timing, latest)
    expect(runs).toHaveLength(1)
    expect(runs[0].stop).not.toHaveBeenCalled()
    expect(latest).not.toHaveBeenCalled()
    runs[0].finish()
    expect(original).not.toHaveBeenCalled()
    expect(latest).toHaveBeenCalledOnce()
})

test("completion waits for retained axes as well as the replacement axis", () => {
    const { animator } = create()
    const original = vi.fn()
    const latest = vi.fn()
    animator.transition({ ...initial, width: 400, height: 500 }, timing, original)
    animator.transition({ ...initial, width: 450, height: 500 }, timing, latest)
    runs[0].finish() // A late callback from the interrupted tween must be ignored.
    runs[2].finish()
    expect(latest).not.toHaveBeenCalled()
    runs[1].finish()
    expect(original).not.toHaveBeenCalled()
    expect(latest).toHaveBeenCalledOnce()
})

test("a different transaction retimes an unchanged destination", () => {
    const { animator } = create()
    animator.transition({ ...initial, width: 400 }, timing)
    animator.transition({ ...initial, width: 400 }, { duration: 240, easing: "linear" })
    expect(runs[0].stop).toHaveBeenCalledOnce()
    expect(runs).toHaveLength(2)
    expect(vi.mocked(animate).mock.calls[1][2]).toMatchObject({ duration: 0.24, ease: "linear" })
})

test("immediate geometry cancels pending completion and sets all axes", () => {
    const { animator, values } = create()
    const interrupted = vi.fn()
    const complete = vi.fn()
    animator.transition({ ...initial, width: 400 }, timing, interrupted)
    const target = { x: 30, y: 40, width: 500, height: 600 }
    animator.transition(target, { ...timing, duration: 0 }, complete)
    expect(Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value.get()]))).toEqual(target)
    expect(runs[0].stop).toHaveBeenCalledOnce()
    expect(interrupted).not.toHaveBeenCalled()
    expect(complete).toHaveBeenCalledOnce()
})
