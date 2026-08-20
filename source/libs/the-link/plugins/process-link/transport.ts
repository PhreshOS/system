import type { Bytes } from "../../codec"

export const receiveBytes = (value: unknown): Bytes => {

    if (value instanceof Uint8Array) return Uint8Array.from(value)

    if (value instanceof ArrayBuffer) return new Uint8Array(value)

    if (ArrayBuffer.isView(value)) return Uint8Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength))

    throw new TypeError("The process message is not binary")
}
