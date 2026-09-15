import { expect, test, vi } from "vitest"
import type { PermissionName, Permissions, ProgramSnapshot } from "@phreshos/core"
import type AuthManager from "@client/core/link-manager/auth-manager/auth-manager"
import host from "@client/view/components/desktop-host/host"
import { permissionCatalog } from "@server/core/permissions"

test("Client Program creation requires all before reaching the creation boundary", async () => {
    let permissions: Permissions = { programs: [] }
    const program: ProgramSnapshot = {
        identity: "created", reference: "created-reference", assetId: "created-assets",
        name: "Created", version: null, description: null, hasAgent: false,
        server: null, client: null
    }
    const create = vi.fn(async () => program.identity)
    const forceCreate = vi.fn(async () => program.identity)
    const auth = {
        programManager: { programs: new Map([[program.identity, program]]), create, forceCreate },
        processManager: { processes: new Map() },
        grantsPermission: async (_pane: string, name: PermissionName, values: never[]) => permissionCatalog.allows(name, values, permissions)
    } as unknown as AuthManager
    const answer = host(auth, "caller", () => { throw new Error("unused viewport") }, () => null, {} as never)
    const source = { identity: "created" }
    for (const operation of ["host-program-create", "host-program-force-create"]) {
        await expect(answer(operation, source)).rejects.toThrow("Execution is not permitted")
    }
    expect(create).not.toHaveBeenCalled()
    expect(forceCreate).not.toHaveBeenCalled()
    permissions = { all: [] }
    expect(await answer("host-program-create", source)).toEqual([program])
    expect(await answer("host-program-force-create", source)).toEqual([program])
    expect(create).toHaveBeenCalledWith(source)
    expect(forceCreate).toHaveBeenCalledWith(source, "caller")
})

test("Program and Process discovery exposes only the accessible scope", async () => {

    let permissions: Permissions = {}
    const owner = program("owner")
    const outside = program("outside")
    const current = process("current", owner)
    const hidden = process("hidden", outside)
    const auth = {
        programManager: { programs: new Map([[owner.identity, owner], [outside.identity, outside]]) },
        processManager: { processes: new Map([[current.identity, current], [hidden.identity, hidden]]) },
        grantsPermission: async (_pane: string, name: PermissionName, values: never[]) => permissionCatalog.allows(name, values, permissions)
    } as unknown as AuthManager
    const answer = host(auth, current.identity, () => { throw new Error("unused viewport") }, () => null, {} as never)

    await expect(answer("host-program-list")).resolves.toEqual([[expect.objectContaining({ identity: owner.identity })]])
    await expect(answer("host-process-list")).resolves.toEqual([[expect.objectContaining({ identity: current.identity })]])
    await expect(answer("host-program-find", outside.identity)).resolves.toEqual([null])
    await expect(answer("host-process-find", hidden.identity)).resolves.toEqual([null])
    await expect(answer("installed", { identity: outside.identity, reference: outside.reference })).rejects.toThrow("Program represented by this handle does not exist")
    await expect(answer("window", { identity: hidden.identity, reference: hidden.reference })).rejects.toThrow("Process represented by this handle does not exist")

    permissions = { programs: [outside.identity] }

    await expect(answer("host-program-list")).resolves.toEqual([[
        expect.objectContaining({ identity: owner.identity }),
        expect.objectContaining({ identity: outside.identity })
    ]])
    await expect(answer("host-process-list")).resolves.toEqual([[
        expect.objectContaining({ identity: current.identity }),
        expect.objectContaining({ identity: hidden.identity })
    ]])
    await expect(answer("host-program-find", outside.identity)).resolves.toEqual([expect.objectContaining({ identity: outside.identity })])
    await expect(answer("host-process-find", hidden.identity)).resolves.toEqual([expect.objectContaining({ identity: hidden.identity })])
})

test.each([
    { owningProgram: "owner", denied: [], granted: [{}] },
    {
        owningProgram: "outside",
        denied: [
            {},
            { all: [], services: false },
            { services: ["unrelated"] },
            { programs: ["unrelated"] }
        ],
        granted: [
            { services: ["outside"] },
            { services: [] },
            { programs: ["outside"] },
            { programs: [] },
            { all: [] }
        ]
    }
] satisfies ReadonlyArray<{
    owningProgram: string
    denied: Permissions[]
    granted: Permissions[]
}>)("Service operations expose only Services in the accessible scope for $owningProgram", async ({ owningProgram, denied, granted }) => {
    const destination = "6d138083-7a51-44ec-9abe-ff0194ad1e5b"
    let permissions: Permissions = {}
    const serviceExists = vi.fn(async () => true)
    const waitServiceReady = vi.fn()
    const followService = vi.fn()
    const sendService = vi.fn()
    const askService = vi.fn()
    const auth = {
        programManager: { programs: new Map() },
        processManager: {
            processes: new Map([
                ["caller", { program: "owner" }],
                [destination, { program: owningProgram }]
            ]),
            serviceExists, waitServiceReady, followService, sendService, askService
        },
        grantsPermission: async (_pane: string, name: PermissionName, values: never[]) => permissionCatalog.allows(name, values, permissions)
    } as unknown as AuthManager
    const answer = host(auth, "caller", () => { throw new Error("unused viewport") }, () => "frame", {} as never)
    for (const key of [{ program: owningProgram, process: "main", endpoint: "server" }, { process: destination, endpoint: "server" }]) {
        const operations = [
            ["service-exists", key],
            ["service-wait-ready", key],
            ["service-follow", "subscription", key, "events", "change"],
            ["service-send", key, "change", {}],
            ["service-ask", key, "read", {}]
        ] as const
        for (const assignment of denied) {
            permissions = assignment
            for (const [operation, ...args] of operations) {
                await expect(answer(operation, ...args)).rejects.toThrow("The Service represented by this key does not exist")
            }
        }
        for (const assignment of granted) {
            permissions = assignment
            for (const [operation, ...args] of operations) await answer(operation, ...args)
        }
    }
    for (const call of [serviceExists, waitServiceReady, followService, sendService, askService]) {
        expect(call).toHaveBeenCalledTimes(granted.length * 2)
    }
})

function program(identity: string): ProgramSnapshot {

    return {
        identity,
        reference: `${identity}-reference`,
        assetId: `${identity}-assets`,
        name: identity,
        version: null,
        description: null,
        hasAgent: false,
        server: null,
        client: null
    }
}

function process(identity: string, owner: ProgramSnapshot) {

    return {
        identity,
        reference: `${identity}-reference`,
        program: owner.identity,
        name: null,
        startedAt: new Date(0),
        options: {},
        server: null,
        client: null
    }
}
