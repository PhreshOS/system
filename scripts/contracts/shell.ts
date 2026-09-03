import assert from "node:assert/strict"
import shell from "@server/core/shell"

const executable = JSON.stringify(process.execPath)
const script = JSON.stringify("process.stdout.write(process.env.PHRESHOS_SHELL_TEST); process.stderr.write('error'); process.exit(7)")
const events = []

for await (const event of shell(`${executable} -e ${script}`, { env: { PHRESHOS_SHELL_TEST: "output" } })) events.push(event)

assert.equal(events[0]?.event, "started")
assert(events.some(event => event.event === "output" && event.stream === "stdout" && event.text === "output"))
assert(events.some(event => event.event === "output" && event.stream === "stderr" && event.text === "error"))
assert.deepEqual(events.at(-1), {
    event: "exited",
    exit: { status: "exited", code: 7, signal: null }
})

const running = shell(`${executable} -e ${JSON.stringify("setInterval(() => {}, 1_000)")}`)
const started = await running.next()
const startedEvent = started.value

assert.equal(startedEvent?.event, "started")
await running.return(undefined)

if (startedEvent?.event === "started") assert.throws(() => process.kill(startedEvent.pid, 0), { code: "ESRCH" })

const controller = new AbortController()
const aborted = shell(`${executable} -e ${JSON.stringify("setInterval(() => {}, 1_000)")}`, { signal: controller.signal })
const abortedStart = (await aborted.next()).value
const reason = new Error("test cancellation")

controller.abort(reason)

await assert.rejects(aborted.next(), error => error === reason)

if (abortedStart?.event === "started") assert.throws(() => process.kill(abortedStart.pid, 0), { code: "ESRCH" })
