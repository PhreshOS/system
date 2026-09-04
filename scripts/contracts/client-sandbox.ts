import assert from "node:assert/strict"
import Process from "@server/core/link-manager/auth-manager/process-manager/process"
import Window from "@server/core/link-manager/auth-manager/process-manager/window"
import type Program from "@server/core/link-manager/auth-manager/program-manager/program"
import type HostTraffic from "@server/core/link-manager/auth-manager/process-manager/host-traffic"

const process = new Process(

    "process",

    null,

    { identity: "program" } as Program,

    {},

    { server: null, client: null, options: {} },

    null,

    {} as HostTraffic,

    false
)

process.startClient(new Window(

    { title: "Client", layer: "window", location: "/" },

    { x: 0, y: 0 },

    { width: 640, height: 480 },

    1,

    false
), false)

assert.equal(process.hosted().client?.sameOrigin, false)

assert.equal(process.setClientSameOrigin(true), true)
assert.equal(process.setClientSameOrigin(true), false)

assert.equal(process.hosted().client?.sameOrigin, true)
