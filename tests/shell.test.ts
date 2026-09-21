import assert from "node:assert/strict"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import shell from "@server/core/shell"
import { test } from "vitest"

test("shell contract", async () => {
  const directory = await mkdtemp(join(tmpdir(), "phresh-shell-"))
  const executable = `"${process.execPath}"`
  const outputEntry = join(directory, "output.mjs")
  const runningEntry = join(directory, "running.mjs")

  await writeFile(outputEntry, "process.stdout.write(process.env.PHRESHOS_SHELL_TEST); process.stderr.write('error'); process.exitCode = 7\n")
  await writeFile(runningEntry, "setInterval(() => {}, 1_000)\n")

  try {
    const events = []

    // Script files avoid asserting one host shell's quoting rules as a universal command contract.
    for await (const event of shell(`${executable} "${outputEntry}"`, { env: { PHRESHOS_SHELL_TEST: "output" } })) events.push(event)

    assert.equal(events[0]?.event, "started")
    assert.equal(events.flatMap(event => event.event === "output" && event.stream === "stdout" ? [event.text] : []).join(""), "output", JSON.stringify(events))
    assert.equal(events.flatMap(event => event.event === "output" && event.stream === "stderr" ? [event.text] : []).join(""), "error", JSON.stringify(events))
    assert.deepEqual(events.at(-1), {
        event: "exited",
        exit: { status: "exited", code: 7, signal: null }
    })

    const running = shell(`${executable} "${runningEntry}"`)
    const started = await running.next()
    const startedEvent = started.value

    assert.equal(startedEvent?.event, "started")
    await running.return(undefined)

    if (startedEvent?.event === "started") assert.throws(() => process.kill(startedEvent.pid, 0), { code: "ESRCH" })

    const controller = new AbortController()
    const aborted = shell(`${executable} "${runningEntry}"`, { signal: controller.signal })
    const abortedStart = (await aborted.next()).value
    const reason = new Error("test cancellation")

    controller.abort(reason)

    await assert.rejects(aborted.next(), error => error === reason)

    if (abortedStart?.event === "started") assert.throws(() => process.kill(abortedStart.pid, 0), { code: "ESRCH" })
  }
  finally { await rm(directory, { recursive: true, force: true }) }
}, 120_000)
