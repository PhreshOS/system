import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import Program from "../source/server/core/link-manager/auth-manager/program-manager/program.ts"
import { copyProgram } from "../source/server/core/link-manager/auth-manager/program-manager/program-manager.ts"

const temporary = mkdtempSync(join(tmpdir(), "phresh-program-install-"))
const source = join(temporary, "source")
const installed = join(temporary, "installed")

try {
    mkdirSync(join(source, "server"), { recursive: true })
    mkdirSync(join(source, "client"), { recursive: true })
    writeFileSync(join(source, "client", "index.html"), "<!doctype html>")
    writeFileSync(join(source, "server-api.md"), "Server Service")
    writeFileSync(join(source, "client-api.md"), "Client Service")
    mkdirSync(installed)

    const program = new Program({
        identity: "documented-program",
        server: {
            location: join(source, "server"),
            serviceDocs: join(source, "server-api.md"),
            startCommand: "true"
        },
        client: {
            location: join(source, "client"),
            serviceDocs: join(source, "client-api.md")
        }
    })

    await program.validate()
    copyProgram(program, installed)

    const declaration = JSON.parse(readFileSync(join(installed, "program.json"), "utf8"))

    assert.equal(declaration.server.serviceDocs, "server-docs.md")
    assert.equal(declaration.client.serviceDocs, "client-docs.md")
    assert.equal(readFileSync(join(installed, "server-docs.md"), "utf8"), "Server Service")
    assert.equal(readFileSync(join(installed, "client-docs.md"), "utf8"), "Client Service")
}
finally {
    rmSync(temporary, { recursive: true, force: true })
}
