import { parentPort, workerData } from "node:worker_threads"
import { pathToFileURL } from "node:url"

if (!parentPort) throw new Error("A Server Worker requires a parent port")
const port = parentPort

const listeners = new Set<(message: unknown) => void>()
const closing = new Set<() => void>()

Object.defineProperty(globalThis, "__PHRESHOS_SERVER_TRANSPORT__", {
    configurable: false,
    enumerable: false,
    writable: false,
    value: Object.freeze({
        send(message: Uint8Array) { port.postMessage(message) },
        onMessage(listener: (message: unknown) => void) { listeners.add(listener) },
        onClose(listener: () => void) { closing.add(listener) }
    })
})

port.on("message", message => { for (const listener of listeners) listener(message) })
port.once("close", () => { for (const listener of closing) listener() })

// Endpoint entries are native paths; ESM import needs a file URL on Windows.
await import(pathToFileURL(String(workerData.entry)).href)
