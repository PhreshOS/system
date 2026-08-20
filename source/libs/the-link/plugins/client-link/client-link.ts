import Tunnel, { Subscriber } from "../../tunnel"
import { bytesToText, receiveBytes } from "./transport"
import { defaultDeserialize, defaultSerialize } from "../../codec"
import type { Deserialize, Serialize } from "../../codec"
import SocketLink from "./socket-link"
import TheLink from "../../the-link"
import { v4 as uuidv4 } from "uuid"

/**
 * Client adapter for TheLink over HTTP publishing and WebSocket subscriptions.
 *
 * For outbound events, ClientLink forwards the outbound tunnel to the server's
 * POST `/publish` endpoint. For subscriptions, it opens a WebSocket connection
 * to `/subscribe`, waits for the server's subscribe envelope, then exposes the
 * connection as a client-side SocketLink. Recoverable WebSocket closures trigger
 * a delayed resubscribe with the original connection payload.
 *
 * The adapter uses UTF-8 JSON bytes by default, with hooks for custom codecs
 * that must match the corresponding ServerLink.
 *
 * @example
 * ```typescript
 * const client = new ClientLink("https://api.example.com/events")
 *
 * const socket = await client.subscribeAsync<{ userId: string }>({ token })
 *
 * socket.$inbound.subscribe("server:event", handleServerEvent)
 * await client.$outbound.publish("client:event", payload)
 * ```
 */
export default class ClientLink extends TheLink {

    /**
     * Internal tunnel for client-side connection lifecycle events.
     *
     * Publishes `subscribe` when a WebSocket is accepted and `unsubscribe` when
     * a tracked socket closes. UUID-scoped `subscribe:<uuid>` and
     * `unsubscribe:<uuid>` events are also published so individual async
     * subscription calls can resolve or reject their own connection.
     */
    public readonly $internal: Tunnel = new Tunnel()

    /**
     * Server base URL used to construct `/publish` and `/subscribe` endpoints.
     */
    private readonly url: string

    private serialize: Serialize = defaultSerialize

    private deserialize: Deserialize = defaultDeserialize

    /**
     * Active WebSocket-backed SocketLink instances keyed by connection UUID.
     */
    public readonly sockets: Map<string, SocketLink> = new Map()

    /**
     * Initialize a ClientLink for a ServerLink base URL.
     *
     * @param url Server base URL that exposes `/publish` and `/subscribe`
     */
    public constructor(url: string) {

        super()

        // Store the server base URL for endpoint construction.
        this.url = url

        // Forward outbound tunnel events to the server via HTTP POST.
        this.$outbound.forwardTo(this.publishHandler.bind(this))
    }

    /**
     * Configure the serialization function used for HTTP and WebSocket payloads.
     *
     * @param serialize Custom function that converts values to bytes
     */
    public setSerialize(serialize: Serialize) {

        this.serialize = serialize
    }

    /**
     * Configure the deserialization function used for HTTP and WebSocket payloads.
     *
     * @param deserialize Custom function that parses values from bytes
     */
    public setDeserialize(deserialize: Deserialize) {

        this.deserialize = deserialize
    }

    /**
     * Register a handler for successful WebSocket subscriptions.
     *
     * @param subscriber Handler invoked with each accepted SocketLink
     * @returns Function that removes this subscriber
     */
    public onSubscribe<Payload>(subscriber: Subscriber<[SocketLink<Payload>]>) {

        return this.$internal.subscribe("subscribe", subscriber)
    }

    /**
     * Open a WebSocket subscription to the server.
     *
     * The connection payload is serialized and encoded into the `payload` query parameter.
     * When the server responds with a `subscribe` envelope, this client creates a
     * SocketLink and publishes it on the internal `subscribe` event plus the
     * UUID-scoped `subscribe:<uuid>` event.
     *
     * @param payload Optional connection payload sent to the server
     * @returns Connection UUID used for socket tracking and scoped lifecycle events
     */
    public subscribe(payload: unknown = undefined) {

        const searchParams = new URLSearchParams()

        // Include caller-provided connection context in the subscribe request.
        searchParams.set("payload", bytesToText(this.serialize({ current: payload })))

        const socket = new WebSocket(`${this.url}/subscribe?${searchParams.toString()}`)

        socket.binaryType = "arraybuffer"

        const uuid = uuidv4()

        // Route the server subscribe envelope through the WebSocket message handler.
        socket.addEventListener("message", (event) => this.webSocketMessageHandler(event, socket, uuid), { once: true })

        // Ensure SocketLink cleanup and reconnect handling when the WebSocket closes.
        socket.addEventListener("close", (event) => this.webSocketCloseHandler(event, payload, uuid))

        return uuid
    }

    /**
     * Open a WebSocket subscription and resolve with its SocketLink.
     *
     * Resolves when this subscription's UUID-scoped `subscribe:<uuid>` event is
     * published. Rejects if `unsubscribe:<uuid>` is published before the
     * subscription succeeds.
     *
     * @param payload Optional connection payload sent to the server
     * @returns SocketLink created from the server subscription response
     * @throws Error when the socket closes before subscription completes
     */
    public async subscribeAsync<Response>(payload: unknown = undefined) {

        return await new Promise<SocketLink<Response>>((resolve, reject) => {

            const socketUuid = this.subscribe(payload)

            const removeSubscribeSubscriber = this.$internal.subscribeOnce(`subscribe:${socketUuid}`, function (socketLink: SocketLink<Response>) {

                removeUnsubscribeSubscriber()

                resolve(socketLink)
            })

            const removeUnsubscribeSubscriber = this.$internal.subscribeOnce(`unsubscribe:${socketUuid}`, function (event: CloseEvent) {

                removeSubscribeSubscriber()

                reject(new Error(event.reason))
            })
        })
    }

    /**
     * Publish an outbound event to the server through HTTP POST.
     *
     * Automatically invoked by outbound tunnel forwarding configured in the
     * constructor.
     *
     * @param event Event identifier routed on the server
     * @param values Event payload values sent to the server
     * @returns Deserialized server handler results
     * @throws Error when the server returns a non-successful response
     */
    private async publishHandler(event: string, ...values: unknown[]) {

        // Send the event envelope to ServerLink's POST /publish endpoint.
        const response = await fetch(`${this.url}/publish`, {

            body: this.serialize([event, ...values]),

            method: "POST"
        })

        if (!response.ok) throw new Error(await response.text())

        return this.deserialize(new Uint8Array(await response.arrayBuffer()))
    }

    /**
     * Handle the server's WebSocket subscribe envelope.
     *
     * A `subscribe` message creates the client-side SocketLink for this
     * connection, configures matching serialization, and publishes the internal
     * `subscribe` event for application code. It also publishes
     * `subscribe:<uuid>` for the specific subscribeAsync() call that opened this
     * socket.
     *
     * @param event WebSocket message containing the serialized subscribe envelope
     * @param socket Browser WebSocket instance for this connection
     * @param uuid Connection identifier used for socket tracking
     */
    private async webSocketMessageHandler(event: MessageEvent, socket: WebSocket, uuid: string) {

        const result = this.deserialize(await receiveBytes(event.data)) as { type: string, data: unknown }

        if (result.type === "subscribe") {

            try {

                // Wrap the browser WebSocket in a TheLink-compatible socket adapter.
                const socketLink = new SocketLink(socket, result.data)

                socketLink.setSerialize(value => this.serialize(value))

                socketLink.setDeserialize(value => this.deserialize(value))

                this.sockets.set(uuid, socketLink)

                // Notify application code that this subscription is ready.
                await this.$internal.publish("subscribe", socketLink)

                await this.$internal.publish(`subscribe:${uuid}`, socketLink)
            }

            catch (exception) {

                console.error(exception instanceof Error ? exception.message : "An unknown exception occurred")

                socket.close(1000, exception instanceof Error ? exception.message : "An unknown exception occurred")
            }
        }
    }

    /**
     * Clean up a closed WebSocket subscription and reconnect when recoverable.
     *
     * Publishes the socket-level unsubscribe event before removing the SocketLink
     * from the active map, then publishes `unsubscribe:<uuid>` for callers
     * waiting on that specific subscription. Recoverable close codes open a new
     * subscription with the original payload after a short delay.
     *
     * @param event Browser WebSocket close event
     * @param payload Original connection payload used for reconnect attempts
     * @param uuid Connection identifier used to find the SocketLink
     */
    private async webSocketCloseHandler(event: CloseEvent, payload: unknown, uuid: string) {

        try {

            const socketLink = this.sockets.get(uuid)

            // Notify socket consumers before dropping the tracked connection.
            if (socketLink) await socketLink.$internal.publish("unsubscribe", event)

            await this.$internal.publish(`unsubscribe:${uuid}`, event)
        }

        finally {

            this.sockets.delete(uuid)

            // Retry transient server or network closures with the original payload.
            const reconnectCodes = new Set([1001, 1006, 1011, 1012, 1013, 1014])

            if (reconnectCodes.has(event.code)) {

                await new Promise(resolve => setTimeout(resolve, 1000))

                this.subscribe(payload)
            }
        }
    }
}
