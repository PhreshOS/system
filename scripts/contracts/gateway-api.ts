import assert from "node:assert/strict"
import apiRequest from "@server/view/gateway/api-request"
import type Application from "@server/core/application"

const program = { identity: "example" }
const calls: unknown[][] = []
const system = {
    requireProgram(identity: string) {

        assert.equal(identity, program.identity)
        return { program }
    },
    programStoragePath(owner: unknown, area: string) {

        assert.equal(owner, program)
        calls.push(["area", area])
        return "/system/programs/example/storage"
    },
    async programIcon(owner: unknown, size: string) {

        assert.equal(owner, program)
        calls.push(["icon", size])
        return Uint8Array.from([1, 2, 3])
    },
    async programStore(owner: unknown, operation: string, key: unknown, value: unknown, ttl: unknown) {

        assert.equal(owner, program)
        calls.push(["store", operation, key, value, ttl])
        return "stored"
    },
    programQuery(owner: unknown, database: string, statement: string, values: unknown[]) {

        assert.equal(owner, program)
        calls.push(["query", database])
        return [{ statement, values }]
    },
    requireProcess(identity: string) { return { identity } },
    observeTraffic(
        process: { identity: string },
        endpoint: string,
        kind: string,
        event: string | null,
        subscriber: (event: string, ...values: unknown[]) => void
    ) {

        calls.push(["traffic", process.identity, endpoint, kind, event])
        queueMicrotask(() => subscriber(event ?? "changed", { to: "destination", payload: 1 }))
        return () => undefined
    }
}
const application = {
    system
} as unknown as Application

const signal = new AbortController().signal

assert.equal(await apiRequest(application, {
    capability: "program",
    operation: "storagePath",
    program: "example",
    area: "data"
}, signal), "/system/programs/example/storage")

assert.deepEqual(await apiRequest(application, {
    capability: "program",
    operation: "icon",
    program: "example",
    size: "medium"
}, signal), [1, 2, 3])

assert.equal(await apiRequest(application, {
    capability: "program",
    operation: "store",
    program: "example",
    storeOperation: "get",
    key: "state"
}, signal), "stored")

assert.deepEqual(await apiRequest(application, {
    capability: "program",
    operation: "query",
    program: "example",
    database: "logs",
    statement: "select ?",
    values: [1]
}, signal), [{ statement: "select ?", values: [1] }])

assert.deepEqual(await apiRequest(application, {
    capability: "traffic",
    operation: "wait",
    process: "process-identity",
    endpoint: "server",
    kind: "publish",
    event: "changed"
}, signal), {
    event: "changed",
    values: [{ to: "destination", payload: 1 }]
})

assert.deepEqual(calls, [
    ["area", "data"],
    ["icon", "medium"],
    ["store", "get", "state", undefined, undefined],
    ["query", "logs"],
    ["traffic", "process-identity", "server", "publish", "changed"]
])

await assert.rejects(apiRequest(application, {
    capability: "traffic",
    operation: "wait",
    process: "process-identity",
    endpoint: "client",
    kind: "answer",
    event: null
}, signal), /Only Server traffic/)
