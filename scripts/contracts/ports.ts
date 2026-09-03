import { strict as assert } from "node:assert"
import { createServer } from "node:http"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { environmentPorts, listenOnPorts, parsePorts, portRange, requestedPorts } from "@server/view/configuration"

assert.equal(environmentPorts("phreshos", {}), undefined)
assert.deepEqual(environmentPorts("phreshos", { PHRESHOS_PORT: "4305" }), [4305])
assert.deepEqual(
    environmentPorts("phreshos", { PHRESHOS_PORT: "4196,4234,5000-5002,4234" }),
    [4196, 4234, 5000, 5001, 5002]
)
assert.deepEqual(portRange(4300, 4399), Array.from({ length: 100 }, (_, index) => 4300 + index))

for (const value of ["", "0", "65536", "43.12", "port", "4300-", "4301-4300", "4300,,4301"]) {

    assert.throws(() => parsePorts(value, "PHRESHOS_PORT"), /PHRESHOS_PORT must contain ports or inclusive ranges/)
}

const occupied = createServer()
const available = createServer()

const occupiedPort = await listenOnPorts(occupied, "127.0.0.1")
const availablePort = await listenOnPorts(available, "127.0.0.1")

await close(available)

const selected = createServer()

assert.equal(await listenOnPorts(selected, "127.0.0.1", [occupiedPort, availablePort]), availablePort)

await assert.rejects(
    listenOnPorts(createServer(), "127.0.0.1", [occupiedPort, availablePort]),
    /No configured System port is available/
)

await Promise.all([close(occupied), close(selected)])

const temporary = await mkdtemp(join(tmpdir(), "phreshos-port-request-"))
const request = join(temporary, "next-port")

try {

    await writeFile(request, "4400,4500-4502\n")

    assert.deepEqual(await requestedPorts(["node", "main.js", "--port-request", request]), [4400, 4500, 4501, 4502])
    await assert.rejects(readFile(request), error => (error as NodeJS.ErrnoException).code === "ENOENT")
}

finally { await rm(temporary, { recursive: true, force: true }) }

function close(server: ReturnType<typeof createServer>) {

    return new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
}
