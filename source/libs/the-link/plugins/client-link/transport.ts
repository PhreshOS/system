import type { Bytes } from "../../codec"

export const receiveBytes = async (value: unknown): Promise<Bytes> => {

    if (value instanceof ArrayBuffer) return new Uint8Array(value)

    if (ArrayBuffer.isView(value)) {

        return Uint8Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength))
    }

    if (value instanceof Blob) return new Uint8Array(await value.arrayBuffer())

    throw new TypeError("The WebSocket message is not binary")
}

export const bytesToText = (bytes: Bytes) => {

    let binary = ""

    for (const byte of bytes) binary += String.fromCharCode(byte)

    return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")
}
