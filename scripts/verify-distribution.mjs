import assert from "node:assert/strict"
import { execFileSync, spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs"
import { createServer } from "node:net"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import AdmZip from "adm-zip"
import manifest from "../package.json" with { type: "json" }

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const temporary = mkdtempSync(join(tmpdir(), "system-distribution-"))
const archive = join(repository, `${manifest.name}@${manifest.version}.zip`)
const checksum = `${archive}.sha256`
const installation = join(temporary, "installation")
const npm = process.platform === "win32" ? "npm.cmd" : "npm"
const portVariable = `${manifest.name.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").toUpperCase()}_PORT`

let runtime

try {
  execFileSync(
    process.execPath,
    ["--run", "pack"],
    { cwd: repository, stdio: "inherit" }
  )

  const zip = new AdmZip(archive)
  const expectedChecksum = readFileSync(checksum, "utf8").trim()
  const actualChecksum = createHash("sha256").update(readFileSync(archive)).digest("hex")

  assert.equal(expectedChecksum, `${actualChecksum}  ${archive.slice(repository.length + 1)}`)

  const paths = new Set(zip.getEntries().filter(entry => !entry.isDirectory).map(entry => entry.entryName))

  for (const required of [
    "package.json",
    "server/main.js",
    "client/index.html",
    "assets/default-icon.png"
  ]) {
    assert(paths.has(required), `the distribution has no ${required}`)
  }

  for (const path of paths) {
    assert(!path.startsWith("source/"), `TypeScript source entered the distribution: ${path}`)
    assert(!path.startsWith("storage/"), `runtime storage entered the distribution: ${path}`)
    assert(!path.startsWith("node_modules/"), `development dependencies entered the distribution: ${path}`)
    assert(!path.startsWith(".git"), `repository state entered the distribution: ${path}`)
  }

  mkdirSync(installation)
  zip.extractAllTo(installation)

  const installedManifest = JSON.parse(readFileSync(join(installation, "package.json"), "utf8"))

  assert.deepEqual(installedManifest.scripts, { start: "node server/main.js" })
  assert.deepEqual(installedManifest.engines, { node: ">=24.15.0" })
  assert.deepEqual(
    installedManifest.dependencies,
    Object.fromEntries(["cfonts", "sharp"].map(name => [name, manifest.dependencies[name]]))
  )

  execFileSync(
    npm,
    ["install", "--omit=dev", "--no-audit", "--no-fund", "--no-package-lock"],
    { cwd: installation, stdio: "inherit" }
  )

  execFileSync(process.execPath, ["--check", "server/main.js"], { cwd: installation })

  if (process.env.CI === "true") await boot(installation)
} finally {
  if (runtime && runtime.exitCode === null) {
    runtime.kill()
    await new Promise(resolve => runtime.once("exit", resolve))
  }

  rmSync(archive, { force: true })
  rmSync(checksum, { force: true })
  rmSync(temporary, { recursive: true, force: true })
}

async function availablePort() {
  const server = createServer()

  await new Promise((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolve)
  })

  const address = server.address()

  assert(address && typeof address === "object")

  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))

  return address.port
}

async function boot(directory) {
  const port = await availablePort()
  const output = []

  runtime = spawn(process.execPath, ["server/main.js"], {
    cwd: directory,
    env: { ...process.env, [portVariable]: String(port) },
    stdio: ["ignore", "pipe", "pipe"]
  })

  runtime.stdout.on("data", data => output.push(data.toString()))
  runtime.stderr.on("data", data => output.push(data.toString()))

  await waitForDesktop(port, runtime, output)
}

async function waitForDesktop(port, child, output) {
  const deadline = Date.now() + 20_000
  const url = `http://localhost:${port}/`

  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`the installed system exited before serving the desktop\n${output.join("")}`)

    try {
      const response = await fetch(url)
      const body = await response.text()

      assert.equal(response.status, 200)
      assert.match(body, /<html/i)

      return
    } catch {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }

  throw new Error(`the installed system did not serve the desktop\n${output.join("")}`)
}
