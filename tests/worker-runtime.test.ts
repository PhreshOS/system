import assert from "node:assert/strict"
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { delimiter, join } from "node:path"
import { pathToFileURL } from "node:url"
import messagepack from "@the-link/messagepack"
import { build } from "vite"
import CommandServerRuntime, { commandServerEnvironment } from "@server/core/server-runtime/command"
import SandboxServerRuntime from "@server/core/server-runtime/sandbox"
import WorkerServerRuntime from "@server/core/server-runtime/worker"
import Program from "@server/core/link-manager/auth-manager/program-manager/program"
import type { ProgramConfig } from "@server/core/link-manager/auth-manager/program-manager/config"
import { test } from "vitest"

test("server runtime contract", async () => {
  const directory = await mkdtemp(join(tmpdir(), "phresh-worker-runtime-"))
  const entry = join(directory, "server.mjs")
  const dependency = join(directory, "dependency.mjs")
  const bareEntry = join(directory, "bare.mjs")
  const escapedEntry = join(directory, "escaped.mjs")
  const failedEntry = join(directory, "failed.mjs")
  const timerEntry = join(directory, "timer.mjs")
  const asyncTimerEntry = join(directory, "async-timer.mjs")
  const outsideDirectory = await mkdtemp(join(tmpdir(), "phresh-sandbox-outside-"))
  const outsideModule = join(outsideDirectory, "outside.mjs")
  const linkedModule = join(directory, "linked.mjs")
  const commandEntry = join(directory, "command.mjs")
  const codecDirectory = join(directory, "codec")
  const codecEntry = join(codecDirectory, "sandbox-codec.js")
  const codec = pathToFileURL(createRequire(import.meta.url).resolve("@the-link/messagepack")).href
  const ready = [...messagepack.serialize(["boundary", "ready"])]
  const urlResult = [...messagepack.serialize(["url-result", "https://example.test/runtime"])]
  const bytesResult = [...messagepack.serialize(["bytes-result", [1, 2, 3]])]
  const webResult = [...messagepack.serialize(["web-result", true])]

  assert.equal(
      commandServerEnvironment(directory, { Path: "/native/bin" }).Path,
      `${join(directory, "node_modules", ".bin")}${delimiter}/native/bin`
  )

  await writeFile(dependency, `export const runtimePath = "/runtime"\n`)
  await writeFile(entry, `
  import { runtimePath } from "./dependency.mjs"
  const transport = globalThis.__PHRESHOS_SERVER_TRANSPORT__
  const runtimeUrl = new URL(runtimePath, "https://example.test/root")
  console.log("runtime output")
  transport.send(new Uint8Array(${JSON.stringify(ready)}))
  transport.send(new Uint8Array(runtimeUrl.href === "https://example.test/runtime" ? ${JSON.stringify(urlResult)} : []))
  transport.send(new Uint8Array(Uint8Array.from([1, 2, 3]).join(",") === "1,2,3" ? ${JSON.stringify(bytesResult)} : []))
  const headers = new Headers([["X-Test", "one"]])
  headers.append("x-test", "two")
  const request = new Request("https://example.test/request", { body: "request", headers, method: "POST", redirect: "manual" })
  const response = new Response(Uint8Array.from([114, 101, 115, 112, 111, 110, 115, 101]), {
      headers: { "content-type": "text/plain" }, status: 201, statusText: "Created"
  })
  Object.defineProperties(response, {
      redirected: { configurable: true, enumerable: true, value: true },
      type: { configurable: true, enumerable: true, value: "cors" },
      url: { configurable: true, enumerable: true, value: "https://example.test/response" }
  })
  const file = new File(["file"], "value.txt", { lastModified: 1, type: "text/plain" })
  let pulled = false
  const stream = new ReadableStream({
      async pull(controller) {
          if (pulled) return controller.close()
          pulled = true
          controller.enqueue(Uint8Array.from([115, 116, 114, 101, 97, 109]))
      }
  })
  const chunks = []
  for await (const chunk of stream) chunks.push(...chunk)
  const webValuesWork = request.url === "https://example.test/request"
      && request.method === "POST"
      && request.redirect === "manual"
      && request.headers.get("x-test") === "one, two"
      && await request.text() === "request"
      && response.status === 201
      && response.statusText === "Created"
      && response.ok
      && response.redirected
      && response.type === "cors"
      && response.url === "https://example.test/response"
      && await (await response.blob()).text() === "response"
      && file.name === "value.txt"
      && file.lastModified === 1
      && file.type === "text/plain"
      && await file.text() === "file"
      && new TextDecoder().decode(Uint8Array.from(chunks)) === "stream"
  transport.send(new Uint8Array(webValuesWork ? ${JSON.stringify(webResult)} : []))
  transport.onMessage(message => Promise.resolve(message).then(value => transport.send(Uint8Array.from(value))))
  `)
  const ambientPackage = "ambient-package"
  await writeFile(bareEntry, `import ${JSON.stringify(ambientPackage)}\n`)
  await writeFile(outsideModule, `export const outside = true\n`)
  await symlink(outsideModule, linkedModule)
  await writeFile(escapedEntry, `import "./linked.mjs"\n`)
  await writeFile(failedEntry, `throw new Error("failed runtime module")\n`)
  await writeFile(timerEntry, `setTimeout(() => { throw new Error("failed runtime timer") })\n`)
  await writeFile(asyncTimerEntry, `setTimeout(async () => { throw new Error("failed async runtime timer") })\n`)

  await writeFile(commandEntry, `
  import { deserialize as decode, serialize as encode } from ${JSON.stringify(codec)}

  console.log("command output")
  process.send?.(encode(["boundary", "ready"]))
  process.on("message", message => {
      const [event, value] = decode(bytes(message))
      if (event === "probe") process.send?.(encode(["probe-result", value]))
  })

  function bytes(value) {
      if (value instanceof Uint8Array) return value
      const record = value
      const result = new Uint8Array(Object.keys(record).length)
      for (let index = 0; index < result.length; index++) result[index] = record[index]
      return result
  }
  `)

  await build({
      configFile: false,
      logLevel: "silent",
      ssr: { noExternal: true },
      build: {
          ssr: join(import.meta.dirname, "fixtures", "sandbox-codec.ts"),
          outDir: codecDirectory,
          emptyOutDir: false,
          rollupOptions: { output: { entryFileNames: "sandbox-codec.js" } }
      }
  })

  try {
      const program = new Program({ identity: "worker-verification", server: { location: directory, worker: "server.mjs" } })

      await program.validate()

      assert.equal(program.serverEntryPath, entry)

      assert.throws(() => new Program({ identity: "worker-conflict", server: { location: directory, command: "node main.js", worker: "server.mjs" } } as unknown as ProgramConfig))
      assert.throws(() => new Program({ identity: "worker-escape", server: { location: directory, worker: "../server.mjs" } }))

      await verifyContainedRuntime(new WorkerServerRuntime(entry))
      await verifyContainedRuntime(new SandboxServerRuntime(entry, directory))
      await verifyCodecRuntime(new SandboxServerRuntime(codecEntry, codecDirectory))
      await verifyFailedRuntime(new WorkerServerRuntime(failedEntry), "failed runtime module")
      await verifyFailedRuntime(new SandboxServerRuntime(failedEntry, directory), "failed runtime module")
      await verifyFailedRuntime(new SandboxServerRuntime(timerEntry, directory), "failed runtime timer")
      await verifyFailedRuntime(new SandboxServerRuntime(asyncTimerEntry, directory), "failed async runtime timer")

      const sandbox = new Program({ identity: "sandbox-verification", server: { location: directory, sandbox: "server.mjs" } })
      await sandbox.validate()
      assert.equal(sandbox.serverEntryPath, entry)

      const bare = new SandboxServerRuntime(bareEntry, directory)
      const bareOutput: string[] = []
      bare.onOutput((_stream, text) => bareOutput.push(text))
      await bare.finished
      assert.match(bareOutput.join(""), /cannot import the package.*ambient-package.*bundle package dependencies/)

      const escaped = new SandboxServerRuntime(escapedEntry, directory)
      const escapedOutput: string[] = []
      escaped.onOutput((_stream, text) => escapedOutput.push(text))
      await escaped.finished
      assert.match(escapedOutput.join(""), /may not leave its Server directory/)

      const command = new CommandServerRuntime(`"${process.execPath}" "${commandEntry}"`, directory)
      const commandMessages: unknown[][] = []
      const commandOutput: ["out" | "err", string][] = []

      command.onMessage((event, ...values) => commandMessages.push([event, ...values]))
      command.onOutput((stream, text) => commandOutput.push([stream, text]))

      await until(() => commandMessages.some(message => message[0] === "boundary" && message[1] === "ready"))

      command.send("probe", 42)

      await until(() => commandMessages.some(message => message[0] === "probe-result"))
      await until(() => commandOutput.some(([stream, text]) => stream === "out" && text.includes("command output")))

      assert.deepEqual(commandMessages.find(message => message[0] === "probe-result"), ["probe-result", 42])

      command.stop()

      await command.finished
  } finally {
      await rm(directory, { recursive: true, force: true })
      await rm(outsideDirectory, { recursive: true, force: true })
  }

  async function verifyContainedRuntime(runtime: WorkerServerRuntime | SandboxServerRuntime) {
      const messages: unknown[][] = []
      const output: ["out" | "err", string][] = []

      runtime.onMessage((event, ...values) => messages.push([event, ...values]))
      runtime.onOutput((stream, text) => output.push([stream, text]))

      await until(() => messages.some(message => message[0] === "boundary" && message[1] === "ready")).catch(error => {
          const runtimeOutput = output.map(([stream, text]) => `${stream}: ${text}`).join("")
          throw new Error(`${error instanceof Error ? error.message : String(error)}${runtimeOutput ? `\n${runtimeOutput}` : ""}`)
      })
      await until(() => messages.some(message => message[0] === "url-result"))
      await until(() => messages.some(message => message[0] === "bytes-result"))
      await until(() => messages.some(message => message[0] === "web-result"))

      runtime.send("probe", 42)

      await until(() => messages.some(message => message[0] === "probe"))
      await until(() => output.some(([stream, text]) => stream === "out" && text.includes("runtime output")))

      assert.deepEqual(messages.find(message => message[0] === "probe"), ["probe", 42])
      assert.deepEqual(messages.find(message => message[0] === "url-result"), ["url-result", "https://example.test/runtime"])
      assert.deepEqual(messages.find(message => message[0] === "bytes-result"), ["bytes-result", [1, 2, 3]])
      assert.deepEqual(messages.find(message => message[0] === "web-result"), ["web-result", true])

      runtime.stop()

      const ending = await runtime.finished

      assert.equal(ending.signal, null)
  }

  async function verifyCodecRuntime(runtime: SandboxServerRuntime) {

      const messages: unknown[][] = []
      const output: string[] = []

      runtime.onMessage((event, ...values) => messages.push([event, ...values]))
      runtime.onOutput((_stream, text) => output.push(text))

      await until(() => messages.some(message => message[0] === "codec-ready") || output.length > 0)

      assert.deepEqual(output, [])

      const endpoint = {
          kind: "client",
          process: {
              reference: "process-reference",
              identity: "process",
              name: null,
              program: {
                  reference: "program-reference",
                  identity: "program",
                  assetId: "asset",
                  installed: false,
                  name: "Program",
                  version: "0.0.0",
                  description: null,
                  categories: [],
                  keywords: [],
                  hasAgent: false,
                  server: { location: "server", sandbox: "main.js", service: false },
                  client: { location: "client", service: false }
              },
              options: {},
              startedAt: new Date("2026-01-01T00:00:00.000Z"),
              server: { service: false },
              client: { service: false }
          }
      }
      const question = `client:${"a".repeat(36)}:${"b".repeat(36)}`

      runtime.send("codec-probe", endpoint, question)

      await until(() => messages.some(message => message[0] === "codec-result") || output.length > 0)

      assert.deepEqual(output, [])
      assert.deepEqual(messages.find(message => message[0] === "codec-result"), ["codec-result", ["codec-probe", endpoint, question]])

      runtime.stop()

      await runtime.finished
  }

  async function verifyFailedRuntime(runtime: WorkerServerRuntime | SandboxServerRuntime, message: string) {

      const output: ["out" | "err", string][] = []
      runtime.onOutput((stream, text) => output.push([stream, text]))

      let timeout: ReturnType<typeof setTimeout> | undefined
      const expiration = new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error(`${runtime.constructor.name} did not terminate after an uncaught error`)), 2_000)
      })
      let ending
      try { ending = await Promise.race([runtime.finished, expiration]) }
      finally {
          if (timeout) clearTimeout(timeout)
          runtime.stop()
      }

      assert.equal(ending.code, 1)
      assert.equal(ending.signal, null)
      assert.match(output.filter(([stream]) => stream === "err").map(([, text]) => text).join(""), new RegExp(message))
  }

  async function until(condition: () => boolean, timeout = 2_000) {
      const began = Date.now()

      while (!condition()) {
          if (Date.now() - began >= timeout) throw new Error(`Worker verification timed out after ${timeout}ms`)
          await new Promise(resolve => setTimeout(resolve, 10))
      }
  }
}, 120_000)
