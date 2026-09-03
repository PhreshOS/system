import type { ServerRuntimeMessage } from "@server/core/server-runtime"
import messagepack from "@the-link/messagepack"

type Listener = (event: string, ...values: unknown[]) => void

const maximumPendingMessages = 256

/** Preserves ordered runtime messages until the View installs their sole listener. */
export default class RuntimeInbox {

    private listener: Listener | null = null

    private readonly pending: ServerRuntimeMessage[] = []

    public receive(message: unknown) {

        const bytes = runtimeMessageBytes(message)

        if (!bytes) return

        let decoded: unknown

        try { decoded = messagepack.deserialize(bytes) }

        catch { return }

        if (!Array.isArray(decoded) || typeof decoded[0] !== "string") return

        const envelope = decoded as ServerRuntimeMessage

        if (this.listener) this.listener(...envelope)

        else if (this.pending.length < maximumPendingMessages) this.pending.push(envelope)
    }

    public listen(listener: Listener) {

        if (this.listener) throw new Error("The server runtime already has a message listener")

        this.listener = listener

        for (const message of this.pending.splice(0)) listener(...message)
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
