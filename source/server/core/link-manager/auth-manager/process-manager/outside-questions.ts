import { randomUUID } from "node:crypto"
import type { RequestOutcome } from "@libs/request-outcome"
import type ServerProcessBoundary from "./server-process-boundary"

/** Active questions from trusted System views that are not Program Endpoints. */
export default class OutsideQuestions {

    private readonly pending = new Map<string, Pending>()

    public ask(
        target: ServerProcessBoundary,
        timeout: number,
        signal: AbortSignal | undefined,
        send: (question: string, publicQuestion: string) => Promise<unknown>
    ) {

        const question = `outside:${randomUUID()}`
        const publicQuestion = randomUUID()

        return new Promise<unknown>((resolve, reject) => {

            const cancel = () => this.reject(question, signal?.reason instanceof Error ? signal.reason : new Error("The question was cancelled"))
            const timer = setTimeout(() => this.reject(question, new Error(`Answer timeout ${timeout}ms`)), timeout)

            this.pending.set(question, {
                resolve,
                reject,
                timer,
                target,
                release: () => signal?.removeEventListener("abort", cancel)
            })

            signal?.addEventListener("abort", cancel, { once: true })

            if (signal?.aborted) cancel()
            else send(question, publicQuestion).catch(error => this.reject(question, error instanceof Error ? error : new Error(String(error))))
        })
    }

    public answer(question: string, outcome: RequestOutcome) {

        const pending = this.take(question)

        if (!pending) return

        if (outcome?.success === true) pending.resolve(outcome.result)
        else pending.reject(new Error(outcome?.success === false ? outcome.error : "The Endpoint returned an invalid answer"))
    }

    private reject(question: string, error: Error) {

        const pending = this.take(question)

        if (!pending) return

        pending.target.forget(question)
        pending.reject(error)
    }

    private take(question: string) {

        const pending = this.pending.get(question)

        if (!pending) return null

        clearTimeout(pending.timer)
        pending.release()
        this.pending.delete(question)

        return pending
    }
}

interface Pending {
    resolve(value: unknown): void
    reject(error: Error): void
    timer: NodeJS.Timeout
    target: ServerProcessBoundary
    release(): void
}
