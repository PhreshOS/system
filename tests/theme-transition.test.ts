import assert from "node:assert/strict"
import type { AppearanceTransaction } from "@phreshos/core"
import { transitionTheme } from "@client/view/appearance/theme-transition"
import { test } from "vitest"

const transaction = { duration: 180, easing: [0.2, 0.4, 0.6, 0.8] } satisfies AppearanceTransaction

test("theme transitions capture one complete old and new document state", async () => {
    const ready = deferred()
    const finished = deferred()
    const commit = deferred()
    const document = fakeDocument()
    let update: (() => Promise<void>) | undefined
    let changes = 0

    document.startViewTransition = callback => {
        update = callback
        return {
            ready: ready.promise,
            finished: finished.promise,
            skipTransition() {}
        }
    }

    const complete = transitionTheme(document as unknown as Document, transaction, true, async () => {
        changes += 1
        await commit.promise
    })

    assert.equal(changes, 0)
    assert.equal(document.documentElement.dataset.phreshosThemeTransition, "")
    assert.equal(document.documentElement.style.values.get("--phreshos-theme-transition-duration"), "180ms")
    assert.equal(document.documentElement.style.values.get("--phreshos-theme-transition-easing"), "cubic-bezier(0.2, 0.4, 0.6, 0.8)")

    const updated = update!()

    assert.equal(changes, 1)
    assert.equal(document.documentElement.dataset.phreshosThemeCapture, "")

    commit.resolve()
    await updated

    ready.resolve()
    await ready.promise
    await Promise.resolve()

    assert.equal(document.documentElement.dataset.phreshosThemeCapture, undefined)
    assert.equal(document.documentElement.dataset.phreshosThemeTransition, "")

    finished.resolve()
    await complete
    await Promise.resolve()

    assert.equal(document.documentElement.dataset.phreshosThemeTransition, undefined)
    assert.equal(document.documentElement.style.values.size, 0)
})

test("theme changes remain functional without animation support", async () => {
    const document = fakeDocument()
    let changes = 0

    await transitionTheme(document as unknown as Document, transaction, true, async () => {
        changes += 1
    })

    assert.equal(changes, 1)
    assert.deepEqual(document.documentElement.dataset, {})
    assert.equal(document.documentElement.style.values.size, 0)
})

test("disabling animations interrupts an active theme transition", async () => {
    const firstReady = deferred()
    const firstFinished = deferred()
    const document = fakeDocument()
    let skipped = false

    document.startViewTransition = () => ({
        ready: firstReady.promise,
        finished: firstFinished.promise,
        skipTransition() { skipped = true }
    })

    void transitionTheme(document as unknown as Document, transaction, true, async () => {})
    await transitionTheme(document as unknown as Document, transaction, false, async () => {})

    assert.equal(skipped, true)
    assert.deepEqual(document.documentElement.dataset, {})
    assert.equal(document.documentElement.style.values.size, 0)

    firstReady.resolve()
    firstFinished.resolve()
})

function deferred() {
    let resolve!: () => void
    const promise = new Promise<void>(accept => { resolve = accept })

    return { promise, resolve }
}

function fakeDocument() {
    const dataset: Record<string, string | undefined> = {}
    const values = new Map<string, string>()

    return {
        documentElement: {
            dataset,
            style: {
                values,
                setProperty(name: string, value: string) { values.set(name, value) },
                removeProperty(name: string) { values.delete(name) }
            }
        },
        startViewTransition: undefined as undefined | ((update: () => Promise<void>) => {
            ready: Promise<unknown>
            finished: Promise<unknown>
            skipTransition(): void
        })
    }
}
