import type { AppearanceTransaction } from "@phreshos/core"
import { cssEasing } from "./motion"

const durationProperty = "--phreshos-theme-transition-duration"
const easingProperty = "--phreshos-theme-transition-easing"

type NativeViewTransition = Readonly<{
    ready: Promise<unknown>
    finished: Promise<unknown>
    skipTransition: () => void
}>

type ViewTransitionDocument = Document & Readonly<{
    startViewTransition?: (update: () => Promise<void>) => NativeViewTransition
}>

type ActiveTransition = Readonly<{
    revision: number
    transition: NativeViewTransition
}>

const active = new WeakMap<Document, ActiveTransition>()
const revisions = new WeakMap<Document, number>()

/** Applies one theme state change through the document's old and new rendered views. */
export function transitionTheme(
    document: Document,
    transaction: AppearanceTransaction,
    animated: boolean,
    update: () => Promise<void>
) {
    const target = document as ViewTransitionDocument
    const revision = (revisions.get(document) ?? 0) + 1
    const previous = active.get(document)

    revisions.set(document, revision)

    if (!animated || !target.startViewTransition) {
        previous?.transition.skipTransition()
        active.delete(document)
        clearTransition(document)
        return update()
    }

    const root = document.documentElement
    root.dataset.phreshosThemeTransition = ""
    root.style.setProperty(durationProperty, `${transaction.duration}ms`)
    root.style.setProperty(easingProperty, cssEasing(transaction.easing))

    let view: NativeViewTransition

    try {
        view = target.startViewTransition(async () => {
            if (revisions.get(document) !== revision) return

            root.dataset.phreshosThemeCapture = ""
            await update()
        })
    }
    catch {
        previous?.transition.skipTransition()
        active.delete(document)
        clearTransition(document)
        return update()
    }

    active.set(document, { revision, transition: view })

    // The new view is live, not a still image: any late commit would animate
    // inside it. Changes stay instant until the whole transition finishes.
    settle(view.finished, () => {
        if (active.get(document)?.revision !== revision) return

        active.delete(document)
        clearTransition(document)
    })

    return view.finished.then(() => undefined, () => undefined)
}

function settle(promise: Promise<unknown>, complete: () => void) {
    void promise.then(complete, complete)
}

function clearTransition(document: Document) {
    const root = document.documentElement

    delete root.dataset.phreshosThemeCapture
    delete root.dataset.phreshosThemeTransition
    root.style.removeProperty(durationProperty)
    root.style.removeProperty(easingProperty)
}
