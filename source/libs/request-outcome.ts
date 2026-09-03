/** Internal result envelope for a correlated request. */
export type RequestOutcome<Result = unknown> =
    | Readonly<{ success: true, result: Result }>
    | Readonly<{ success: false, error: string }>

export function succeeded<Result>(result: Result): RequestOutcome<Result> {

    return { success: true, result }
}

export function failed(exception: unknown, disclose = true): RequestOutcome<never> {

    return {

        success: false,

        error: disclose && exception instanceof Error ? exception.message : "An unknown exception occurred"
    }
}

export function unwrap<Result>(outcome: RequestOutcome<Result>): Result {

    if (!outcome || typeof outcome !== "object" || !("success" in outcome)) throw new Error("The boundary returned an invalid outcome")

    if (outcome.success === true) return outcome.result

    if (outcome.success !== false || !("error" in outcome) || typeof outcome.error !== "string") throw new Error("The boundary returned an invalid outcome")

    throw new Error(outcome.error)
}
