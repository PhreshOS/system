import assert from "node:assert/strict"
import { test } from "vitest"
import RuntimeChannel from "@server/core/server-runtime/channel"

/** Two channels joined as the System and a Server runtime, each delivering to the other. */
function joined() {

    let system!: RuntimeChannel
    let runtime!: RuntimeChannel

    system = new RuntimeChannel(bytes => queueMicrotask(() => runtime.receive(bytes)))
    runtime = new RuntimeChannel(bytes => queueMicrotask(() => system.receive(bytes)))

    const received: unknown[][] = []

    system.listen((...message) => { received.push(message) })

    return { system, runtime, received }
}

async function bytes(stream: ReadableStream<Uint8Array>) {

    return new Uint8Array(await new Response(stream).arrayBuffer())
}

test("streams cross a runtime channel in both directions, as references with their chunks beside them", async () => {

    const { system, runtime, received } = joined()
    const runtimeReceived: unknown[][] = []

    runtime.listen((...message) => { runtimeReceived.push(message) })

    const file = new Uint8Array(3 * 1024 * 1024).map((_, index) => index % 251)

    // The runtime sends an answer carrying a stream; the System reads it.
    system.receive(runtime.encode(["answer", "question", { size: file.byteLength, content: new Blob([file]).stream() }]))

    await new Promise(resolve => setTimeout(resolve, 0))

    const [event, question, answer] = received[0] as [string, string, { size: number, content: ReadableStream<Uint8Array> }]

    assert.equal(event, "answer")
    assert.equal(question, "question")
    assert.equal(answer.size, file.byteLength)
    assert.deepEqual(await bytes(answer.content), file)

    // The System sends a stream to the runtime the same way.
    runtime.receive(system.encode(["write", new Blob(["hello"]).stream()]))

    await new Promise(resolve => setTimeout(resolve, 0))

    const [, content] = runtimeReceived[0] as [string, ReadableStream<Uint8Array>]

    assert.equal(new TextDecoder().decode(await bytes(content)), "hello")

    // Chunk messages are the channel's own and never reach Core.
    assert.equal(received.length, 1)
    assert.equal(runtimeReceived.length, 1)
})

test("closing a channel ends the streams crossing it", async () => {

    const { system, runtime, received } = joined()

    system.receive(runtime.encode(["answer", new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(8)) } })]))

    await new Promise(resolve => setTimeout(resolve, 0))

    const reader = (received[0]![1] as ReadableStream<Uint8Array>).getReader()

    await reader.read()
    system.close()

    await assert.rejects(reader.read(), /The Server runtime ended/)
})
