import assert from "node:assert/strict"
import apiRequest from "@server/view/gateway/api-request"
import type Application from "@server/core/application"

const program = { identity: "example", reference: "example-reference" }
const handle = { identity: "example", reference: "example-reference" }
const processReference = { identity: "process-identity" }
const processSnapshot = { identity: "process-identity", reference: "process-reference" }
const calls: unknown[][] = []
const system = {
    holdProgram(received: unknown) {

        assert.deepEqual(received, handle)
        return program
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
    programAgent(owner: unknown) {

        assert.equal(owner, program)
        calls.push(["agent"])
        return "Program agent"
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
    programPermissions(owner: unknown) {

        assert.equal(owner, program)
        calls.push(["permission", "getAll"])
        return { pointer: true }
    },
    programPermission(owner: unknown, name: string) {

        assert.equal(owner, program)
        calls.push(["permission", "get", name])
        return true
    },
    setProgramPermission(owner: unknown, name: string, value: boolean) {

        assert.equal(owner, program)
        calls.push(["permission", "set", name, value])
    },
    deleteProgramPermission(owner: unknown, name: string) {

        assert.equal(owner, program)
        calls.push(["permission", "delete", name])
    },
    listProcesses(owner: unknown) {

        assert.equal(owner, program)
        calls.push(["process", "list"])
        return [processReference]
    },
    processSnapshot(process: unknown) {

        assert.equal(process, processReference)
        return processSnapshot
    },
    processSnapshotFromReference(process: unknown) {

        assert.equal(process, processReference)
        return processSnapshot
    },
    observe(domain: string, event: string, subject: string, subscriber: (event: string, ...values: unknown[]) => void) {

        assert.equal(subject, program.reference)
        calls.push(["observe", domain, event])
        queueMicrotask(() => subscriber(
            event,
            ...(domain === "program"
                ? event === "uninstall" ? [true] : []
                : event === "exit" ? [processReference, 0, null] : [processReference])
        ))
        return () => undefined
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
    handle,
    area: "data"
}, signal), "/system/programs/example/storage")

assert.deepEqual(await apiRequest(application, {
    capability: "program",
    operation: "icon",
    handle,
    size: "medium"
}, signal), [1, 2, 3])

assert.equal(await apiRequest(application, {
    capability: "program",
    operation: "agent",
    handle
}, signal), "Program agent")

assert.equal(await apiRequest(application, {
    capability: "program",
    operation: "store",
    handle,
    storeOperation: "get",
    key: "state"
}, signal), "stored")

assert.deepEqual(await apiRequest(application, {
    capability: "program",
    operation: "query",
    handle,
    database: "logs",
    statement: "select ?",
    values: [1]
}, signal), [{ statement: "select ?", values: [1] }])

assert.deepEqual(await apiRequest(application, {
    capability: "program",
    operation: "permission",
    handle,
    permissionOperation: "getAll"
}, signal), { pointer: true })

assert.equal(await apiRequest(application, {
    capability: "program",
    operation: "permission",
    handle,
    permissionOperation: "get",
    name: "pointer"
}, signal), true)

await apiRequest(application, {
    capability: "program",
    operation: "permission",
    handle,
    permissionOperation: "set",
    name: "pointer",
    value: false
}, signal)

await apiRequest(application, {
    capability: "program",
    operation: "permission",
    handle,
    permissionOperation: "delete",
    name: "pointer"
}, signal)

assert.equal(await apiRequest(application, {
    capability: "program",
    operation: "wait",
    handle,
    event: "uninstall"
}, signal), true)

assert.equal(await apiRequest(application, {
    capability: "program",
    operation: "wait",
    handle,
    event: "forget"
}, signal), undefined)

assert.deepEqual(await apiRequest(application, {
    capability: "programProcess",
    operation: "list",
    handle
}, signal), [processSnapshot])

assert.equal(await apiRequest(application, {
    capability: "programProcess",
    operation: "wait",
    handle,
    event: "create"
}, signal), processSnapshot)

assert.deepEqual(await apiRequest(application, {
    capability: "programProcess",
    operation: "wait",
    handle,
    event: "exit"
}, signal), {
    process: processSnapshot,
    status: "exited",
    code: 0,
    signal: null
})

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
    ["agent"],
    ["store", "get", "state", undefined, undefined],
    ["query", "logs"],
    ["permission", "getAll"],
    ["permission", "get", "pointer"],
    ["permission", "set", "pointer", false],
    ["permission", "delete", "pointer"],
    ["observe", "program", "uninstall"],
    ["observe", "program", "forget"],
    ["process", "list"],
    ["observe", "process", "create"],
    ["observe", "process", "exit"],
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
