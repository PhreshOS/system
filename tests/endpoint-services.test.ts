import assert from "node:assert/strict"
import EndpointServices from "@server/core/link-manager/auth-manager/process-manager/endpoint-services"
import Program from "@server/core/link-manager/auth-manager/program-manager/program"
import type Process from "@server/core/link-manager/auth-manager/process-manager/process"
import type { ServiceAddress } from "@phreshos/core"
import { test } from "vitest"

test("endpoint services use stable name addresses and ready availability", async () => {
  const program = new Program({
      identity: "program",
      server: { location: ".", command: "true" },
      client: { location: "." }
  })
  assert.equal(program.version, "0.0.0")

  function process(identity: string, name: string | null, ready = true, service = true) {
      const server = { ready, service }
      return {
          identity,
          name,
          reference: `${identity}-reference`,
          program,
          launch: { server: { service }, client: { service } },
          server,
          client: { service },
          becomeReady() { server.ready = true }
      } as unknown as Process & { becomeReady(): void }
  }

  let provider = process("first", "main")
  const transitions: Array<[string, ServiceAddress]> = []
  const services = new EndpointServices(
      address => address.program === program.identity
          && address.process === provider.name
          && (address.endpoint === "server" ? provider.server?.service : provider.client?.service) === true
          ? { process: provider, endpoint: address.endpoint }
          : null,
      () => [provider],
      (event, address) => { transitions.push([event, address]) }
  )
  const address = { program: "program", process: "main", endpoint: "server" } satisfies ServiceAddress
  const clientAddress = { ...address, endpoint: "client" } satisfies ServiceAddress
  const lifecycle: string[] = []
  const publications: unknown[] = []
  const authorizedPublications: unknown[] = []
  let permitted = true

  assert.throws(() => services.available({ process: "main", endpoint: "server" }), /complete Service address/)
  await assert.rejects(() => services.waitReady(address, -1), /non-negative finite number/)

  services.follow(address, "lifecycle", null, event => lifecycle.push(event))
  services.follow(address, "events", "change", (_event, payload) => publications.push(payload))
  services.follow(address, "events", "authorized", (_event, payload) => authorizedPublications.push(payload), () => permitted)

  await services.started(provider, "server")
  await services.started(provider, "client")
  assert.equal(services.available(address), true)
  assert.deepEqual(services.list("main"), [address, clientAddress])
  assert.deepEqual(lifecycle, ["available"])
  await services.waitReady(address, 0)

  await services.emit(provider, "server", "ignored", 1)
  await services.emit(provider, "server", "change", 2)
  assert.deepEqual(publications, [2])

  await services.emit(provider, "server", "authorized", 3)
  permitted = false
  await services.emit(provider, "server", "authorized", 4)
  permitted = true
  await services.emit(provider, "server", "authorized", 5)
  assert.deepEqual(authorizedPublications, [3, 5])

  provider.server = null
  await services.stopped(provider, "server", true)
  assert.equal(services.available(address), false)
  assert.deepEqual(lifecycle, ["available", "unavailable"])
  await assert.rejects(() => services.waitReady(address, 0), /timeout|available/)

  // A stable address follows a replacement with the same Program and Process name.
  provider = process("replacement", "main", false)
  await services.started(provider, "server")
  assert.equal(services.available(address), false)

  const ready = services.waitReady(address, 100)
  provider.becomeReady()
  await services.ready(provider, "server")
  await ready
  assert.equal(services.available(address), true)

  // An unnamed Process is never discoverable, even when its Endpoint is configured.
  provider = process("unnamed", null)
  await services.started(provider, "server")
  assert.deepEqual(services.list(), [])

  // A running Endpoint that did not opt into Service mode remains unavailable.
  provider = process("unconfigured", "main", true, false)
  await services.started(provider, "server")
  assert.equal(services.available(address), false)

  assert.deepEqual(transitions.map(([event]) => event), ["available", "available", "unavailable", "available"])
}, 120_000)
