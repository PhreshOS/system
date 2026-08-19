import ReadinessState from "./state"
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react"

const ReadinessContext = createContext<ReadinessValue | null>(null)

/** Provides one readiness lifecycle to every operation inside the boundary. */
export default function Readiness({ requirements, children }: ReadinessProps) {

    const declared = useRef<readonly string[] | null>(null)

    declared.current ??= [...requirements]

    if (!sameRequirements(declared.current, requirements)) throw new Error("Readiness requirements cannot change after the boundary mounts")

    const [state, setState] = useState(() => ReadinessState.start(requirements))

    const current = useRef(state)

    const change = useCallback(function (next: ReadinessState) {

        if (next === current.current) return

        current.current = next

        setState(next)
    }, [])

    const ready = useCallback(function (requirement: string) {

        change(current.current.ready(requirement))
    }, [change])

    const require = useCallback(function (requirement: string) {

        change(current.current.require(requirement))
    }, [change])

    const value = useMemo<ReadinessValue>(() => ({

        pending: state.pending,

        ready,

        require

    }), [ready, require, state.pending])

    return <ReadinessContext.Provider value={value}>{children}</ReadinessContext.Provider>
}

/** Renders one stable pending representation until every requirement is ready. */
function Pending({ children }: { children: ReactNode }) {

    const { pending } = useReadiness()

    return pending.length ? children : null
}

Readiness.Pending = Pending

/** Access the nearest readiness boundary. */
export function useReadiness() {

    const readiness = useContext(ReadinessContext)

    if (!readiness) throw new Error("Readiness was not provided")

    return readiness
}

function sameRequirements(left: readonly string[], right: readonly string[]) {

    return left.length === right.length && left.every((requirement, index) => requirement === right[index])
}

interface ReadinessProps {

    requirements: readonly string[]

    children: ReactNode
}

export interface ReadinessValue {

    pending: readonly string[]

    ready: (requirement: string) => void

    require: (requirement: string) => void
}
