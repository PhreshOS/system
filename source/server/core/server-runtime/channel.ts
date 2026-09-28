import type { ServerRuntimeMessage } from "../server-runtime"
import { StreamRelay } from "@the-link/core"
import messagepack from "@the-link/messagepack"

type Listener = (event: string, ...values: unknown[]) => void

const maximumPendingMessages = 256

/**
 * The System's end of one Server runtime's messages. It encodes what the System
 * sends and decodes what the runtime sends, carrying streams in either
 * direction as references whose chunks follow as boundary relay messages, and
 * preserves ordered messages until Core installs their sole listener.
 */
export default class RuntimeChannel {

    private listener: Listener | null = null
    private readonly pending: ServerRuntimeMessage[] = []
    private readonly relay: StreamRelay

    /**
     * @param deliver Sends encoded bytes to the runtime
     */
    public constructor(deliver: (bytes: Uint8Array) => void) {

        this.relay = new StreamRelay(message => deliver(messagepack.serialize(["boundary", "relay", ...message])))
    }

    public encode(message: ServerRuntimeMessage) {

        return messagepack.serialize(message, { streams: this.relay })
    }

    public receive(message: unknown) {

        const bytes = runtimeMessageBytes(message)

        if (!bytes) return

        let decoded: unknown
        try { decoded = messagepack.deserialize(bytes, { streams: this.relay }) }
        catch { return }

        if (!Array.isArray(decoded) || typeof decoded[0] !== "string") return

        // Stream chunks belong to this channel, not to Core.
        if (decoded[0] === "boundary" && decoded[1] === "relay") return this.relay.receive(decoded.slice(2))

        const envelope = decoded as ServerRuntimeMessage

        if (this.listener) this.listener(...envelope)
        else if (this.pending.length < maximumPendingMessages) this.pending.push(envelope)
    }

    public listen(listener: Listener) {

        if (this.listener) throw new Error("The server runtime already has a message listener")

        this.listener = listener

        for (const message of this.pending.splice(0)) listener(...message)
    }

    /** Ends every stream crossing this channel. */
    public close() {

        this.relay.close(new Error("The Server runtime ended"))
    }
}

export function runtimeMessageBytes(value: unknown) {

    if (value instanceof Uint8Array) return Uint8Array.from(value)
    if (value instanceof ArrayBuffer) return new Uint8Array(value)
    if (ArrayBuffer.isView(value)) return Uint8Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength))
    if (value === null || typeof value !== "object") return null

    const record = value as Record<string, unknown>
    const bytes = new Uint8Array(Object.keys(record).length)

    for (let index = 0; index < bytes.length; index++) {

        const byte = record[String(index)]

        if (typeof byte !== "number" || !Number.isInteger(byte) || byte < 0 || byte > 255) return null

        bytes[index] = byte
    }

    return bytes
}
