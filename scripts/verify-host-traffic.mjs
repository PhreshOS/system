import assert from "node:assert/strict"
import HostTraffic from "../source/server/core/link-manager/auth-manager/process-manager/host-traffic.ts"

const traffic = new HostTraffic()
const hostProgram = []
const ownProgram = []
const hostProcess = []
const programProcess = []

traffic.observe("program", "uninstall", null, (_delivery, event, ...values) => hostProgram.push([event, ...values]))
traffic.observe("program", "uninstall", "program-reference", (_delivery, event, ...values) => ownProgram.push([event, ...values]))
traffic.observe("process", "create", null, (_delivery, event, ...values) => hostProcess.push([event, ...values]))
traffic.observe("process", "create", "program-reference", (_delivery, event, ...values) => programProcess.push([event, ...values]))

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
