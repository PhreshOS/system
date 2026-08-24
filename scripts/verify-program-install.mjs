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
    writeFileSync(join(source, "operating-guide.md"), "Program operating knowledge")
    mkdirSync(installed)

    const program = new Program({
        identity: "documented-program",
        agent: join(source, "operating-guide.md"),
        server: {
            location: join(source, "server"),
            startCommand: "true"
        },
        client: {
            location: join(source, "client")
        }
    })

    await program.validate()
    copyProgram(program, installed)

    const declaration = JSON.parse(readFileSync(join(installed, "program.json"), "utf8"))

    assert.equal(declaration.agent, "agent.md")
    assert.equal(readFileSync(join(installed, "agent.md"), "utf8"), "Program operating knowledge")
}
finally {
    rmSync(temporary, { recursive: true, force: true })
}
