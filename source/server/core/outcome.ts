import { type Outcome } from "@phreshos/core"

export type { Outcome } from "@phreshos/core"

/** Wrap a successful boundary result, including `undefined`, without ambiguity. */
export function succeeded<Result>(result: Result): Outcome<Result> {

    return { success: true, result }
}

/**
 * Normalize a thrown value at the boundary where it occurred.
 *
 * Arbitrary thrown values never become transport data. An Error may disclose
 * its message only where the caller is permitted to receive details.
 */
export function failed(exception: unknown, disclose = true): Outcome<never> {

    return {

        success: false,

        error: disclose && exception instanceof Error ? exception.message : "An unknown exception occurred"
    }
}

/** Resolve a successful boundary outcome or reconstruct its failure locally. */
export function unwrap<Result>(outcome: Outcome<Result>): Result {

    if (!outcome || typeof outcome !== "object" || !("success" in outcome)) throw new Error("The boundary returned an invalid outcome")

    // JSON omits an `undefined` property. Success is the known envelope fact;
    // reading its absent result reconstructs that valid `undefined` value.
    if (outcome.success === true) return outcome.result

    if (outcome.success !== false || !("error" in outcome) || typeof outcome.error !== "string") throw new Error("The boundary returned an invalid outcome")

    throw new Error(outcome.error)
}
