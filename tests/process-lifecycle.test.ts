import assert from "node:assert/strict"
import { TheLink } from "@the-link/core"
import type AuthManager from "@server/core/link-manager/auth-manager/auth-manager"
import Program from "@server/core/link-manager/auth-manager/program-manager/program"
import ProcessManager from "@server/core/link-manager/auth-manager/process-manager/process-manager"
import type Process from "@server/core/link-manager/auth-manager/process-manager/process"
import type ServerProcessBoundary from "@server/core/link-manager/auth-manager/process-manager/server-process-boundary"
import type { ServerRuntime } from "@server/core/server-runtime"
import type { ClientLaunch } from "@phreshos/core"
import { test } from "vitest"

test("process lifecycle contract", async () => {
  const launch = { server: null, client: null, options: {} } as const

  function processManager() {

      const authManager = new TheLink() as unknown as AuthManager
      const manager = new ProcessManager(authManager)

      Object.assign(authManager, {
          programManager: {
              permission() { return null },
              grantsPermission() { return true },
              grantsStorage() { return true },
              clientShape(_program: Program, launch: ClientLaunch = {}) {

                  if (launch.service !== undefined && typeof launch.service !== "boolean") throw new Error("A launch client's service role must be true or false")

                  return {
                      title: launch.title ?? "Client",
                      header: launch.header ?? true,
                      surface: launch.surface ?? true,
                      transaction: launch.transaction ?? false,
                      position: launch.position ?? { x: 0, y: 0 },
                      size: launch.size ?? { width: 640, height: 480 },
                      layer: launch.layer ?? "window",
                      minimize: launch.minimize ?? false,
                      maximize: launch.maximize ?? false
                  }
              }
          },
          linkManager: {
              application: {
                  system: {
                      holdProcess(value: unknown, fallback?: Process) {

                          if (value === undefined || value === null) return fallback
                          if (typeof value !== "object" || value === null) throw new Error("Invalid Process handle")

                          const handle = value as { identity?: string, reference?: string }
                          const process = handle.identity ? manager.processes.get(handle.identity) : null

                          if (!process || process.reference !== handle.reference) throw new Error("The Process represented by this handle does not exist")

                          return process
                      }
                  }
              }
          }
      })

      return manager
  }

  // Window state belongs permanently to the Client Endpoint, not to one of
  // its execution contexts. Stopping the Client preserves the Window; omitted
  // restart values preserve it, while explicit launch values replace only
  // themselves.
  {
      const manager = processManager()
      const owner = new Program({
          identity: "retained-window",
          server: { location: ".", command: "true" },
          client: { location: "https://example.test/" }
      })
      const initial = {
          title: "Initial",
          header: true,
          surface: true,
          transaction: false,
          position: { x: 12, y: 24 },
          size: { width: 640, height: 480 },
          layer: "window" as const,
          minimize: false,
          maximize: false
      }
      const process = await manager.register(
          "retained-window",
          null,
          owner,
          {},
          launch,
          null,
          true,
          initial,
          null,
          { window: initial }
      )

      process.server = {} as ServerProcessBoundary
      await manager.stopClient(process.identity)

      assert.equal(process.client, null)
      assert.ok(process.clientEndpoint)

      await manager.move(process.identity, { x: 80, y: 90 })
      await manager.setHeader(process.identity, false)
      await manager.setSurface(process.identity, { radius: "full", color: "primary" })

      await manager.startClient(process.identity)

      assert.deepEqual(process.clientEndpoint.window.position, { x: 80, y: 90 })
      assert.equal(process.clientEndpoint.window.header, false)
      assert.deepEqual(process.clientEndpoint.window.surface, { radius: "full", color: "primary" })

      await manager.stopClient(process.identity)
      await manager.startClient(process.identity, { layer: "over", title: "Overlay" })

      assert.equal(process.clientEndpoint.window.layer, "over")
      assert.equal(process.clientEndpoint.window.title, "Overlay")
      assert.deepEqual(process.clientEndpoint.window.position, { x: 80, y: 90 })
      assert.equal(process.clientEndpoint.window.header, false)

      await manager.stopClient(process.identity)
      await manager.setHeader(process.identity, true)
      await manager.move(process.identity, { x: 140, y: 150 })
      await manager.startClient(process.identity, { layer: "window" })

      assert.equal(process.clientEndpoint.window.layer, "window")
      assert.equal(process.clientEndpoint.window.header, true)
      assert.deepEqual(process.clientEndpoint.window.position, { x: 140, y: 150 })
      assert.deepEqual(process.clientEndpoint.window.surface, { radius: "full", color: "primary" })
  }

  function program(identity: string) {

      return new Program({ identity, server: { location: ".", command: "true" } })
  }

  async function register(manager: ProcessManager, identity: string) {

      return await manager.register(identity, null, program(identity), {}, launch, null, false, null, null)
  }

  // Endpoint start and stop establish execution-context state. Repeating the same
  // request on a valid permanent handle is a silent success; removing the
  // owning Process still invalidates that handle.
  {
      const manager = processManager()
      const owner = new Program({
          identity: "endpoint-state",
          server: { location: ".", command: "true" },
          client: { location: "." }
      })
      const clientStarts: unknown[][] = []
      manager.$outbound.subscribe("/client-start", (...values) => { clientStarts.push(values) })
      const process = await manager.register(
          "endpoint-state",
          null,
          owner,
          {},
          launch,
          null,
          true,
          {
              title: "Client",
              header: true,
              surface: true,
              transaction: false,
              position: { x: 0, y: 0 },
              size: { width: 640, height: 480 },
              layer: "window",
              minimize: false,
              maximize: false
          },
          null
      )
      const client = process.client

      await manager.startClient(process.identity, { title: "Ignored creation value" })

      assert.equal(process.client, client)
      assert.equal(clientStarts.length, 1)

      await manager.stopServer(process.identity)
      await manager.stopServer(process.identity)

      await assert.rejects(manager.stopClient(process.identity), /final live endpoint/)

      process.server = {} as ServerProcessBoundary
      process.stopClient()

      await manager.stopClient(process.identity)
      await manager.startServer(process.identity)
      await assert.rejects(manager.startServer(process.identity, { service: "invalid" } as never), /service value/)

      manager.processes.delete(process.identity)

      await assert.rejects(manager.startClient(process.identity), /does not know this process/)
      await assert.rejects(manager.stopServer(process.identity), /does not know this process/)
  }

  // Parentage retains the exact Process entity after it exits. Absence and
  // ended lineage therefore remain distinct states at every System boundary.
  {
      const manager = processManager()
      const parent = await register(manager, "parent")
      const child = await manager.register("child", null, parent.program, {}, launch, null, false, null, parent)
      const boundary = manager as unknown as {
          parent(value: unknown): Promise<{ identity: string } | null>
          endHost(process: Process, server: ServerProcessBoundary, args: unknown[]): Promise<unknown[]>
      }

      await manager.remove(parent.identity)

      assert.equal((await boundary.parent({ identity: child.identity, reference: child.reference }))?.identity, parent.identity)

      const retained = (await boundary.endHost(child, {} as ServerProcessBoundary, ["parent"]))[0] as { identity: string }

      assert.equal(retained.identity, parent.identity)
  }

  // A failed configuration cannot leave either its Process identity or an
  // unattached runtime behind in the registry.
  {
      const manager = processManager()
      let starts = 0
      const runtime = () => { starts++; return {} as ServerRuntime }

      await assert.rejects(manager.register(
          "failed-registration",
          null,
          program("failed-registration"),
          {},
          launch,
          runtime,
          false,
          null,
          null,
          { prepare() { throw new Error("configuration failed") } }
      ), /configuration failed/)

      assert.equal(manager.processes.has("failed-registration"), false)
      assert.equal(starts, 0)
  }

  // Failure after an endpoint has been activated still retracts the partially
  // announced Process and its client state.
  {
      const manager = processManager()
      const client = new Program({ identity: "partial-registration", client: { location: "https://example.test/" } })

      manager.$outbound.subscribe("/created", () => {

          throw new Error("creation publication failed")
      })

      await assert.rejects(manager.register(
          "partial-registration",
          null,
          client,
          {},
          { ...launch, client: { title: "Partial", header: true, surface: true, transaction: false, position: null, size: null, layer: "window", minimize: false, maximize: false, service: false } },
          null,
          true,
          { title: "Partial", header: true, surface: true, transaction: false, position: { x: 0, y: 0 }, size: { width: 320, height: 240 }, layer: "window", minimize: false, maximize: false },
          null
      ), /creation publication failed/)

      assert.equal(manager.processes.has("partial-registration"), false)
  }

  // A launcher can only receive a started Process after the authoritative
  // representation has received that Process's creation snapshot.
  {
      const manager = processManager()
      const order: string[] = []

      manager.$outbound.subscribe("/created", () => { order.push("published") })

      await manager.register(
          "ordered-registration",
          null,
          program("ordered-registration"),
          {},
          launch,
          null,
          false,
          null,
          null,
          { created() { order.push("reported") } }
      )

      assert.deepEqual(order, ["published", "reported"])
  }

  // A failing observer is not allowed to stop the authoritative teardown or
  // prevent later terminal publications from running.
  {
      const manager = processManager()
      await register(manager, "teardown")
      let exited = false

      manager.$outbound.subscribe("/exited", () => { exited = true })

      const stop = manager.observeHost("process", "exit", null, () => {

          throw new Error("exit observer failed")
      })

      await assert.rejects(manager.remove("teardown"), /exit observer failed/)

      stop()

      assert.equal(manager.processes.has("teardown"), false)
      assert.equal(exited, true)
  }

  interface BoundaryProbe {

      boundary: ServerProcessBoundary

      deliveries: unknown[][]

      cancel(question: string): void
  }

  function boundaryProbe(): BoundaryProbe {

      const deliveries: unknown[][] = []
      const requests = new Map<string, () => void>()

      const boundary = {
          retain(question: string, cancel: () => void) {

              requests.get(question)?.()

              requests.set(question, cancel)
          },
          async deliver(event: string, ...values: unknown[]) {

              if (values[0] === "answer" && typeof values[1] === "string") requests.delete(values[1])

              deliveries.push([event, ...values])
          }
      } as unknown as ServerProcessBoundary

      return {
          boundary,
          deliveries,
          cancel(question) {

              const cancel = requests.get(question)

              requests.delete(question)

              cancel?.()
          }
      }
  }

  type HostWait = {

      endHostWait(process: Process, server: ServerProcessBoundary, question: string, args: unknown[]): Promise<void>
  }

  // Readiness listeners and their cancellation belong to the exact Server
  // incarnation that asked. A replacement must neither inherit the answer nor
  // retain the target listeners.
  {
      const manager = processManager()
      const requester = await register(manager, "requester")
      const target = await register(manager, "target")
      const original = boundaryProbe()
      const replacement = boundaryProbe()
      let readyListeners = 0
      let exitListeners = 0
      let becomeReady: () => void = () => undefined

      target.waitReady = (_endpoint, notify) => {

          let active = true

          readyListeners++
          becomeReady = notify

          return () => {

              if (!active) return

              active = false
              readyListeners--
          }
      }

      target.onExit = () => {

          let active = true

          exitListeners++

          return () => {

              if (!active) return

              active = false
              exitListeners--
          }
      }

      requester.server = original.boundary

      await (manager as unknown as HostWait).endHostWait(
          requester,
          original.boundary,
          "ready",
          ["wait-ready", { identity: target.identity, reference: target.reference }, "server", false]
      )

      requester.server = replacement.boundary
      becomeReady()

      assert.equal(readyListeners, 0)
      assert.equal(exitListeners, 0)
      assert.deepEqual(original.deliveries, [["host-end", "answer", "ready", { success: true, result: [] }]])
      assert.deepEqual(replacement.deliveries, [])

      await (manager as unknown as HostWait).endHostWait(
          requester,
          original.boundary,
          "cancelled",
          ["wait-ready", { identity: target.identity, reference: target.reference }, "server", false]
      )

      assert.equal(readyListeners, 1)
      assert.equal(exitListeners, 1)

      original.cancel("cancelled")

      assert.equal(readyListeners, 0)
      assert.equal(exitListeners, 0)
      assert.equal(original.deliveries.length, 1)
  }
}, 120_000)
