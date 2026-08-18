import { useCallback, useEffect, useMemo, useState } from "react"
import Tunnel, { Subscriber } from "../../tunnel"

/**
 * React hook helper for a Tunnel instance.
 *
 * Provides React-friendly subscription and state helpers around Tunnel events.
 * Subscriptions are registered in effects and cleaned up automatically, while
 * event payloads can be mirrored into React state for rendering.
 *
 * @example
 * ```typescript
 * function StatusView({ tunnel }: { tunnel: Tunnel }) {
 *     const reactTunnel = ReactTunnel.useFactory(tunnel)
 *     const status = reactTunnel.useFirstState("status:update", "idle")
 *
 *     return <span>{status}</span>
 * }
 * ```
 */
export default class ReactTunnel {

    /**
     * Tunnel instance used by the React hook helpers.
     */
    public readonly tunnel: Tunnel

    /**
     * Initialize a ReactTunnel wrapper around a Tunnel.
     *
     * @param tunnel Tunnel instance to integrate with React components
     */
    public constructor(tunnel: Tunnel) {

        // Store the tunnel used by all helper hooks.
        this.tunnel = tunnel
    }

    /**
     * Create a memoized ReactTunnel instance for a Tunnel.
     *
     * @param tunnel Tunnel instance to wrap
     * @returns Stable ReactTunnel wrapper while the Tunnel reference is unchanged
     */
    public static useFactory(tunnel: Tunnel) {

        return useMemo(() => new ReactTunnel(tunnel), [tunnel])
    }

    /**
     * Subscribe to a Tunnel event with React lifecycle cleanup.
     *
     * @param event Event identifier to subscribe to
     * @param subscriber Handler invoked when the event is published
     */
    public useSubscribe(event: string, subscriber: Subscriber) {

        useEffect(() => {

            // Register on mount or when the event/subscriber pair changes.
            this.tunnel.subscribe(event, subscriber)

            // Remove the exact subscriber when React cleans up the effect.
            return () => this.tunnel.unsubscribe(event, subscriber)

        }, [event, subscriber])
    }

    /**
     * Mirror a Tunnel event's payload values into React state.
     *
     * @param event Event identifier used for state updates
     * @param defaultResults Initial state values before the event is published
     * @returns Latest event payload values
     */
    public useState<Results extends unknown[]>(event: string, defaultResults: Results): Results {

        const [results, setResults] = useState<Results>(defaultResults)

        // Store each event publication payload as the next React state value.
        const subscriber = useCallback((...results: Results) => setResults(results), [])

        this.useSubscribe(event, subscriber)

        return results
    }

    /**
     * Mirror the first value of a Tunnel event payload into React state.
     *
     * @param event Event identifier used for state updates
     * @param defaultResult Initial value before the event is published
     * @returns Latest first event payload value
     */
    public useFirstState<Result>(event: string, defaultResult: Result): Result {

        return this.useState(event, [defaultResult])[0]
    }
}