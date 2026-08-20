import type { Bytes } from "../../codec"

export const receiveBytes = async (value: unknown): Promise<Bytes> => {

    if (value instanceof ArrayBuffer) return new Uint8Array(value)

    if (ArrayBuffer.isView(value)) {

        return Uint8Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength))
    }

    if (value instanceof Blob) return new Uint8Array(await value.arrayBuffer())

    throw new TypeError("The WebSocket message is not binary")
}

export const textToBytes = (value: string): Bytes => {

    const unpadded = value.replaceAll("-", "+").replaceAll("_", "/")

    const binary = atob(unpadded.padEnd(unpadded.length + (4 - unpadded.length % 4) % 4, "="))

    return Uint8Array.from(binary, character => character.charCodeAt(0))
}
