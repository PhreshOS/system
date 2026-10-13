import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { TheLink } from "@the-link/core"
import { expect, test, type TestContext } from "vitest"
import type { PermissionName } from "@phreshos/core"
import FileManager from "@libs/file-manager"
import type AuthManager from "@server/core/link-manager/auth-manager/auth-manager"
import Program from "@server/core/link-manager/auth-manager/program-manager/program"
import ProgramManager from "@server/core/link-manager/auth-manager/program-manager/program-manager"
import type Process from "@server/core/link-manager/auth-manager/process-manager/process"
import SystemAccess from "@server/core/link-manager/auth-manager/process-manager/system-access"
import type ProcessManager from "@server/core/link-manager/auth-manager/process-manager/process-manager"

/** The System's own launch resolution, and an executor holding only the layers given. */
function fixture(context: TestContext, layers: readonly string[], provides: readonly string[] = []) {
    const directory = mkdtempSync(join(tmpdir(), "phresh-launch-permission-"))
    context.onTestFinished(() => rmSync(directory, { recursive: true, force: true }))
    const auth = Object.assign(new TheLink(), {
        linkManager: { application: { storage: new FileManager(directory, "system"), icons: { system: "", defaultProgram: "" } } }
    }) as unknown as AuthManager
    const programManager = new ProgramManager(auth)
    const manager = {
        authManager: { programManager },
        grants: (_identity: string, name: PermissionName, requested: readonly string[]) =>
            name === "layers" ? requested.every(layer => layers.includes(layer))
                : name === "provideServices" ? requested.every(service => provides.includes(service))
                    : false
    } as unknown as ProcessManager
    const program = (identity: string, layer?: string) => new Program({ identity, client: { location: "https://example.test/", ...(layer ? { layer } : {}) } } as never)
    const provider = (identity: string, service: string) => new Program({ identity, server: { location: ".", command: "true", service } } as never)
    const executor = (owner: Program) => new SystemAccess(manager, { identity: `${owner.identity}-process`, program: owner } as unknown as Process)
    return { program, provider, executor }
}

test("whoever starts a Program answers for the layer it declares, as for one it passes", context => {
    const { program, executor } = fixture(context, [])
    const overlay = program("overlay", "over"), other = program("other")

    // Started with nothing passed, it would open where it declares: in `over`.
    expect(() => executor(other).launch(overlay, {})).toThrow(/not permitted/)
    // Even by itself: declaring is not holding.
    expect(() => executor(overlay).launch(overlay, {})).toThrow(/not permitted/)
    // Passed explicitly, the same.
    expect(() => executor(other).launch(other, { client: { layer: "over" } })).toThrow(/not permitted/)
    // What the launch passes decides over what is declared.
    expect(() => executor(other).launch(overlay, { client: { layer: "window" } })).not.toThrow()
    expect(() => executor(other).launch(other, {})).not.toThrow()
    // A launch that opens no Client opens it nowhere.
    expect(() => executor(other).clientLaunch(overlay, {})).toThrow(/not permitted/)
})

test("an executor holding the layer starts a Program declared in it", context => {
    const { program, executor } = fixture(context, ["over"])
    const overlay = program("overlay", "over"), other = program("other")

    expect(() => executor(other).launch(overlay, {})).not.toThrow()
    expect(() => executor(other).launch(other, { client: { layer: "under" } })).toThrow(/not permitted/)
})

test("whoever starts a Program answers for the Service name it declares, as for one it passes", context => {
    const { provider, executor } = fixture(context, [], ["file-picker-v1"])
    const files = provider("files", "file-picker-v1"), other = provider("other", "other-picker-v1")

    // It may provide file-picker-v1, declared or passed, and take it from whoever holds it.
    expect(() => executor(files).launch(files, {})).not.toThrow()
    expect(() => executor(other).launch(other, { server: { service: "file-picker-v1" } })).not.toThrow()
    // Not another name, even one its own Program declares.
    expect(() => executor(other).launch(other, {})).toThrow(/not permitted/)
    expect(() => executor(files).serverLaunch(other, {})).toThrow(/not permitted/)
    // `false` provides nothing, whatever is declared.
    expect(() => executor(other).launch(other, { server: { service: false } })).not.toThrow()
})
