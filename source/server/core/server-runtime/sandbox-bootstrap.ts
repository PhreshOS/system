import variant from "@jitl/quickjs-ng-wasmfile-release-sync"
import { newQuickJSWASMModuleFromVariant, type QuickJSContext, type QuickJSHandle } from "quickjs-emscripten-core"
import { parentPort, workerData } from "node:worker_threads"
import { readFileSync, realpathSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, isAbsolute, relative, resolve, sep } from "node:path"
import { randomUUID } from "node:crypto"
import installWebEnvironment from "./sandbox-web-environment.js"

if (!parentPort) throw new Error("A Sandbox Server runtime requires a parent port")

const root = realpathSync(resolve(String(workerData.root)))
const entry = confined(String(workerData.entry))
const streamsEnvironment = readFileSync(createRequire(import.meta.url).resolve("web-streams-polyfill/polyfill"), "utf8")
const webEnvironment = `(${installWebEnvironment.toString()})()`
const QuickJS = await newQuickJSWASMModuleFromVariant(variant)
const runtime = QuickJS.newRuntime({ memoryLimitBytes: 128 * 1024 * 1024, maxStackSizeBytes: 2 * 1024 * 1024 })
const context = runtime.newContext()
const timers = new Map<number, { timer: ReturnType<typeof setTimeout>, callback: QuickJSHandle }>()
const pendingResults = new Set<QuickJSHandle>()
const rejectedModule = "sandbox:rejected:"
let nextTimer = 1
let stopped = false

runtime.setModuleLoader(
    module => {

        if (module.startsWith(rejectedModule)) throw new Error(decodeURIComponent(module.slice(rejectedModule.length)))
        if (!isAbsolute(module)) throw new Error(`The Sandbox cannot import the package "${module}"; bundle package dependencies into the Server build`)

        return readFileSync(confined(module), "utf8")
    },
    (base, requested) => {

        if (!requested.startsWith(".")) return rejectModule(`The Sandbox cannot import the package "${requested}"; bundle package dependencies into the Server build`)

        try { return confined(resolve(dirname(base), requested)) }
        catch (error) { return rejectModule(error instanceof Error ? error.message : "A Sandbox module is invalid") }
    }
)

installEnvironment(context)
evaluate(readFileSync(entry, "utf8"), entry, { type: "module" })
pump()

parentPort.on("message", message => {

    const bytes = bytesOf(message)
    if (!bytes || stopped) return
    evaluate(`globalThis.__phreshosReceive(new Uint8Array(${JSON.stringify([...bytes])}))`, "phreshos:transport")
    pump()
})

parentPort.once("close", dispose)

function installEnvironment(vm: QuickJSContext) {

    expose("__phreshosSend", value => {

        const bytes = numericBytes(vm.dump(value))
        parentPort!.postMessage(bytes)
    })
    expose("__phreshosUUID", () => vm.newString(randomUUID()))
    expose("__phreshosEncode", value => {

        const bytes = new TextEncoder().encode(String(vm.dump(value)))
        return vm.newArrayBuffer(bytes.buffer)
    })
    expose("__phreshosDecode", value => vm.newString(new TextDecoder().decode(numericBytes(vm.dump(value)))))
    expose("__phreshosURL", (value, base, property, replacement) => {

        const input = String(vm.dump(value))
        const baseValue = vm.dump(base)
        const url = baseValue === undefined ? new URL(input) : new URL(input, String(baseValue))
        const propertyName = vm.dump(property)

        if (typeof propertyName === "string") (url as unknown as Record<string, string>)[propertyName] = String(vm.dump(replacement))

        return vm.newString(JSON.stringify({
            hash: url.hash,
            host: url.host,
            hostname: url.hostname,
            href: url.href,
            origin: url.origin,
            password: url.password,
            pathname: url.pathname,
            port: url.port,
            protocol: url.protocol,
            search: url.search,
            username: url.username
        }))
    })
    expose("__phreshosPrint", (stream, values) => {

        const target = vm.dump(stream) === "err" ? process.stderr : process.stdout
        const dumped = vm.dump(values)
        target.write(`${Array.isArray(dumped) ? dumped.map(printable).join(" ") : printable(dumped)}\n`)
    })
    expose("__phreshosSetTimeout", (callback, delay) => {

        const identity = nextTimer++
        const retained = callback.dup()
        const milliseconds = Math.max(0, Number(vm.dump(delay)) || 0)
        const timer = setTimeout(() => {

            timers.delete(identity)
            try { call(retained) }
            finally { retained.dispose() }
        }, milliseconds)
        timers.set(identity, { timer, callback: retained })
        return vm.newNumber(identity)
    })
    expose("__phreshosClearTimeout", identity => {

        const retained = timers.get(Number(vm.dump(identity)))
        if (retained) {

            clearTimeout(retained.timer)
            retained.callback.dispose()
            timers.delete(Number(vm.dump(identity)))
        }
    })
    expose("__phreshosQueueMicrotask", callback => {

        const retained = callback.dup()
        queueMicrotask(() => {

            try { call(retained) }
            finally { retained.dispose() }
        })
    })

    evaluate(`
        (() => {

            const messages = new Set()
            const closes = new Set()
            globalThis.__PHRESHOS_SERVER_TRANSPORT__ = Object.freeze({
                send(message) { __phreshosSend(Array.from(message)) },
                onMessage(listener) { messages.add(listener) },
                onClose(listener) { closes.add(listener) }
            })
            globalThis.__phreshosReceive = message => { for (const listener of messages) listener(message) }
            globalThis.crypto = Object.freeze({ randomUUID: () => __phreshosUUID() })
            globalThis.TextEncoder = class TextEncoder {

                encode(value = "") { return new Uint8Array(__phreshosEncode(String(value))) }
                encodeInto(value, destination) {

                    if (!(destination instanceof Uint8Array)) throw new TypeError("TextEncoder.encodeInto requires a Uint8Array destination")

                    const source = String(value)
                    const encoded = this.encode(source)

                    if (encoded.length <= destination.length) {

                        destination.set(encoded)
                        return { read: source.length, written: encoded.length }
                    }

                    let read = 0
                    let written = 0

                    for (const character of source) {

                        const bytes = this.encode(character)

                        if (written + bytes.length > destination.length) break

                        destination.set(bytes, written)
                        read += character.length
                        written += bytes.length
                    }

                    return { read, written }
                }
            }
            globalThis.TextDecoder = class TextDecoder {

                decode(value = new Uint8Array()) { return __phreshosDecode(Array.from(value)) }
            }
            globalThis.URL = class URL {

                #value
                constructor(value, base = undefined) { this.#read(value, base) }
                #read(value, base, property = undefined, replacement = undefined) {

                    this.#value = JSON.parse(__phreshosURL(String(value), base === undefined ? undefined : String(base), property, replacement))
                }
                #replace(property, value) { this.#read(this.href, undefined, property, String(value)) }
                get hash() { return this.#value.hash }
                set hash(value) { this.#replace("hash", value) }
                get host() { return this.#value.host }
                set host(value) { this.#replace("host", value) }
                get hostname() { return this.#value.hostname }
                set hostname(value) { this.#replace("hostname", value) }
                get href() { return this.#value.href }
                set href(value) { this.#read(value) }
                get origin() { return this.#value.origin }
                get password() { return this.#value.password }
                set password(value) { this.#replace("password", value) }
                get pathname() { return this.#value.pathname }
                set pathname(value) { this.#replace("pathname", value) }
                get port() { return this.#value.port }
                set port(value) { this.#replace("port", value) }
                get protocol() { return this.#value.protocol }
                set protocol(value) { this.#replace("protocol", value) }
                get search() { return this.#value.search }
                set search(value) { this.#replace("search", value) }
                get username() { return this.#value.username }
                set username(value) { this.#replace("username", value) }
                toJSON() { return this.href }
                toString() { return this.href }
                static canParse(value, base = undefined) {

                    try { new URL(value, base); return true }
                    catch { return false }
                }
                static parse(value, base = undefined) {

                    try { return new URL(value, base) }
                    catch { return null }
                }
            }
            globalThis.setTimeout = (callback, delay = 0) => __phreshosSetTimeout(callback, delay)
            globalThis.clearTimeout = identity => __phreshosClearTimeout(identity)
            globalThis.queueMicrotask = callback => __phreshosQueueMicrotask(callback)

            class Event {

                constructor(type) { this.type = String(type) }
            }
            class EventTarget {

                #listeners = new Map()
                addEventListener(type, listener, options) {

                    const listeners = this.#listeners.get(type) ?? new Set()
                    let registered = listener
                    if (options?.once) {

                        registered = Object.assign(event => {

                            listeners.delete(registered)
                            listener.call(this, event)
                        }, { original: listener })
                    }
                    listeners.add(registered)
                    this.#listeners.set(type, listeners)
                }
                removeEventListener(type, listener) {

                    const listeners = this.#listeners.get(type)
                    if (!listeners) return
                    for (const candidate of listeners) if (candidate === listener || candidate.original === listener) listeners.delete(candidate)
                }
                dispatchEvent(event) {

                    for (const listener of [...this.#listeners.get(event.type) ?? []]) listener.call(this, event)
                    return true
                }
            }
            class AbortSignal extends EventTarget {

                aborted = false
                reason = undefined
                throwIfAborted() { if (this.aborted) throw this.reason }
                static any(signals) {

                    const controller = new AbortController()
                    for (const signal of signals) {

                        if (signal.aborted) { controller.abort(signal.reason); break }
                        signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true })
                    }
                    return controller.signal
                }
            }
            class AbortController {

                signal = new AbortSignal()
                abort(reason = new Error("This operation was aborted")) {

                    if (this.signal.aborted) return
                    this.signal.aborted = true
                    this.signal.reason = reason
                    this.signal.dispatchEvent(new Event("abort"))
                }
            }
            globalThis.Event = Event
            globalThis.EventTarget = EventTarget
            globalThis.AbortSignal = AbortSignal
            globalThis.AbortController = AbortController
            globalThis.console = Object.freeze({
                log: (...values) => __phreshosPrint("out", values),
                info: (...values) => __phreshosPrint("out", values),
                warn: (...values) => __phreshosPrint("err", values),
                error: (...values) => __phreshosPrint("err", values)
            })
        })()
    `, "phreshos:environment")
    evaluate(streamsEnvironment, "phreshos:streams")
    evaluate(webEnvironment, "phreshos:web-environment")

    function expose(name: string, implementation: (...args: QuickJSHandle[]) => QuickJSHandle | void) {

        const fn = vm.newFunction(name, implementation)
        vm.setProp(vm.global, name, fn)
        fn.dispose()
    }

    function call(callback: QuickJSHandle) {

        if (stopped) return
        const result = vm.callFunction(callback, vm.undefined)
        if (result.error) {

            const error = vm.dump(result.error)
            result.error.dispose()
            throw new Error(printable(error))
        }
        consumeResult(result.value)
        pump()
    }
}

function evaluate(code: string, filename: string, options?: { type: "module" | "global" }) {

    const result = context.evalCode(code, filename, options)
    if (result.error) {

        const error = context.dump(result.error)
        result.error.dispose()
        throw new Error(printable(error))
    }
    consumeResult(result.value)
}

function pump() {

    while (runtime.hasPendingJob()) {

        const result = runtime.executePendingJobs()
        if (result.error) {

            const error = result.error.context.dump(result.error)
            result.error.dispose()
            throw new Error(printable(error))
        }
    }

    for (const result of [...pendingResults]) consumeResult(result)
}

function consumeResult(value: QuickJSHandle) {

    // QuickJS reports synchronous exceptions through eval/call results, but a
    // Promise rejection belongs to the returned Promise. Retain that result
    // until it settles so an uncaught async callback has the same lifecycle
    // consequence as an uncaught callback in a Worker or child process.
    const state = context.getPromiseState(value)

    if (state.type === "pending") {

        pendingResults.add(value)
        return
    }

    pendingResults.delete(value)
    value.dispose()

    if (state.type === "fulfilled") {

        if (!state.notAPromise) state.value.dispose()
        return
    }

    const error = context.dump(state.error)
    state.error.dispose()
    throw new Error(printable(error))
}

function confined(path: string) {

    const target = realpathSync(isAbsolute(path) ? resolve(path) : resolve(root, path))
    const step = relative(root, target)
    if (step === ".." || step.startsWith(`..${sep}`) || isAbsolute(step)) throw new Error("A Sandbox module may not leave its Server directory")
    return target
}

function rejectModule(message: string) {

    return `${rejectedModule}${encodeURIComponent(message)}`
}

function bytesOf(value: unknown) {

    if (value instanceof Uint8Array) return value
    if (value instanceof ArrayBuffer) return new Uint8Array(value)
    if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
    return null
}

function numericBytes(value: unknown) {

    if (!Array.isArray(value) || value.some(byte => !Number.isInteger(byte) || byte < 0 || byte > 255)) throw new Error("The Sandbox transport accepts bytes")
    return Uint8Array.from(value as number[])
}

function printable(value: unknown): string {
    if (typeof value === "string") return value
    try { return JSON.stringify(value) }
    catch { return String(value) }
}

function dispose() {

    if (stopped) return
    stopped = true
    for (const retained of timers.values()) {

        clearTimeout(retained.timer)
        retained.callback.dispose()
    }
    timers.clear()
    for (const result of pendingResults) result.dispose()
    pendingResults.clear()
    context.dispose()
    runtime.dispose()
}
