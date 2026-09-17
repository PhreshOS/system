import assert from "node:assert/strict"
import { TheLink } from "@the-link/core"
import type { PermissionName, PermissionValue, Permissions } from "@phreshos/core"
import type AuthManager from "@server/core/link-manager/auth-manager/auth-manager"
import Program from "@server/core/link-manager/auth-manager/program-manager/program"
import ProcessManager from "@server/core/link-manager/auth-manager/process-manager/process-manager"
import type Process from "@server/core/link-manager/auth-manager/process-manager/process"
import type ServerProcessBoundary from "@server/core/link-manager/auth-manager/process-manager/server-process-boundary"
import { permissionCatalog } from "@server/core/permissions"
import { test } from "vitest"

test("Server Endpoints use their Program's permission scope", async () => {

    let permissions: Permissions = {}
    const authManager = new TheLink() as unknown as AuthManager
    const manager = new ProcessManager(authManager)
    const owner = program("owner")
    const outside = program("outside")
    const launch = { server: null, client: null, options: {} } as const
    const programs = new Map([[owner.identity, { program: owner }], [outside.identity, { program: outside }]])

    const system = {
        listPrograms() { return [owner, outside] },
        findProgram(identity: string) { return identity === owner.identity ? owner : identity === outside.identity ? outside : null },
        async createProgram(source: { identity: string }) {

            const created = program(source.identity)
            programs.set(created.identity, { program: created })
            return created
        },
        requireProgram(identity: string) {

            const found = programs.get(identity)?.program
            if (!found) throw new Error("The Program does not exist")
            return found
        },
        holdProgram(value: unknown, fallback: Program = owner) {

            if (value === undefined || value === null) return fallback
            if (typeof value !== "object" || value === null) throw new Error("Invalid Program handle")
            const handle = value as { identity?: string, reference?: string }
            const found = this.findProgram(String(handle.identity))
            if (!found || found.reference !== handle.reference) throw new Error("The Program represented by this handle does not exist")
            return found
        }
    }

    Object.assign(authManager, {
        programManager: {
            programs,
            permission() { return null },
            grantsPermission<Name extends PermissionName>(_program: Program, name: Name, requested: readonly PermissionValue<Name>[]) {

                return permissionCatalog.allows(name, requested, permissions)
            },
            grantsStorage() { return false }
        },
        linkManager: { application: { system } }
    })

    const current = await manager.register("current", null, owner, {}, launch, null, false, null, null)
    const hidden = await manager.register("hidden", null, outside, {}, launch, null, false, null, null)

    const boundary = manager as unknown as {
        endHost(process: Process, server: ServerProcessBoundary, args: unknown[]): Promise<unknown[]>
    }
    const answer = (...args: unknown[]) => boundary.endHost(current, {} as ServerProcessBoundary, args)

    assert.deepEqual((await answer("host-program-list") as [Program[]])[0].map(program => program.identity), [owner.identity])
    assert.deepEqual(await answer("host-program-find", outside.identity), [null])
    await assert.rejects(answer("host-program-create", { identity: "created", client: { location: "." } }), /Execution is not permitted/)
    await assert.rejects(answer("update-appearance", {}), /Execution is not permitted/)
    await assert.rejects(answer("program-create-process", owner, { client: { layer: "over" } }), /Execution is not permitted/)

    permissions = { programs: [outside.identity], appearance: [], layers: ["over"] }

    assert.deepEqual((await answer("host-program-list") as [Program[]])[0].map(program => program.identity), [owner.identity, outside.identity])
    assert.equal((await answer("host-program-find", outside.identity) as [Program])[0], outside)
    await assert.rejects(answer("host-program-create", { identity: "created", client: { location: "." } }), /Execution is not permitted/)

    permissions = { all: [] }

    assert.equal(((await answer("host-program-create", { identity: "created", client: { location: "." } })) as [Program])[0].identity, "created")

    assert.equal(manager.processes.get(hidden.identity), hidden)
})

function program(identity: string) {

    return new Program({ identity, server: { location: ".", command: "true" } })
}
