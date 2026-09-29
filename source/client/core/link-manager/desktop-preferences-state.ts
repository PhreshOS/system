import { type DesktopPreferences } from "@phreshos/core"
import { Tunnel } from "@the-link/core"

/**
 * The longest a change waits for one Program to show it. A Program built before Programs confirmed
 * what they show never does, and the change goes on without it.
 */
const showingLimit = 150

/** Complete effective preferences owned by one browser Desktop. */
export default class DesktopPreferencesState {

    public readonly tunnel = new Tunnel()

    /** The Programs told of the current change that have not shown it yet, by their pane. */
    private readonly showing = new Map<string, Readonly<{ shown: Promise<void>, resolve: () => void }>>()

    /** Settles once the current preferences are shown, here and by every Program told of them. */
    private settled: Promise<void> = Promise.resolve()

    public constructor(private current: DesktopPreferences) {}

    public get value() {

        return this.current
    }

    /**
     * Makes these the effective preferences and tells every Program that follows them. It settles
     * once each Program told has shown them, or has had its time: a change the Desktop shows in
     * one step, such as a new Theme, waits for it, so Programs change in the same step.
     */
    public update(preferences: DesktopPreferences) {

        if (samePreferences(this.current, preferences)) return this.settled

        this.current = preferences

        this.settled = (async () => {

            // This event is intentionally local: Desktop preferences do not belong
            // to the System transport or to any other Desktop representation.
            await this.tunnel.publish("change", preferences)

            await Promise.all([...this.showing.values()].map(waiting => waiting.shown))
        })()

        return this.settled
    }

    /** One Program is told of the current change; the change is shown once it says so, or its time is up. */
    public telling(pane: string) {

        this.showing.get(pane)?.resolve()

        let resolve!: () => void
        const shown = new Promise<void>(settle => { resolve = settle })
        const timer = setTimeout(() => done(), showingLimit)
        const done = () => {

            clearTimeout(timer)

            if (this.showing.get(pane)?.shown === shown) this.showing.delete(pane)

            resolve()
        }

        this.showing.set(pane, { shown, resolve: done })
    }

    /** A Program says it shows the current preferences. */
    public shown(pane: string) {

        this.showing.get(pane)?.resolve()
    }
}

function samePreferences(first: DesktopPreferences, second: DesktopPreferences) {

    return first.theme === second.theme
        && first.animations === second.animations
        && first.scale === second.scale
}
