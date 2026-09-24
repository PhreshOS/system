import assert from "node:assert/strict"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { SystemLogRecord } from "@phreshos/core"
import SystemLogs from "@server/core/logs"
import ProgramLogs from "@server/core/link-manager/auth-manager/program-manager/logs"
import { test } from "vitest"

test("System logs become observable only after they are durable", async () => {
  const directory = mkdtempSync(join(tmpdir(), "phresh-system-logs-"))
  const logs = new SystemLogs(join(directory, "logs.sqlite"))
  const received: SystemLogRecord[] = []

  try {
    logs.subscribe(record => received.push(record))

    logs.record("error", "process", "unexpectedServerEndpointExit", "Counter stopped unexpectedly.", {
      program: "counter",
      process: "main"
    })

    assert.equal(received.length, 0)

    await Promise.resolve()

    assert.equal(received.length, 1)
    assert.deepEqual(received[0], {
      createdAt: received[0]?.createdAt,
      level: "error",
      source: "process",
      kind: "unexpectedServerEndpointExit",
      content: "Counter stopped unexpectedly.",
      data: { program: "counter", process: "main" }
    })

    const rows = logs.query("select createdAt, level, source, kind, content, data from logs") as Record<string, unknown>[]

    assert.deepEqual(rows, [{
      createdAt: received[0]?.createdAt,
      level: "error",
      source: "process",
      kind: "unexpectedServerEndpointExit",
      content: "Counter stopped unexpectedly.",
      data: JSON.stringify({ program: "counter", process: "main" })
    }])

    assert.throws(() => logs.query("delete from logs"))
  } finally {
    logs.close()
    rmSync(directory, { recursive: true, force: true })
  }
})

test("subscribing does not replay stored System logs", async () => {
  const directory = mkdtempSync(join(tmpdir(), "phresh-system-logs-future-"))
  const logs = new SystemLogs(join(directory, "logs.sqlite"))

  try {
    logs.record("info", "system", "started", "The System started.")
    await Promise.resolve()

    const received: SystemLogRecord[] = []
    logs.subscribe(record => received.push(record))

    assert.equal(received.length, 0)

    logs.record("warning", "storage", "capacity", "Storage is nearing capacity.")
    await Promise.resolve()

    assert.equal(received.length, 1)
    assert.equal(received[0]?.kind, "capacity")
  } finally {
    logs.close()
    rmSync(directory, { recursive: true, force: true })
  }
})

test("Program log listeners receive the record after its row is stored", async () => {
  const directory = mkdtempSync(join(tmpdir(), "phresh-program-logs-live-"))
  const received: { record: unknown, rows: unknown[] }[] = []
  let logs!: ProgramLogs

  logs = new ProgramLogs(join(directory, "logs.sqlite"), record => {
    received.push({
      record,
      rows: logs.query("select process, source, kind, content from logs")
    })
  })

  try {
    logs.record("main", "client", "info", "ready")

    assert.equal(received.length, 0)

    await Promise.resolve()

    assert.deepEqual(received, [{
      record: {
        createdAt: (received[0]?.record as { createdAt?: unknown }).createdAt,
        process: "main",
        source: "client",
        kind: "info",
        content: "ready"
      },
      rows: [{ process: "main", source: "client", kind: "info", content: "ready" }]
    }])
  } finally {
    logs.close()
    rmSync(directory, { recursive: true, force: true })
  }
})
