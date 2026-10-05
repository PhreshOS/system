import assert from "node:assert/strict"
import HostTraffic from "@server/core/link-manager/auth-manager/process-manager/host-traffic"
import { test } from "vitest"

test("host traffic contract", async () => {
  const traffic = new HostTraffic()
  const hostProgram: unknown[][] = []
  const ownProgram: unknown[][] = []
  const hostProcess: unknown[][] = []
  const programProcess: unknown[][] = []
  const hostConnection: unknown[][] = []
  const ownSession: unknown[][] = []
  const systemLogs: unknown[][] = []
  const programLogs: unknown[][] = []
  const storeChanges: unknown[][] = []

  traffic.observe("program", "uninstall", null, (_delivery, event, ...values) => hostProgram.push([event, ...values]))
  traffic.observe("program", "uninstall", "program-reference", (_delivery, event, ...values) => ownProgram.push([event, ...values]))
  traffic.observe("process", "create", null, (delivery, event, ...values) => hostProcess.push([delivery.owner, event, ...values]))
  traffic.observe("process", "create", "program-reference", (delivery, event, ...values) => programProcess.push([delivery.owner, event, ...values]))
  traffic.observe("connection", "create", null, (_delivery, event, ...values) => hostConnection.push([event, ...values]))
  traffic.observe("session", "connectionAttach", "session-identity", (_delivery, event, ...values) => ownSession.push([event, ...values]))
  traffic.observe("log", "log", null, (_delivery, event, ...values) => systemLogs.push([event, ...values]))
  traffic.observe("programLog", "log", "program-reference", (_delivery, event, ...values) => programLogs.push([event, ...values]))
  traffic.observe("program", "storeChange", "program-reference", (_delivery, event, ...values) => storeChanges.push([event, ...values]))

  const program = { identity: "counter", reference: "program-reference" }
  const process = { identity: "worker", reference: "process-reference" }

  await traffic.emitHost("program", program.identity, "uninstall", program.identity, program, true)

  assert.deepEqual(hostProgram, [["uninstall", program.identity, program, true]])
  assert.deepEqual(ownProgram, [])

  await traffic.emitSubject("program", program.identity, "uninstall", program.reference, true)

  assert.deepEqual(ownProgram, [["uninstall", program.reference, true]])

  // A fact carries the Program it belongs to, both in the registry and to its subject's observers.
  await traffic.emitHost("process", program.identity, "create", program.identity, process)
  await traffic.emitSubject("process", program.identity, "create", program.reference, process)

  assert.deepEqual(hostProcess, [[program.identity, "create", program.identity, process]])
  assert.deepEqual(programProcess, [[program.identity, "create", program.reference, process]])

  await traffic.emitHost("connection", null, "create", "connection-identity", { identity: "connection-identity" })
  await traffic.emitSubject("session", null, "connectionAttach", "session-identity", { identity: "connection-identity" })
  await traffic.emitHost("log", null, "log", "system", { kind: "started" })
  await traffic.emitSubject("programLog", program.identity, "log", "program-reference", { kind: "stdout" })
  await traffic.emitSubject("program", program.identity, "storeChange", "program-reference", "tab", { revision: 1, value: "colors" })

  assert.deepEqual(hostConnection, [["create", "connection-identity", { identity: "connection-identity" }]])
  assert.deepEqual(ownSession, [["connectionAttach", "session-identity", { identity: "connection-identity" }]])
  assert.deepEqual(systemLogs, [["log", "system", { kind: "started" }]])
  assert.deepEqual(programLogs, [["log", "program-reference", { kind: "stdout" }]])
  assert.deepEqual(storeChanges, [["storeChange", "program-reference", "tab", { revision: 1, value: "colors" }]])
}, 120_000)
