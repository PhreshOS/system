import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react"

/** The immutable state beneath a readiness boundary. */
export class ReadinessState {

    public readonly requirements: readonly string[]

    public readonly pending: readonly string[]

    private constructor(requirements: readonly string[], pending: readonly string[]) {

        this.requirements = [...requirements]

        this.pending = [...pending]
    }

    public static start(requirements: readonly string[]) {

        validate(requirements)

        return new ReadinessState(requirements, requirements)
    }

    /** Mark one known requirement ready. Repeated readiness is harmless. */
    public ready(requirement: string) {

        if (!this.requirements.includes(requirement)) throw new Error(`Readiness does not know the requirement "${requirement}"`)

        if (!this.pending.includes(requirement)) return this

        const pending = this.pending.filter(candidate => candidate !== requirement)

        return new ReadinessState(this.requirements, pending)
    }

    /** Add new work or restore one completed requirement. */
    public require(requirement: string) {

        validateRequirement(requirement)

        if (this.pending.includes(requirement)) return this

        const requirements = this.requirements.includes(requirement)
            ? this.requirements
            : [...this.requirements, requirement]

        const restored = new Set([...this.pending, requirement])

        return new ReadinessState(requirements, requirements.filter(candidate => restored.has(candidate)))
    }
}

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

/** Observe pending work or render one representation only while work remains. */
function Pending({ children }: PendingProps) {

    const { pending } = useReadiness()

    if (typeof children === "function") return children(pending)

    return pending.length ? children : null
}

Readiness.Pending = Pending

/** Access the nearest readiness boundary. */
export function useReadiness() {

    const readiness = useContext(ReadinessContext)

    if (!readiness) throw new Error("Readiness was not provided")

    return readiness
}

/** Register pending work owned by this component and return its completion. */
export function useRequirement(requirement: string) {

    const { ready, require } = useReadiness()

    useLayoutEffect(function () {

        require(requirement)

        return () => ready(requirement)
    }, [ready, require, requirement])

    return useCallback(() => ready(requirement), [ready, requirement])
}

/** Treat this component's mounted presence as proof of readiness. */
export function useReady(requirement: string) {

    const { ready, require } = useReadiness()

    useLayoutEffect(function () {

        ready(requirement)

        return () => require(requirement)
    }, [ready, require, requirement])
}

function sameRequirements(left: readonly string[], right: readonly string[]) {

    return left.length === right.length && left.every((requirement, index) => requirement === right[index])
}

function validate(requirements: readonly string[]) {

    const known = new Set<string>()

    for (const requirement of requirements) {

        validateRequirement(requirement)

        if (known.has(requirement)) throw new Error(`Readiness already knows the requirement "${requirement}"`)

        known.add(requirement)
    }
}

function validateRequirement(requirement: string) {

    if (!requirement.trim()) throw new Error("A readiness requirement must have a name")
}

interface ReadinessProps {

    requirements: readonly string[]

    children: ReactNode
}

interface PendingProps {

    children: ReactNode | ((pending: readonly string[]) => ReactNode)
}

export interface ReadinessValue {

    pending: readonly string[]

    ready: (requirement: string) => void

    require: (requirement: string) => void
}
