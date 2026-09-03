/** Execution boundary presented to the System domain by any Server runtime adapter. */
export interface ServerRuntime {

    readonly finished: Promise<ServerRuntimeEnding>

    send(event: string, ...values: unknown[]): void

    onMessage(listener: (event: string, ...values: unknown[]) => void): void

    onOutput(listener: (stream: Stream, text: string) => void): void

    stop(): void
}

export type ServerRuntimeFactory<Program> = (program: Program) => ServerRuntime

export type ServerRuntimeMessage = [event: string, ...values: unknown[]]

export type ServerRuntimeEnding = { code: number | null, signal: NodeJS.Signals | null }

export type Stream = "out" | "err"
