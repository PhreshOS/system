import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react"

/** The immutable state beneath a readiness boundary. */
export class ReadinessState<Requirement = unknown> {

    public readonly requirements: readonly Requirement[]

    public readonly pending: readonly Requirement[]

    private constructor(requirements: readonly Requirement[], pending: readonly Requirement[]) {

        this.requirements = [...requirements]

        this.pending = [...pending]
    }

    public static start<Requirement>(requirements: readonly Requirement[]) {

        validate(requirements)

        return new ReadinessState<Requirement>(requirements, requirements)
    }

    /** Mark one known requirement ready. Repeated readiness is harmless. */
    public ready(requirement: Requirement) {

        if (!hasRequirement(this.requirements, requirement)) throw new Error("Readiness does not know that requirement")

        if (!hasRequirement(this.pending, requirement)) return this

        const pending = this.pending.filter(candidate => !Object.is(candidate, requirement))

        return new ReadinessState<Requirement>(this.requirements, pending)
    }

    /** Add new work or restore one completed requirement. */
    public require(requirement: Requirement) {

        if (hasRequirement(this.pending, requirement)) return this

        const requirements = hasRequirement(this.requirements, requirement)
            ? this.requirements
            : [...this.requirements, requirement]

        const restored = [...this.pending, requirement]

        return new ReadinessState<Requirement>(requirements, requirements.filter(candidate => hasRequirement(restored, candidate)))
    }
}

const ReadinessContext = createContext<ReadinessValue<unknown> | null>(null)

/** Provides one readiness lifecycle to every operation inside the boundary. */
export default function Readiness<Requirement>({ requirements, children }: ReadinessProps<Requirement>) {

    const declared = useRef<readonly Requirement[] | null>(null)

    declared.current ??= [...requirements]

    if (!sameRequirements(declared.current, requirements)) throw new Error("Readiness requirements cannot change after the boundary mounts")

    const [state, setState] = useState(() => ReadinessState.start(requirements))

    const current = useRef(state)

    const change = useCallback(function (next: ReadinessState<Requirement>) {

        if (next === current.current) return

        current.current = next

        setState(next)
    }, [])

    const ready = useCallback(function (requirement: Requirement) {

        change(current.current.ready(requirement))
    }, [change])

    const require = useCallback(function (requirement: Requirement) {

        change(current.current.require(requirement))
    }, [change])

    const value = useMemo<ReadinessValue<Requirement>>(() => ({

        pending: state.pending,

        ready,

        require

    }), [ready, require, state.pending])

    return <ReadinessContext.Provider value={value as unknown as ReadinessValue<unknown>}>{children}</ReadinessContext.Provider>
}

/** Observe pending work or render one representation only while work remains. */
function Pending<Requirement = unknown>({ children }: PendingProps<Requirement>) {

    const { pending } = useReadiness<Requirement>()

    if (typeof children === "function") return children(pending)

    return pending.length ? children : null
}

Readiness.Pending = Pending

/** Access the nearest readiness boundary. */
export function useReadiness<Requirement = unknown>() {

    const readiness = useContext(ReadinessContext)

    if (!readiness) throw new Error("Readiness was not provided")

    return readiness as ReadinessValue<Requirement>
}

/** Register pending work owned by this component and return its completion. */
export function useRequirement<Requirement>(requirement: Requirement) {

    const { ready, require } = useReadiness<Requirement>()

    useLayoutEffect(function () {

        require(requirement)

        return () => ready(requirement)
    }, [ready, require, requirement])

    return useCallback(() => ready(requirement), [ready, requirement])
}

/** Treat this component's mounted presence as proof of readiness. */
export function useReady<Requirement>(requirement: Requirement) {

    const { ready, require } = useReadiness<Requirement>()

    useLayoutEffect(function () {

        ready(requirement)

        return () => require(requirement)
    }, [ready, require, requirement])
}

function sameRequirements<Requirement>(left: readonly Requirement[], right: readonly Requirement[]) {

    return left.length === right.length && left.every((requirement, index) => Object.is(requirement, right[index]))
}

function hasRequirement<Requirement>(requirements: readonly Requirement[], requirement: Requirement) {

    // Requirements are opaque to readiness; their own identity is the only
    // relation the lifecycle may use.
    return requirements.some(candidate => Object.is(candidate, requirement))
}

function validate<Requirement>(requirements: readonly Requirement[]) {

    const known: Requirement[] = []

    for (const requirement of requirements) {

        if (hasRequirement(known, requirement)) throw new Error("Readiness already knows that requirement")

        known.push(requirement)
    }
}

interface ReadinessProps<Requirement> {

    requirements: readonly Requirement[]

    children: ReactNode
}

interface PendingProps<Requirement> {

    children: ReactNode | ((pending: readonly Requirement[]) => ReactNode)
}

export interface ReadinessValue<Requirement = unknown> {

    pending: readonly Requirement[]

    ready: (requirement: Requirement) => void

    require: (requirement: Requirement) => void
}
