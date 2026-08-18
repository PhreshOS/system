import TheLink from "../../the-link"

/**
 * Cross-tab communication adapter using the BroadcastChannel API.
 *
 * Provides lightweight bidirectional event routing between browser tabs and
 * windows on the same origin. A shared namespace creates an isolated
 * BroadcastChannel, preventing unrelated application contexts from receiving
 * each other's events.
 *
 * Outbound tunnel events are posted to the channel with structured cloning, and
 * incoming channel messages are published through the inbound tunnel.
 *
 * @example
 * ```typescript
 * const firstTab = new TabLink("workspace-sync")
 * firstTab.$inbound.subscribe("document:update", handleUpdate)
 *
 * const secondTab = new TabLink("workspace-sync")
 * await secondTab.$outbound.publish("document:update", documentData)
 * ```
 */
export default class TabLink extends TheLink {

    /**
     * Namespace-isolated BroadcastChannel used for cross-tab transport.
     */
    private readonly channel: BroadcastChannel

    /**
     * Initialize a TabLink for one BroadcastChannel namespace.
     *
     * @param namespace Unique channel name shared by tabs that should communicate
     */
    public constructor(namespace: string) {

        super()

        // Create the same-origin channel used to exchange events between tabs.
        this.channel = new BroadcastChannel(namespace)

        // Route messages from other tabs into the local inbound tunnel.
        this.channel.addEventListener("message", this.messageHandler.bind(this))

        // Broadcast local outbound events to other tabs.
        this.$outbound.forwardTo(this.publishHandler.bind(this))
    }

    /**
     * Process an incoming BroadcastChannel message.
     *
     * @param message BroadcastChannel message containing an event envelope
     */
    private async messageHandler(message: MessageEvent<[string, ...unknown[]]>) {

        await this.$inbound.publish(...message.data)
    }

    /**
     * Publish an outbound tunnel event to the BroadcastChannel.
     *
     * @param event Event identifier for remote tabs
     * @param values Event payload values sent through structured cloning
     */
    private publishHandler(event: string, ...values: unknown[]) {

        this.channel.postMessage([event, ...values])
    }
}