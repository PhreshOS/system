const maximumQueue = 256

/** Owns the lifecycle and backpressure queue for remotely produced streams. */
export default class StreamRelay<Value> {

    private readonly streams = new Map<string, PendingStream<Value>>()

    public constructor(private readonly name: string, private readonly parse: (value: unknown) => Value) { }

    public open(start: (stream: string) => Promise<unknown>, cancel: (stream: string) => Promise<unknown>) {

        const relay = this

        return (async function* (): AsyncGenerator<Value, void, void> {

            const stream = crypto.randomUUID()
            const state: PendingStream<Value> = { queue: [], settled: false, failure: null, wake: null }

            relay.streams.set(stream, state)

            const pending = Promise.resolve().then(() => start(stream)).then(
                () => { state.settled = true },
                error => { state.failure = error instanceof Error ? error : new Error(String(error)) }
            ).finally(() => {

                state.wake?.()
                state.wake = null
            })

            try {

                while (!state.settled || state.queue.length) {

                    if (state.queue.length) {

                        yield state.queue.shift()!
                        continue
                    }

                    if (state.failure) throw state.failure

                    await new Promise<void>(resolve => { state.wake = resolve })
                }

                await pending

                if (state.failure) throw state.failure
            }
            finally {

                relay.streams.delete(stream)
                cancel(stream).catch(() => undefined)
            }
        })()
    }

    public receive(stream: string, value: unknown) {

        const state = this.streams.get(stream)

        if (!state || state.failure) return

        try {

            if (state.queue.length >= maximumQueue) throw new Error(`${this.name} exceeded its queue capacity of ${maximumQueue}`)

            state.queue.push(this.parse(value))
        }
        catch (error) { state.failure = error instanceof Error ? error : new Error(String(error)) }

        state.wake?.()
        state.wake = null
    }
}

interface PendingStream<Value> {
    queue: Value[]
    settled: boolean
    failure: Error | null
    wake: (() => void) | null
}
