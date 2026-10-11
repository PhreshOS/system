import { useLayoutEffect, useRef, useState } from "react"

/** A standard Window as focus weighs it on this Desktop. */
export interface FocusCandidate {
    identity: string
    /** Its rank among standard Windows; raising it gives it the greatest. */
    depth: number
    /** Shown, neither minimized nor leaving. */
    available: boolean
    /** Any part of it lies where this Desktop looks. */
    inView: boolean
}

export interface FocusState {
    focused: string | null
    /** Each Window's depth when focus last looked, to tell a raise from a Window that stayed put. */
    depths: ReadonlyMap<string, number>
}

export const noFocus: FocusState = { focused: null, depths: new Map() }

/**
 * Which standard Window this Desktop focuses: the one last raised while in its view. A Window raised
 * where this Desktop does not look is raised, not focused. One raised here (`raisedHere`) may not
 * change the order at all, being in front already, so it is named rather than found by its depth.
 * When the focused one is minimized or gone, focus falls to the front Window still in view, or none.
 */
export function followFocus(previous: FocusState, candidates: readonly FocusCandidate[], raisedHere: string | null = null): FocusState {

    const available = candidates.filter(candidate => candidate.available)

    const front = available.reduce<FocusCandidate | null>((best, candidate) => !best || best.depth <= candidate.depth ? candidate : best, null)

    // Raised since focus last looked: in front now, and deeper than it was, or new.
    const raised = front && front.depth > (previous.depths.get(front.identity) ?? -Infinity) ? front : null

    const named = raisedHere === null ? null : available.find(candidate => candidate.identity === raisedHere) ?? null

    const chosen = [named, raised].find(candidate => candidate?.inView) ?? null

    let focused = chosen?.identity ?? previous.focused

    if (!available.some(candidate => candidate.identity === focused)) {
        const inView = available.filter(candidate => candidate.inView)
        focused = inView.reduce<FocusCandidate | null>((best, candidate) => !best || best.depth <= candidate.depth ? candidate : best, null)?.identity ?? null
    }

    return { focused, depths: new Map(candidates.map(candidate => [candidate.identity, candidate.depth])) }
}

/** Follows which standard Window this Desktop focuses, as its Windows and its view change. */
export default function useFocusedWindow(candidates: readonly FocusCandidate[], raisedHere: Readonly<{ identity: string }> | null): string | null {

    const [state, setState] = useState<FocusState>(noFocus)

    // Each raise here counts once: a Window that moves later was not raised again.
    const counted = useRef<object | null>(null)

    // Looked at again whenever a Window's rank, presence, or place in view changes, or this Desktop raises one.
    const key = candidates.map(candidate => `${candidate.identity}:${candidate.depth}:${candidate.available ? 1 : 0}${candidate.inView ? 1 : 0}`).join(" ")

    useLayoutEffect(function () {

        const fresh = raisedHere && raisedHere !== counted.current ? raisedHere.identity : null

        counted.current = raisedHere

        setState(previous => {

            const next = followFocus(previous, candidates, fresh)

            const same = next.focused === previous.focused && next.depths.size === previous.depths.size && [...next.depths].every(([identity, depth]) => previous.depths.get(identity) === depth)

            return same ? previous : next
        })

    }, [key, raisedHere])

    return state.focused
}
