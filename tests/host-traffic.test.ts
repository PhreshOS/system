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

  traffic.observe("program", "uninstall", null, (_delivery, event, ...values) => hostProgram.push([event, ...values]))
  traffic.observe("program", "uninstall", "program-reference", (_delivery, event, ...values) => ownProgram.push([event, ...values]))
  traffic.observe("process", "create", null, (_delivery, event, ...values) => hostProcess.push([event, ...values]))
  traffic.observe("process", "create", "program-reference", (_delivery, event, ...values) => programProcess.push([event, ...values]))
  traffic.observe("connection", "create", null, (_delivery, event, ...values) => hostConnection.push([event, ...values]))
  traffic.observe("session", "connectionAttach", "session-identity", (_delivery, event, ...values) => ownSession.push([event, ...values]))
  traffic.observe("log", "log", null, (_delivery, event, ...values) => systemLogs.push([event, ...values]))
  traffic.observe("programLog", "log", "program-reference", (_delivery, event, ...values) => programLogs.push([event, ...values]))

  const program = { identity: "counter", reference: "program-reference" }
  const process = { identity: "worker", reference: "process-reference" }

  await traffic.emitHost("program", "uninstall", program.identity, program, true)

  assert.deepEqual(hostProgram, [["uninstall", program.identity, program, true]])
  assert.deepEqual(ownProgram, [])

  await traffic.emitSubject("program", "uninstall", program.reference, true)

  assert.deepEqual(ownProgram, [["uninstall", program.reference, true]])

  await traffic.emit("process", "create", program.identity, program.reference, process)

  assert.deepEqual(hostProcess, [["create", program.identity, process]])
  assert.deepEqual(programProcess, [["create", program.reference, process]])

  await traffic.emitHost("connection", "create", "connection-identity", { identity: "connection-identity" })
  await traffic.emitSubject("session", "connectionAttach", "session-identity", { identity: "connection-identity" })
  await traffic.emitHost("log", "log", "system", { kind: "started" })
  await traffic.emitSubject("programLog", "log", "program-reference", { kind: "stdout" })

  assert.deepEqual(hostConnection, [["create", "connection-identity", { identity: "connection-identity" }]])
  assert.deepEqual(ownSession, [["connectionAttach", "session-identity", { identity: "connection-identity" }]])
  assert.deepEqual(systemLogs, [["log", "system", { kind: "started" }]])
  assert.deepEqual(programLogs, [["log", "program-reference", { kind: "stdout" }]])
}, 120_000)
