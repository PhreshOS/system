import assert from "node:assert/strict"
import type { ServerRuntime } from "@server/core/server-runtime"
import ServerProcessBoundary from "@server/core/link-manager/auth-manager/process-manager/server-process-boundary"
import type HostTraffic from "@server/core/link-manager/auth-manager/process-manager/host-traffic"
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
