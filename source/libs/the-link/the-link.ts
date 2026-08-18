import Tunnel from "./tunnel"

/**
 * Base link abstraction built from inbound and outbound event tunnels.
 *
 * TheLink provides a two-tunnel model for bidirectional event flow. Subclasses
 * can publish through `$outbound`, receive through `$inbound`, and connect to
 * other links through prefix-aware forwarding relationships.
 *
 * Decorator implementations use `addInitializer()` to register instance setup
 * work on the class prototype. The constructor executes those initializers for
 * each new instance.
 */
export default class TheLink {

    /**
     * Events received by this link from other links or adapters.
     */
    public readonly $inbound: Tunnel = new Tunnel()

    /**
     * Events published by this link toward other links or adapters.
     */
    public readonly $outbound: Tunnel = new Tunnel()

    /**
     * Initialize a link and run prototype-registered decorator initializers.
     */
    public constructor() {

        const initializers: Initializer<typeof this>[] = this.constructor.prototype.$initializers ??= []

        // Decorators register these initializers on the prototype before construction.
        for (const initializer of initializers) initializer(this)
    }

    /**
     * Register a constructor-time initializer on the class prototype.
     *
     * Intended for decorator implementations only.
     *
     * @param initializer Function executed for each constructed instance
     * @throws Error when called on an already constructed instance
     */
    public addInitializer(initializer: Initializer<typeof this>) {

        if (this !== this.constructor.prototype) throw new Error("addInitializer() can only be called on the class prototype during decoration, not on constructed instances")

        const initializers: Initializer<typeof this>[] = this.constructor.prototype.$initializers ??= []

        initializers.push(initializer)
    }

    /**
     * Forward another link's inbound events into this link's inbound tunnel.
     *
     * @param theLink Source link to subscribe to
     * @param fromPrefix Source event prefix to match and strip
     * @param toPrefix Destination event prefix to prepend
     * @returns Cleanup function that removes this forwarding relationship
     */
    public subscribeTo(theLink: TheLink, fromPrefix: string = "", toPrefix: string = "") {

        theLink.$inbound.forwardTo(this.$inbound, fromPrefix, toPrefix)

        return () => this.unsubscribeFrom(theLink, fromPrefix, toPrefix)
    }

    /**
     * Stop forwarding another link's inbound events into this link.
     *
     * @param theLink Source link used during subscription
     * @param fromPrefix Source prefix used during subscription
     * @param toPrefix Destination prefix used during subscription
     */
    public unsubscribeFrom(theLink: TheLink, fromPrefix: string = "", toPrefix: string = "") {

        theLink.$inbound.stopForwardingTo(this.$inbound, fromPrefix, toPrefix)
    }

    /**
     * Forward this link's outbound events into another link's outbound tunnel.
     *
     * @param theLink Target link to publish to
     * @param fromPrefix Source event prefix to match and strip
     * @param toPrefix Destination event prefix to prepend
     * @returns Cleanup function that removes this forwarding relationship
     */
    public publishTo(theLink: TheLink, fromPrefix: string = "", toPrefix: string = "") {

        this.$outbound.forwardTo(theLink.$outbound, fromPrefix, toPrefix)

        return () => this.stopPublishingTo(theLink, fromPrefix, toPrefix)
    }

    /**
     * Stop forwarding this link's outbound events into another link.
     *
     * @param theLink Target link used during publication forwarding
     * @param fromPrefix Source prefix used during forwarding
     * @param toPrefix Destination prefix used during forwarding
     */
    public stopPublishingTo(theLink: TheLink, fromPrefix: string = "", toPrefix: string = "") {

        this.$outbound.stopForwardingTo(theLink.$outbound, fromPrefix, toPrefix)
    }

    /**
     * Connect this link to another link in both directions.
     *
     * `fromPrefix` applies to events received from the target link. `toPrefix`
     * applies to events sent to the target link, with prefixes swapped for the
     * outbound side so the relationship is symmetric.
     *
     * @param theLink Link to connect with
     * @param fromPrefix Prefix for events received from the target link
     * @param toPrefix Prefix for events sent to the target link
     * @returns Cleanup function that disconnects both directions
     */
    public connectTo(theLink: TheLink, fromPrefix: string = "", toPrefix: string = "") {

        this.subscribeTo(theLink, fromPrefix, toPrefix)

        this.publishTo(theLink, toPrefix, fromPrefix)

        return () => this.disconnectFrom(theLink, fromPrefix, toPrefix)
    }

    /**
     * Disconnect a bidirectional relationship created by connectTo().
     *
     * @param theLink Link to disconnect from
     * @param fromPrefix Prefix used for received events
     * @param toPrefix Prefix used for sent events
     */
    public disconnectFrom(theLink: TheLink, fromPrefix: string = "", toPrefix: string = "") {

        this.unsubscribeFrom(theLink, fromPrefix, toPrefix)

        this.stopPublishingTo(theLink, toPrefix, fromPrefix)
    }
}

/**
 * Constructor-time setup function registered by decorators.
 */
export type Initializer<TargetLink extends TheLink> = (instanceLink: TargetLink) => void

/**
 * Method shape used by publish-oriented decorators.
 */
export type Publisher = (...values: any[]) => Promise<any>

/**
 * TheLink tunnel selector used by decorators.
 */
export type TunnelName = "outbound" | "inbound"