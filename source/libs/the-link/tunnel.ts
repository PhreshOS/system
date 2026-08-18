
/**
 * Event tunnel with interceptors, subscribers, forwarders, and finalizers.
 *
 * A publish call runs through four phases:
 * intercept matching prefixes, exact-event subscribers, prefix-based forwarders,
 * then result finalizers. Subscribers and forwarders contribute results, while
 * interceptors transform payload values and finalizers transform result values.
 */
export default class Tunnel {

    /**
     * Prefix-matched functions that can transform values before publication.
     */
    private readonly interceptors: Map<string, Set<Interceptor>> = new Map()

    /**
     * Exact event subscribers keyed by event name.
     */
    private readonly subscribers: Map<string, Set<Subscriber>> = new Map()

    /**
     * Forwarding rules keyed by source prefix, then destination prefix.
     */
    private readonly forwarders: Map<string, Map<string, Set<Forwarder | Tunnel>>> = new Map()

    /**
     * Prefix-matched functions that can transform aggregated publish results.
     */
    private readonly finalizers: Map<string, Set<Finalizer>> = new Map()

    /**
     * Register a payload interceptor for events matching a prefix.
     *
     * @param interceptor Function that can transform publication values
     * @param prefix Event prefix to match, or an empty string for all events
     * @returns Cleanup function that removes this interceptor
     */
    public addInterceptor(interceptor: Interceptor, prefix: string = "") {

        if (!this.interceptors.has(prefix)) this.interceptors.set(prefix, new Set())

        this.interceptors.get(prefix)!.add(interceptor)

        return () => this.removeInterceptor(interceptor, prefix)
    }

    /**
     * Remove a previously registered interceptor.
     *
     * @param interceptor Interceptor function to remove
     * @param prefix Prefix used during registration
     */
    public removeInterceptor(interceptor: Interceptor, prefix: string = "") {

        const interceptorSet = this.interceptors.get(prefix)

        if (interceptorSet) {

            interceptorSet.delete(interceptor)

            if (interceptorSet.size === 0) this.interceptors.delete(prefix)
        }
    }

    /**
     * Subscribe to an exact event name.
     *
     * @param event Event identifier to listen for
     * @param subscriber Handler invoked when the event is published
     * @returns Cleanup function that removes this subscriber
     */
    public subscribe(event: string, subscriber: Subscriber) {

        if (!this.subscribers.has(event)) this.subscribers.set(event, new Set())

        this.subscribers.get(event)!.add(subscriber)

        return () => this.unsubscribe(event, subscriber)
    }

    /**
     * Remove a previously registered subscriber.
     *
     * @param event Event identifier used during registration
     * @param subscriber Subscriber function to remove
     */
    public unsubscribe(event: string, subscriber: Subscriber) {

        const subscriberSet = this.subscribers.get(event)

        if (subscriberSet) {

            subscriberSet.delete(subscriber)

            if (subscriberSet.size === 0) this.subscribers.delete(event)
        }
    }

    /**
     * Subscribe to an event once, then remove the subscriber before it runs.
     *
     * @param event Event identifier to listen for
     * @param subscriber Handler invoked for the first matching publication
     * @returns Cleanup function that cancels the pending one-time subscription
     */
    public subscribeOnce(event: string, subscriber: Subscriber) {

        const removeSubscription = this.subscribe(event, async function (...values) {

            // Remove before invocation so re-entrant publishes do not call it twice.
            removeSubscription()

            await subscriber(...values)
        })

        return removeSubscription
    }

    /**
     * Wait for the next publication of an event.
     *
     * @param event Event identifier to wait for
     * @param timeout Maximum wait time in milliseconds
     * @returns Event payload values from the next matching publication
     * @throws Error when the timeout expires before the event is published
     */
    public async waitFor<Results extends unknown[]>(event: string, timeout: number = 30_000) {

        return await new Promise<Results>((resolve, reject) => {

            const removeSubscription = this.subscribeOnce(event, function (...values: Results) {

                resolve(values)

                // Cancel timeout work after the awaited event arrives.
                if (timer) clearTimeout(timer)
            })

            const timer = setTimeout(function () {

                // Remove the one-time subscriber before rejecting on timeout.
                removeSubscription()

                reject(new Error(`Event promise timeout ${timeout}ms`))

            }, timeout)
        })
    }

    /**
     * Wait for an event and return only its first payload value.
     *
     * @param event Event identifier to wait for
     * @param timeout Maximum wait time in milliseconds
     * @returns First value from the next matching publication
     */
    public async waitFirst<Result>(event: string, timeout: number = 30_000) {

        const [result] = await this.waitFor<[Result]>(event, timeout)

        return result
    }

    /**
     * Forward matching events to another Tunnel or a custom forwarder.
     *
     * Matching removes `fromPrefix` from the source event name, then prepends
     * `toPrefix` before forwarding.
     *
     * @param forwarder Target Tunnel or forwarding function
     * @param fromPrefix Source event prefix to match and strip
     * @param toPrefix Destination event prefix to prepend
     * @returns Cleanup function that removes this forwarding rule
     */
    public forwardTo(forwarder: Forwarder | Tunnel, fromPrefix: string = "", toPrefix: string = "") {

        if (!this.forwarders.has(fromPrefix)) this.forwarders.set(fromPrefix, new Map())

        const forwardersFrom = this.forwarders.get(fromPrefix)!

        if (!forwardersFrom.has(toPrefix)) forwardersFrom.set(toPrefix, new Set())

        const forwardersTo = forwardersFrom.get(toPrefix)!

        forwardersTo.add(forwarder)

        return () => this.stopForwardingTo(forwarder, fromPrefix, toPrefix)
    }

    /**
     * Remove a previously registered forwarding rule.
     *
     * @param forwarder Target Tunnel or forwarding function to remove
     * @param fromPrefix Source prefix used during registration
     * @param toPrefix Destination prefix used during registration
     */
    public stopForwardingTo(forwarder: Forwarder | Tunnel, fromPrefix: string = "", toPrefix: string = "") {

        const forwardersFrom = this.forwarders.get(fromPrefix)

        if (!forwardersFrom) return

        const forwardersTo = forwardersFrom.get(toPrefix)

        if (!forwardersTo) return

        forwardersTo.delete(forwarder)

        // Remove now-empty nested maps so stale prefix entries do not accumulate.
        if (forwardersTo.size === 0) forwardersFrom.delete(toPrefix)

        if (forwardersFrom.size === 0) this.forwarders.delete(fromPrefix)
    }

    /**
     * Register a result finalizer for events matching a prefix.
     *
     * @param finalizer Function that can transform aggregated publish results
     * @param prefix Event prefix to match, or an empty string for all events
     * @returns Cleanup function that removes this finalizer
     */
    public addFinalizer(finalizer: Finalizer, prefix: string = "") {

        if (!this.finalizers.has(prefix)) this.finalizers.set(prefix, new Set())

        this.finalizers.get(prefix)!.add(finalizer)

        return () => this.removeFinalizer(finalizer, prefix)
    }

    /**
     * Remove a previously registered finalizer.
     *
     * @param finalizer Finalizer function to remove
     * @param prefix Prefix used during registration
     */
    public removeFinalizer(finalizer: Finalizer, prefix: string = "") {

        const finalizerSet = this.finalizers.get(prefix)

        if (finalizerSet) {

            finalizerSet.delete(finalizer)

            if (finalizerSet.size === 0) this.finalizers.delete(prefix)
        }
    }

    /**
     * Publish an event through interceptors, subscribers, forwarders, and finalizers.
     *
     * @param event Event identifier to publish
     * @param values Event payload values
     * @returns Aggregated and finalized handler results
     */
    public async publish<Results extends unknown[]>(event: string, ...values: unknown[]): Promise<Results> {

        let results = []

        // Phase 1: matching interceptors can replace the payload values.
        const interceptorGroups = this.interceptors.entries().filter(([prefix]) => event.startsWith(prefix))

        for (const [_prefix, interceptorSet] of interceptorGroups) {

            for (const interceptor of interceptorSet) {

                const transformedValues = await interceptor(...values)

                if (Array.isArray(transformedValues)) values = transformedValues

                // A single non-undefined value becomes the next payload tuple.
                else if (transformedValues !== undefined) values = [transformedValues]
            }
        }

        // Phase 2: exact-event subscribers run with the final payload values.
        const subscribers = this.subscribers.get(event) || []

        for (const subscriber of subscribers) {

            const result = await subscriber(...values)

            if (result !== undefined) results.push(result)
        }

        // Phase 3: prefix-matched forwarders receive rewritten event names.
        const forwardersFrom = this.forwarders.entries().filter(([prefix]) => event.startsWith(prefix))

        for (const [fromPrefix, forwardersTo] of forwardersFrom) {

            for (const [toPrefix, forwarders] of forwardersTo) {

                for (const forwarder of forwarders) {

                    if (forwarder instanceof Tunnel) {

                        // Tunnel forwarders return arrays that are flattened into this result set.
                        const result = await forwarder.publish(toPrefix + event.slice(fromPrefix.length), ...values)

                        results.push(...result)
                    }

                    else {

                        const result = await forwarder(toPrefix + event.slice(fromPrefix.length), ...values)

                        if (Array.isArray(result)) results.push(...result)

                        // Custom forwarders can return one value or an array of values.
                        else if (result !== undefined) results.push(result)
                    }
                }
            }
        }

        // Phase 4: matching finalizers can replace the aggregated result values.
        const finalizerGroups = this.finalizers.entries().filter(([prefix]) => event.startsWith(prefix))

        for (const [_prefix, finalizerSet] of finalizerGroups) {

            for (const finalizer of finalizerSet) {

                const transformedResults = await finalizer(...results)

                if (Array.isArray(transformedResults)) results = transformedResults

                // A single non-undefined value becomes the next result tuple.
                else if (transformedResults !== undefined) results = [transformedResults]
            }
        }

        return results as Results
    }

    /**
     * Publish an event and return only the first result.
     *
     * @param event Event identifier to publish
     * @param values Event payload values
     * @returns First value from the aggregated publish results
     */
    public async publishFirst<Result>(event: string, ...values: unknown[]): Promise<Result> {

        const [result] = await this.publish<[Result]>(event, ...values)

        return result
    }
}

/**
 * Interceptor function signature for transforming event payload values.
 */
export type Interceptor<Values extends unknown[] = any[]> = (...values: Values) => any

/**
 * Subscriber function signature for exact event handling.
 */
export type Subscriber<Values extends unknown[] = any[]> = (...values: Values) => any

/**
 * Forwarder function signature for custom prefix-based routing.
 */
export type Forwarder<Values extends unknown[] = any[]> = (forwardedEvent: string, ...values: Values) => any

/**
 * Finalizer function signature for transforming aggregated publish results.
 */
export type Finalizer<Results extends unknown[] = any[]> = (...results: Results) => any