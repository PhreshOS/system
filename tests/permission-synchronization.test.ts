import { expect, test, vi } from "vitest"
import { TheLink } from "@the-link/core"
import type AuthManager from "@client/core/link-manager/auth-manager/auth-manager"
import ClientProgramManager from "@client/core/link-manager/auth-manager/program-manager/program-manager"
import SystemAccess from "@client/view/components/desktop-host/system-access"
import type { ProgramRecord } from "@server/core/link-manager/auth-manager/program-manager/entry"

function record(permissions: ProgramRecord["permissions"]): ProgramRecord {
    return {
        identity: "owner",
        reference: "00000000-0000-4000-8000-000000000001",
        assetId: "00000000-0000-4000-8000-000000000002",
        installed: true,
        name: "Owner",
        version: "0.0.0",
        description: null,
        categories: [],
        keywords: [],
        hasAgent: false,
        server: null,
        client: null,
        permissions
    }
}

test("the Desktop replaces synchronized permission state before publishing its change", async () => {
    const auth = new TheLink() as AuthManager
    const programs = new ClientProgramManager(auth, { programs: [["owner", record({})]] })
    Object.assign(auth, {
        programManager: programs,
        processManager: { processes: new Map([["process", { identity: "process", program: "owner" }]]) },
        grantsPermission: vi.fn(() => { throw new Error("permission checks must stay local") })
    })
    const access = new SystemAccess(auth, "process")
    const changes: unknown[] = []
    const stop = programs.$inbound.subscribe("/permissions", (program, permissions) => {
        changes.push([program, permissions])
    })

    try {
        await expect(access.require("appearance", [])).rejects.toThrow("Execution is not permitted")

        await programs.$inbound.publish("/permissions-change", record({ appearance: [] }))

        await expect(access.require("appearance", [])).resolves.toBeUndefined()
        expect(changes).toHaveLength(1)
        expect(changes[0]).toEqual([programs.programs.get("owner"), { appearance: [] }])
    }
    finally {
        stop()
    }
})
