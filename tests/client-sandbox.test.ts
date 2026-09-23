import assert from "node:assert/strict"
import Process from "@server/core/link-manager/auth-manager/process-manager/process"
import Window from "@server/core/link-manager/auth-manager/process-manager/window"
import Program from "@server/core/link-manager/auth-manager/program-manager/program"
import type HostTraffic from "@server/core/link-manager/auth-manager/process-manager/host-traffic"
import { test } from "vitest"

test("client sandbox contract", async () => {
  const sandboxed = new Process(

      "process",

      null,

      new Program({ identity: "sandboxed", storage: ".", client: { location: "." } }),

      {},

      { server: null, client: null, options: {} },

      null,

      {} as HostTraffic,

      liveWindow()
  )

  sandboxed.startClient(false)

  assert.equal(sandboxed.hosted().client?.sandbox, true)

  const trusted = new Process(
      "trusted-process",
      null,
      new Program({ identity: "trusted", storage: ".", client: { location: ".", sandbox: false } }),
      {},
      { server: null, client: null, options: {} },
      null,
      {} as HostTraffic,
      liveWindow()
  )
  trusted.startClient(false)

  assert.equal(trusted.hosted().client?.sandbox, false)
}, 120_000)

function liveWindow() {
  const window = new Window()
  window.start({ title: "Client", header: true, layer: "window" }, { x: 0, y: 0 }, { width: 640, height: 480 }, 1, false)
  return window
}
