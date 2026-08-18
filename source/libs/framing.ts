const metadataLimit = 1024 * 1024

const encoder = new TextEncoder()

const decoder = new TextDecoder()

/** Prefix metadata to an optional byte stream without buffering that stream. */
export function frame<Metadata>(metadata: Metadata, body: ReadableStream<Uint8Array> | null = null) {

    const prefix = metadataPrefix(metadata)

    const reader = body?.getReader()

    let first: Uint8Array | null = prefix

    return new ReadableStream<Uint8Array>({

        async pull(controller) {

            if (first) {

                controller.enqueue(first)

                first = null

                return
            }

            if (!reader) return controller.close()

            try {

                const next = await reader.read()

                if (next.done) controller.close()

                else controller.enqueue(next.value)
            }

            catch (exception) {

                controller.error(exception)
            }
        },

        async cancel(reason) {

            await reader?.cancel(reason)
        }
    })
}

/** Prefix metadata to a finite body while preserving its known byte length. */
export function frameBlob<Metadata>(metadata: Metadata, body: Blob | null = null) {

    return new Blob(body ? [metadataPrefix(metadata), body] : [metadataPrefix(metadata)])
}

function metadataPrefix<Metadata>(metadata: Metadata) {

    const encoded = encoder.encode(JSON.stringify(metadata))

    if (encoded.byteLength > metadataLimit) throw new Error("Framed metadata exceeds 1 MB")

    const prefix = new Uint8Array(4 + encoded.byteLength)

    new DataView(prefix.buffer).setUint32(0, encoded.byteLength)

    prefix.set(encoded, 4)

    return prefix
}

/** Read one metadata prefix and leave the remaining bytes as a live stream. */
export async function unframe<Metadata>(stream: ReadableStream<Uint8Array> | null) {

    if (!stream) throw new Error("A framed request body is required")

    const reader = stream.getReader()

    let buffered = new Uint8Array()

    async function take(length: number) {

        while (buffered.byteLength < length) {

            const next = await reader.read()

            if (next.done) throw new Error("The framed message ended before its metadata")

            const joined = new Uint8Array(buffered.byteLength + next.value.byteLength)

            joined.set(buffered)

            joined.set(next.value, buffered.byteLength)

            buffered = joined
        }

        const value = buffered.slice(0, length)

        buffered = buffered.slice(length)

        return value
    }

    try {

        const sizeBytes = await take(4)

        const size = new DataView(sizeBytes.buffer, sizeBytes.byteOffset, sizeBytes.byteLength).getUint32(0)

        if (size > metadataLimit) throw new Error("Framed metadata exceeds 1 MB")

        const metadata = JSON.parse(decoder.decode(await take(size))) as Metadata

        const body = new ReadableStream<Uint8Array>({

            async pull(controller) {

                if (buffered.byteLength) {

                    const value = buffered

                    buffered = new Uint8Array()

                    controller.enqueue(value)

                    return
                }

                try {

                    const next = await reader.read()

                    if (next.done) controller.close()

                    else controller.enqueue(next.value)
                }

                catch (exception) {

                    controller.error(exception)
                }
            },

            async cancel(reason) {

                await reader.cancel(reason)
            }
        })

        return { body, metadata }
    }

    catch (exception) {

        await reader.cancel(exception).catch(() => undefined)

        throw exception
    }
}
