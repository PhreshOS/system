import { decode, encode, ExtensionCodec } from "@msgpack/msgpack"

export type Bytes = Uint8Array<ArrayBuffer>

interface Context {

    incoming?: readonly unknown[]

    outgoing?: ReadonlyMap<object, number>
}

class Attachment {

    public constructor(public readonly index: number) { }
}

class BigInteger {

    public constructor(public readonly value: bigint) { }
}

class Undefined { }

const textEncoder = new TextEncoder()

const textDecoder = new TextDecoder("utf-8", { fatal: true })

const extensions = new ExtensionCodec<Context>()

const serializePrepared = (value: unknown, context: Context) => encode(value, { context, extensionCodec: extensions })

const deserializePrepared = (bytes: Uint8Array, context: Context) => decode(bytes, { context, extensionCodec: extensions })

extensions.register({

    type: 0,

    encode: value => value instanceof Attachment ? uint32(value.index) : null,

    decode: (bytes, _type, context) => {

        const attachment = context.incoming?.[readUint32(bytes)]

        if (attachment === undefined) throw new Error("The MessagePack attachment is absent")

        return attachment
    }
})

extensions.register({

    type: 1,

    encode: (value, context) => value instanceof Map ? serializePrepared([...value], context) : null,

    decode: (bytes, _type, context) => new Map(deserializePrepared(bytes, context) as [unknown, unknown][])
})

extensions.register({

    type: 2,

    encode: (value, context) => value instanceof Set ? serializePrepared([...value], context) : null,

    decode: (bytes, _type, context) => new Set(deserializePrepared(bytes, context) as unknown[])
})

extensions.register({

    type: 3,

    encode: (value, context) => value instanceof RegExp ? serializePrepared([value.source, value.flags, value.lastIndex], context) : null,

    decode: (bytes, _type, context) => {

        const [source, flags, lastIndex] = deserializePrepared(bytes, context) as [string, string, number]

        const expression = new RegExp(source, flags)

        expression.lastIndex = lastIndex

        return expression
    }
})

extensions.register({

    type: 4,

    encode: value => value instanceof URL ? textEncoder.encode(value.href) : null,

    decode: bytes => new URL(textDecoder.decode(bytes))
})

extensions.register({

    type: 5,

    encode: (value, context) => value instanceof Error ? serializePrepared(prepare({

        cause: value.cause,

        message: value.message,

        name: value.name,

        stack: value.stack

    }, context), context) : null,

    decode: (bytes, _type, context) => {

        const value = deserializePrepared(bytes, context) as { cause?: unknown, message: string, name: string, stack?: string }

        const error = new Error(value.message, { cause: value.cause })

        error.name = value.name

        if (value.stack !== undefined) error.stack = value.stack

        return error
    }
})

extensions.register({

    type: 6,

    encode: value => value instanceof BigInteger ? textEncoder.encode(value.value.toString()) : null,

    decode: bytes => BigInt(textDecoder.decode(bytes))
})

extensions.register({

    type: 7,

    encode: value => value instanceof Undefined ? new Uint8Array() : null,

    decode: () => undefined
})

export const serialize = (value: unknown, attachments: readonly object[] = []): Bytes => {

    const outgoing = new Map(attachments.map((attachment, index) => [attachment, index]))

    const context = { outgoing }

    return serializePrepared(prepare(value, context), context)
}

export const deserialize = (bytes: Uint8Array, attachments: readonly unknown[] = []) => {

    return deserializePrepared(bytes, { incoming: attachments })
}

const prepare = (value: unknown, context: Context): unknown => {

    if (value === undefined) return new Undefined()

    if (typeof value === "bigint") return new BigInteger(value)

    if (typeof value === "function" || typeof value === "symbol") return null

    if (value === null || typeof value !== "object") return value

    const attachment = context.outgoing?.get(value)

    if (attachment !== undefined) return new Attachment(attachment)

    if (value instanceof Date || value instanceof RegExp || value instanceof URL || value instanceof Error) return value

    if (value instanceof ArrayBuffer) return new Uint8Array(value)

    if (ArrayBuffer.isView(value)) return Uint8Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength))

    if (value instanceof Map) return new Map([...value].map(([key, entry]) => [prepare(key, context), prepare(entry, context)]))

    if (value instanceof Set) return new Set([...value].map(entry => prepare(entry, context)))

    if (Array.isArray(value)) return value.map(entry => prepare(entry, context))

    if ("toJSON" in value && typeof value.toJSON === "function") return prepare(value.toJSON(), context)

    return Object.fromEntries(Object.entries(value)

        .filter(([, entry]) => typeof entry !== "function")

        .map(([key, entry]) => [key, prepare(entry, context)]))
}

const uint32 = (value: number) => {

    const bytes = new Uint8Array(4)

    new DataView(bytes.buffer).setUint32(0, value)

    return bytes
}

const readUint32 = (bytes: Uint8Array) => {

    if (bytes.byteLength !== 4) throw new Error("The MessagePack attachment reference is invalid")

    return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0)
}

export type Transmitted<T> =
    T extends Function | symbol
    ? null
    : T extends Map<infer K, infer V>
    ? Map<Transmitted<K>, Transmitted<V>>
    : T extends Set<infer U>
    ? Set<Transmitted<U>>
    : T extends Date | RegExp | URL | Error
    ? T
    : T extends ArrayBuffer | ArrayBufferView
    ? Uint8Array
    : T extends { toJSON(): infer R }
    ? Transmitted<R>
    : T extends readonly [infer U, ...infer V]
    ? [Transmitted<U>, ...Transmitted<V>]
    : T extends readonly []
    ? []
    : T extends Array<infer U>
    ? Array<Transmitted<U>>
    : T extends object
    ? { [K in keyof T as Extract<T[K], Function> extends never ? K : never]: Transmitted<T[K]> }
    : T

export default { deserialize, serialize }
