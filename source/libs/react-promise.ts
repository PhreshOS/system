import { type DependencyList, useCallback, useEffect, useRef, useState } from "react"

export default function usePromise<Solve>(executor: ExecuteWithDependencies<Solve>, dependencies: DependencyList): PromiseWithDependencies<Solve>

export default function usePromise<Solve, Data extends unknown[]>(executor: ExecuteWithoutDependencies<Solve, Data>): PromiseWithoutDependencies<Solve, Data>

export default function usePromise<Solve, Data extends unknown[]>(executor: ExecuteWithDependencies<Solve> | ExecuteWithoutDependencies<Solve, Data>, dependencies?: DependencyList) {

    const automatic = dependencies !== undefined

    const execution = useRef(0)

    const mounted = useRef(true)

    // Commands stay referentially stable while always calling the
    // executor from the latest render. Without this indirection, an
    // inline executor recreated `execute` and `safeExecute` on every
    // render, which in turn retriggered effects that depended on them.
    const executorReference = useRef(executor)

    executorReference.current = executor

    const initialState: PromiseState<Solve> = automatic ? { status: "pending" } : { status: "idle" }

    const stateReference = useRef<PromiseState<Solve>>(initialState)

    const [state, setState] = useState<PromiseState<Solve>>(initialState)

    useEffect(function () {

        mounted.current = true

        return () => {

            mounted.current = false

            execution.current++
        }

    }, [])

    const changeState = useCallback(function (state: PromiseState<Solve>) {

        if (!mounted.current) return

        stateReference.current = state

        setState(state)

    }, [])

    const reset = useCallback(function () {

        execution.current++

        changeState({ status: "idle" })

    }, [changeState])

    const execute = useCallback(async function (...data: Data) {

        const currentExecution = ++execution.current

        changeState({ status: "pending" })

        try {

            const solve = await (executorReference.current as ExecuteWithoutDependencies<Solve, Data>)(...data)

            if (currentExecution === execution.current) changeState({ status: "solve", solve })

            return solve

        } catch (exception) {

            if (currentExecution === execution.current) changeState({ status: "exception", exception })

            throw exception
        }

    }, [changeState])

    const safeExecute = useCallback(async function (...data: Data) {

        try {

            return await execute(...data)

        } catch {

            return undefined
        }

    }, [execute])

    useEffect(function () {

        if (!automatic) return

        void (safeExecute as () => Promise<Solve | undefined>)()

    }, dependencies ?? [])

    const dispatch = useCallback(function (value: UpdateValue<Solve>) {

        const state = stateReference.current

        if (state.status !== "solve") throw new Error("You can't update a promise before it has resolved")

        changeState({ status: "solve", solve: update(value, state.solve) })

    }, [changeState])

    const forceRender = useCallback(function () {

        dispatch(solve => solve)

    }, [dispatch])

    const methods = { execute, safeExecute, dispatch, forceRender }

    if (automatic) {

        if (state.status === "solve") return { ...methods, solve: state.solve, exception: undefined, isPending: false }

        if (state.status === "exception") return { ...methods, solve: undefined, exception: { current: state.exception }, isPending: false }

        return { ...methods, solve: undefined, exception: undefined, isPending: true }
    }

    return {

        ...methods,

        solve: state.status === "solve" ? { current: state.solve } : undefined,

        exception: state.status === "exception" ? { current: state.exception } : undefined,

        isPending: state.status === "pending",

        reset
    }
}

export function update<Target>(value: UpdateValue<Target>, old: Target): Target {

    return value instanceof Function ? value(old) : value
}

export type UpdateValue<Target> = Target | ((value: Target) => Target)

export type Update<Target> = (value: UpdateValue<Target>) => void

export type ExecuteWithDependencies<Solve> = () => Promise<Solve>

export type ExecuteWithoutDependencies<Solve, Data extends unknown[]> = (...data: Data) => Promise<Solve>

export type PromiseWithDependencies<Solve> = (SolveStatus<Solve> | ExceptionStatus | PendingStatus) & PromiseMethods<Solve, []>

export type PromiseWithoutDependencies<Solve, Data extends unknown[] = []> = {

    solve: Reference<Solve> | undefined

    exception: Reference<unknown> | undefined

    isPending: boolean

    reset: () => void
} & PromiseMethods<Solve, Data>

export interface SolveStatus<Solve> {

    solve: Solve

    exception: undefined

    isPending: false
}

export interface ExceptionStatus {

    solve: undefined

    exception: Reference<unknown>

    isPending: false
}

export interface PendingStatus {

    solve: undefined

    exception: undefined

    isPending: true
}

export interface Reference<Target> {

    current: Target
}

interface PromiseMethods<Solve, Data extends unknown[]> {

    safeExecute: (...data: Data) => Promise<Solve | undefined>

    execute: (...data: Data) => Promise<Solve>

    dispatch: Update<Solve>

    forceRender: () => void
}

type PromiseState<Solve> = {

    status: "idle" | "pending"

} | {

    status: "solve"

    solve: Solve

} | {

    status: "exception"

    exception: unknown
}
