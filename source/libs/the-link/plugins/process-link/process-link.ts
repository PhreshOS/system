import { ChildProcess } from "child_process"
import TheLink from "../../the-link"

/**
 * Process communication adapter using Node.js IPC.
 *
 * Provides bidirectional event routing between Node.js processes through an
 * active IPC channel. Incoming IPC messages are published through the inbound
 * tunnel, and outbound tunnel events are sent to the target process.
 *
 * Messages use TheLink's array envelope format:
 * `[event, ...values]`.
 *
 * @example
 * ```typescript
 * // Child process
 * const childLink = new ProcessLink()
 * childLink.$inbound.subscribe("job:start", startJob)
 *
 * // Parent process
 * const parentLink = new ProcessLink(worker)
 * await parentLink.$outbound.publish("job:start", { id: 1 })
 * ```
 */
export default class ProcessLink extends TheLink {

    /**
     * Target process used for IPC communication.
     *
     * Can be a ChildProcess instance in a parent process or the global process
     * object in a child process. The target must expose `send`.
     */
    private readonly target: NodeJS.Process | ChildProcess

    /**
     * Initialize a ProcessLink with a target IPC process.
     *
     * @param target Process to communicate with, defaults to the current process
     * @throws Error when the target does not have an active IPC channel
     */
    public constructor(target: NodeJS.Process | ChildProcess = process) {

        super()

        // Store the IPC target for message delivery.
        this.target = target

        if (typeof this.target.send !== "function") throw new Error("IPC channel not available. Ensure the process was spawned with IPC support.")

        // Route IPC messages from the target into the local inbound tunnel.
        this.target.on("message", this.messageHandler.bind(this))

        // Send outbound tunnel events to the target process automatically.
        this.$outbound.forwardTo(this.publishHandler.bind(this))
    }

    /**
     * Process an incoming IPC message from the target process.
     *
     * Ignores messages that do not match TheLink's `[event, ...values]`
     * protocol shape.
     *
     * @param message Raw IPC message received from the process
     */
    private async messageHandler(message: unknown) {

        if (Array.isArray(message) && typeof message[0] === "string") {

            // Decode the event envelope after validating its protocol shape.
            const [event, ...values] = message as [string, ...unknown[]]

            await this.$inbound.publish(event, ...values)
        }
    }

    /**
     * Publish an outbound tunnel event through the IPC channel.
     *
     * @param event Event identifier for the remote process
     * @param values Event payload values sent over IPC
     */
    private publishHandler(event: string, ...values: unknown[]) {

        // The non-null assertion is guarded by the constructor IPC check.
        this.target.send!([event, ...values])
    }
}