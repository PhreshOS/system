import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import Program from "@server/core/link-manager/auth-manager/program-manager/program"
import { copyProgram } from "@server/core/link-manager/auth-manager/program-manager/program-manager"
import type { ProgramCommandChunk } from "@phreshos/core"

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
        categories: ["Development"],
        keywords: ["example"],
        website: "https://example.test/program",
        server: {
            location: join(source, "server"),
            installCommand: `node -e "process.stdout.write('install-out'); process.stderr.write('install-err')"`,
            uninstallCommand: `node -e "process.stdout.write('uninstall-out'); process.stderr.write('uninstall-err')"`,
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
    assert.deepEqual(declaration.categories, ["Development"])
    assert.deepEqual(declaration.keywords, ["example"])
    assert.equal(declaration.website, "https://example.test/program")
    assert(program.config.server)
    assert.equal(declaration.server.uninstallCommand, program.config.server.uninstallCommand)
    assert.equal(readFileSync(join(installed, "agent.md"), "utf8"), "Program operating knowledge")

    const installedProgram = new Program(join(installed, "program.json"))
    const installation: ProgramCommandChunk[] = []
    const uninstallation: ProgramCommandChunk[] = []

    await installedProgram.installServer(chunk => { installation.push(chunk) })
    await installedProgram.uninstallServer(chunk => { uninstallation.push(chunk) })

    assert.deepEqual(Object.fromEntries(installation.map(chunk => [chunk.stream, chunk.text])), {
        stdout: "install-out",
        stderr: "install-err"
    })
    assert.deepEqual(Object.fromEntries(uninstallation.map(chunk => [chunk.stream, chunk.text])), {
        stdout: "uninstall-out",
        stderr: "uninstall-err"
    })
}
finally {
    rmSync(temporary, { recursive: true, force: true })
}
