import messagepack from "@the-link/messagepack"

const transport = (globalThis as typeof globalThis & {
    __PHRESHOS_SERVER_TRANSPORT__: {
        send(message: Uint8Array): void
        onMessage(listener: (message: unknown) => void): void
    }
}).__PHRESHOS_SERVER_TRANSPORT__

transport.send(messagepack.serialize(["codec-ready"]))

transport.onMessage(message => {

    const value = messagepack.deserialize(message as Uint8Array)

    transport.send(messagepack.serialize(["codec-result", value]))
})
