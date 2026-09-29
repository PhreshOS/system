/** Internal result envelope for a correlated request. */
export type RequestOutcome<Result = unknown> =
    | Readonly<{ success: true, result: Result }>
    | Readonly<{ success: false, error: string }>

export function succeeded<Result>(result: Result): RequestOutcome<Result> {

    return { success: true, result }
}

/**
 * A failure as the one who asked may read it. A refusal the System wrote itself, a plain `Error`,
 * always says why, since a Program needs the reason to correct what it asked. Anything else, such as
 * a failure in the runtime, an operating system error carrying its `code`, or a library's own error,
 * is told only while `disclose` allows it, so what lies beneath does not reach a Program.
 */
export function failed(exception: unknown, disclose = true): RequestOutcome<never> {

    return {

        success: false,

        error: exception instanceof Error && (disclose || refusal(exception)) ? exception.message : "An unknown exception occurred"
    }
}

/** Whether an error is the System refusing in its own words, rather than something failing beneath it. */
function refusal(exception: Error) {

    return Object.getPrototypeOf(exception) === Error.prototype && !("code" in exception)
}

export function unwrap<Result>(outcome: RequestOutcome<Result>): Result {

    if (!outcome || typeof outcome !== "object" || !("success" in outcome)) throw new Error("The boundary returned an invalid outcome")

    if (outcome.success === true) return outcome.result

    if (outcome.success !== false || !("error" in outcome) || typeof outcome.error !== "string") throw new Error("The boundary returned an invalid outcome")

    throw new Error(outcome.error)
}
