import assert from "node:assert/strict"
import type { ServerRuntime } from "@server/core/server-runtime"
import ServerProcessBoundary from "@server/core/link-manager/auth-manager/process-manager/server-process-boundary"
import HostTraffic from "@server/core/link-manager/auth-manager/process-manager/host-traffic"
import type { Tunnel } from "@the-link/core"
import { test } from "vitest"

test("the Server boundary receives readiness already buffered by its runtime", async () => {

    const runtime: ServerRuntime = {
        finished: new Promise(() => undefined),
        send() {},
        onOutput() {},
        stop() {},
        onMessage(listener) { listener("boundary", "ready") }
    }

    const boundary = new ServerProcessBoundary(
        runtime,
        true,
        false,
        async () => undefined,
        () => undefined,
        {} as HostTraffic,
        {} as Tunnel,
        () => true
    )

    await Promise.resolve()

    assert.equal(boundary.ready, true)
})

test("the Server boundary delivers Program and Process facts by the Program they belong to", async () => {

    const sent: unknown[][] = []

    let receive!: (event: string, ...values: unknown[]) => void

    const runtime: ServerRuntime = {
        finished: new Promise(() => undefined),
        send(...values) { sent.push(values) },
        onOutput() {},
        stop() {},
        onMessage(listener) { receive = listener }
    }

    const traffic = new HostTraffic()

    const asked: unknown[][] = []

    // This Server may see the "counter" Program and nothing else.
    new ServerProcessBoundary(runtime, false, false, async () => undefined, () => undefined, traffic, {} as Tunnel, (domain, subject, owner) => {

        asked.push([domain, subject, owner])

        return owner === "counter"
    })

    receive("boundary", "subscribe", "every-create", "publish", "host-process", "create", null, false)
    // A second listener for the same fact must not make the fact arrive twice.
    receive("boundary", "subscribe", "every-create-again", "publish", "host-process", "create", null, false)
    receive("boundary", "subscribe", "every-exit", "publish", "host-process", "exit", null, false)
    receive("boundary", "subscribe", "program-create", "publish", "host-program", "create", null, false)
    receive("boundary", "subscribe", "one-exit", "publish", "process-host", "exit", "process-reference", false)

    await new Promise(resolve => setTimeout(resolve))

    const counter = { identity: "counter", reference: "program-reference" }
    const process = { identity: "worker", reference: "process-reference", program: "counter" }
    const hidden = { identity: "hidden", reference: "hidden-process", program: "hidden" }

    // The registry names the Program first and the Process after it.
    await traffic.emitHost("process", "counter", "create", "counter", process)
    await traffic.emitHost("process", "hidden", "create", "hidden", hidden)
    await traffic.emitHost("program", "counter", "create", "counter", counter)

    // An ending is announced once the Process is gone, so nothing about it could be looked up.
    await traffic.emitHost("process", "counter", "exit", "counter", process, 0, null)
    await traffic.emitSubject("process", "counter", "exit", "process-reference", 0, null)

    await new Promise(resolve => setTimeout(resolve))

    assert.deepEqual(sent, [
        ["host-process", "create", "counter", process],
        ["host-program", "create", "counter", counter],
        ["host-process", "exit", "counter", process, 0, null],
        ["process-host", "exit", "process-reference", 0, null]
    ])

    assert.deepEqual(asked, [
        ["process", null, "counter"],
        ["process", null, "counter"],
        ["process", null, "hidden"],
        ["process", null, "hidden"],
        ["program", null, "counter"],
        ["process", null, "counter"],
        ["process", "process-reference", "counter"]
    ])
})
