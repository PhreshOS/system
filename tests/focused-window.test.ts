import { expect, test } from "vitest"
import { followFocus, noFocus, type FocusCandidate } from "@client/view/structure/desktop/focused-window"

const window = (identity: string, depth: number, inView = true, available = true): FocusCandidate => ({ identity, depth, inView, available })

test("a Desktop opens focusing the front Window among those it looks at", () => {
    expect(followFocus(noFocus, [window("a", 1), window("b", 2), window("c", 3, false)]).focused).toBe("b")
    expect(followFocus(noFocus, [window("a", 1, false)]).focused).toBe(null)
})

test("a Window raised in view is focused; one raised where this Desktop does not look is not", () => {
    const opened = followFocus(noFocus, [window("a", 1), window("b", 2, false)])
    expect(opened.focused).toBe("a")

    // Another Desktop raises b, out of this one's view: raised, not focused here.
    const elsewhere = followFocus(opened, [window("a", 1), window("b", 3, false)])
    expect(elsewhere.focused).toBe("a")

    // Then a Window this Desktop sees: focused here too.
    const seen = followFocus(elsewhere, [window("a", 4), window("b", 3, false)])
    expect(seen.focused).toBe("a")
    const other = followFocus({ focused: "b", depths: seen.depths }, [window("a", 5), window("b", 3, false)])
    expect(other.focused).toBe("a")
})

test("a new Window that opens in view is focused", () => {
    const opened = followFocus(noFocus, [window("a", 1)])
    expect(followFocus(opened, [window("a", 1), window("b", 2)]).focused).toBe("b")
    expect(followFocus(opened, [window("a", 1), window("b", 2, false)]).focused).toBe("a")
})

test("raising here a Window already in front focuses it, though no order changes", () => {
    // b was raised by another Desktop while out of view, then this Desktop's view came to it.
    const state = { focused: "a", depths: new Map([["a", 1], ["b", 2]]) }
    const candidates = [window("a", 1), window("b", 2)]
    expect(followFocus(state, candidates).focused).toBe("a")
    expect(followFocus(state, candidates, "b").focused).toBe("b")
    // Named where this Desktop does not look, it is not focused.
    expect(followFocus(state, [window("a", 1), window("b", 2, false)], "b").focused).toBe("a")
})

test("a Window coming to the front without being raised takes no focus", () => {
    const state = { focused: "a", depths: new Map([["a", 1], ["b", 2], ["c", 3]]) }
    // c is minimized: b is in front now, but nobody raised it.
    expect(followFocus(state, [window("a", 1), window("b", 2), window("c", 3, true, false)]).focused).toBe("a")
})

test("when the focused Window is minimized or gone, focus falls to the front one still in view, or none", () => {
    const state = { focused: "c", depths: new Map([["a", 1], ["b", 2], ["c", 3]]) }
    expect(followFocus(state, [window("a", 1), window("b", 2), window("c", 3, true, false)]).focused).toBe("b")
    expect(followFocus(state, [window("a", 1), window("b", 2, false)]).focused).toBe("a")
    expect(followFocus(state, [window("a", 1, false)]).focused).toBe(null)
})
