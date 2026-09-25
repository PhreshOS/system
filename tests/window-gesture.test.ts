import { expect, test } from "vitest"
import WindowGestureCommit from "@client/view/structure/desktop/windows/window-gesture-commit"

test("a Window gesture orders its authoritative mutations and settles after the last one", async () => {

    let finish!: (accepted: boolean) => void
    const first = new Promise<boolean>(resolve => { finish = resolve })
    const commit = new WindowGestureCommit()
    const calls: string[] = []
    commit.request(() => {
        calls.push("first")
        return first
    })
    commit.request(() => {
        calls.push("final")
        return Promise.resolve(true)
    })
    let settled = false
    const outcome = commit.settle().then(value => {

        settled = true

        return value
    })

    await Promise.resolve()

    expect(calls).toEqual(["first"])
    expect(settled).toBe(false)

    finish(true)

    await expect(outcome).resolves.toBe(true)
    expect(calls).toEqual(["first", "final"])
})

test("a rejected authoritative mutation restores the Window instead of accepting the gesture", async () => {

    const commit = new WindowGestureCommit()
    let finalCalled = false
    commit.request(() => Promise.reject(new Error("authoritative mutation failed")))
    commit.request(() => {
        finalCalled = true
        return Promise.resolve(true)
    })

    await expect(commit.settle()).resolves.toBe(false)
    expect(finalCalled).toBe(false)
})
