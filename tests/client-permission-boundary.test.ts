import { expect, test, vi } from "vitest"
import type { PermissionName, Permissions, ProgramSnapshot } from "@phreshos/core"
import type AuthManager from "@client/core/link-manager/auth-manager/auth-manager"
import host from "@client/view/components/desktop-host/host"
import { permissionCatalog } from "@server/core/permissions"

function clientFrame() {
    return {
        element: {},
        point: (point: { x: number, y: number }) => point
    } as never
}

test("Client Program creation requires all before reaching the creation boundary", async () => {
    let permissions: Permissions = { programs: [] }
    const program: ProgramSnapshot & { readonly permissions: Permissions } = {
        identity: "created", reference: "created-reference", assetId: "created-assets",
        name: "Created", version: "0.0.0", description: null, hasAgent: false,
        server: null, client: null,
        get permissions() { return permissions }
    }
    const create = vi.fn(async () => program.identity)
    const forceCreate = vi.fn(async () => program.identity)
    const auth = {
        programManager: { programs: new Map([[program.identity, program]]), create, forceCreate },
        processManager: { processes: new Map([["caller", { identity: "caller", program: program.identity }]]) },
        grantsPermission: async (_pane: string, name: PermissionName, values: never[]) => permissionCatalog.allows(name, values, permissions)
    } as unknown as AuthManager
    const answer = host(auth, "caller", { state: () => { throw new Error("unused viewport") }, move: () => { throw new Error("unused viewport") } }, {} as never, () => null, clientFrame(), {} as never)
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
    Object.defineProperty(owner, "installed", { value: true })
    Object.defineProperty(owner, "permissions", { get: () => permissions })
    const outside = program("outside")
    Object.defineProperty(outside, "installed", { value: false })
    outside.permissions = { network: ["https://example.com"] }
    const current = process("current", owner)
    const hidden = process("hidden", outside)
    const auth = {
        programManager: { programs: new Map([[owner.identity, owner], [outside.identity, outside]]) },
        processManager: { processes: new Map([[current.identity, current], [hidden.identity, hidden]]) },
        grantsPermission: async (_pane: string, name: PermissionName, values: never[]) => permissionCatalog.allows(name, values, permissions)
    } as unknown as AuthManager
    const answer = host(auth, current.identity, { state: () => { throw new Error("unused viewport") }, move: () => { throw new Error("unused viewport") } }, {} as never, () => null, clientFrame(), {} as never)

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
    await expect(answer("host-program-list", { installed: true })).resolves.toEqual([[expect.objectContaining({ identity: owner.identity })]])
    await expect(answer("host-program-list", { installed: false })).resolves.toEqual([[expect.objectContaining({ identity: outside.identity })]])
    await expect(answer("host-program-list", true)).rejects.toThrow(/object/)
    await expect(answer("host-process-list")).resolves.toEqual([[
        expect.objectContaining({ identity: current.identity }),
        expect.objectContaining({ identity: hidden.identity })
    ]])
    await expect(answer("host-program-find", outside.identity)).resolves.toEqual([expect.objectContaining({ identity: outside.identity })])
    await expect(answer("host-process-find", hidden.identity)).resolves.toEqual([expect.objectContaining({ identity: hidden.identity })])
})

test("Program permission reads require Program access while owner decisions require all", async () => {
    let permissions: Permissions = { programs: ["outside"] }
    const owner = program("owner")
    Object.defineProperty(owner, "permissions", { get: () => permissions })
    const outside = program("outside")
    outside.permissions = { network: ["https://example.com"] }
    const current = process("current", owner)
    const read = vi.fn(async (_address, operation: string) => operation === "all"
        ? { network: ["https://example.com"] }
        : ["https://example.com"])
    const auth = {
        programManager: { programs: new Map([[owner.identity, owner], [outside.identity, outside]]), permissions: read },
        processManager: { processes: new Map([[current.identity, current]]) },
        grantsPermission: async (_pane: string, name: PermissionName, values: never[]) => permissionCatalog.allows(name, values, permissions)
    } as unknown as AuthManager
    const answer = host(auth, current.identity, { state: () => { throw new Error("unused viewport") }, move: () => { throw new Error("unused viewport") } }, {} as never, () => null, clientFrame(), {} as never)
    const target = { identity: outside.identity, reference: outside.reference }

    await expect(answer("program-permissions", target, "get", "network")).resolves.toEqual([["https://example.com"]])
    await expect(answer("program-permissions", target, "all")).resolves.toEqual([{ network: ["https://example.com"] }])
    await expect(answer("program-permissions", target, "request", "request", "network", ["https://example.com"])).rejects.toThrow("does not know")
    await expect(answer("program-permissions", target, "allow", "network", ["https://example.com"])).rejects.toThrow("Execution is not permitted")
    await expect(answer("program-permissions", target, "deny", "network")).rejects.toThrow("Execution is not permitted")

    permissions = { all: [] }
    await expect(answer("program-permissions", target, "allow", "network", ["https://example.com"])).resolves.toEqual([])
    await expect(answer("program-permissions", target, "deny", "network")).resolves.toEqual([])
})

test("Program log access follows the Program handle while System logs require logs", async () => {
    let permissions: Permissions = {}
    const owner = program("owner")
    Object.defineProperty(owner, "permissions", { get: () => permissions })
    const outside = program("outside")
    const current = process("current", owner)
    const programLogs = vi.fn(async () => [{ kind: "stdout" }])
    const systemLogs = vi.fn(async () => [{ kind: "system" }])
    const auth = {
        programManager: { programs: new Map([[owner.identity, owner], [outside.identity, outside]]), logs: programLogs },
        processManager: { processes: new Map([[current.identity, current]]) },
        logs: systemLogs,
        grantsPermission: async (_pane: string, name: PermissionName, values: never[]) => permissionCatalog.allows(name, values, permissions)
    } as unknown as AuthManager
    const answer = host(auth, current.identity, { state: () => { throw new Error("unused viewport") }, move: () => { throw new Error("unused viewport") } }, {} as never, () => null, clientFrame(), {} as never)
    const own = { identity: owner.identity, reference: owner.reference }
    const other = { identity: outside.identity, reference: outside.reference }

    await expect(answer("logs", own, "select * from logs", [])).resolves.toEqual([[{ kind: "stdout" }]])
    await expect(answer("logs", other, "select * from logs", [])).rejects.toThrow("Program represented by this handle does not exist")
    await expect(answer("system-logs", "select * from logs", [])).rejects.toThrow("Execution is not permitted")

    permissions = { programs: [outside.identity] }
    await expect(answer("logs", other, "select * from logs", [])).resolves.toEqual([[{ kind: "stdout" }]])
    await expect(answer("system-logs", "select * from logs", [])).rejects.toThrow("Execution is not permitted")

    permissions = { logs: [] }
    await expect(answer("system-logs", "select * from logs", [])).resolves.toEqual([[{ kind: "system" }]])
})

test("a Client Context requests only for its own Endpoint Program", async () => {
    const owner = program("owner")
    const current = process("current", owner)
    const requestPermission = vi.fn(async () => ["https://example.com"])
    const auth = {
        programManager: { programs: new Map([[owner.identity, owner]]) },
        processManager: { processes: new Map([[current.identity, current]]) },
        requestPermission
    } as unknown as AuthManager
    const answer = host(auth, current.identity, { state: () => { throw new Error("unused viewport") }, move: () => { throw new Error("unused viewport") } }, {} as never, () => null, clientFrame(), {} as never)
    const timeout = 1_000

    await expect(answer("context-permission-request", "request", "network", ["https://example.com"], timeout))
        .resolves.toEqual([["https://example.com"]])
    expect(requestPermission).toHaveBeenCalledWith("current", "request", "network", ["https://example.com"], timeout)
})

test("the system-wide permission registry requires all", async () => {
    let permissions: Permissions = {}
    const owner = program("owner")
    Object.defineProperty(owner, "permissions", { get: () => permissions })
    const current = process("current", owner)
    const list = vi.fn(() => [{ identity: "request" }])
    const auth = {
        programManager: { programs: new Map([[owner.identity, owner]]) },
        processManager: { processes: new Map([[current.identity, current]]) },
        permissionManager: { list },
        grantsPermission: async (_pane: string, name: PermissionName, values: never[]) => permissionCatalog.allows(name, values, permissions)
    } as unknown as AuthManager
    const answer = host(auth, current.identity, { state: () => { throw new Error("unused viewport") }, move: () => { throw new Error("unused viewport") } }, {} as never, () => null, clientFrame(), {} as never)

    await expect(answer("host-permission-requests")).rejects.toThrow("Execution is not permitted")
    expect(list).not.toHaveBeenCalled()

    permissions = { all: [] }
    await expect(answer("host-permission-requests")).resolves.toEqual([[{ identity: "request" }]])
})

test.each([
    {
        owningProgram: "owner",
        denied: [{}, { services: ["unrelated"] }, { programs: [] }],
        granted: [{ services: ["main"] }, { services: [] }, { all: [] }]
    },
    {
        owningProgram: "outside",
        denied: [
            {},
            { all: [], services: false },
            { services: ["unrelated"] },
            { programs: ["unrelated"] },
            { programs: ["outside"] },
            { programs: [] }
        ],
        granted: [
            { services: ["main"] },
            { services: [] },
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
    const serviceAvailable = vi.fn(async () => true)
    const waitServiceReady = vi.fn()
    const serviceProgramMetadata = vi.fn(async () => ({ name: "Provider", version: "0.0.0" }))
    const serviceProgramIcon = vi.fn(async () => [])
    const followService = vi.fn()
    const sendService = vi.fn()
    const askService = vi.fn()
    const auth = {
        programManager: { programs: new Map([["owner", { identity: "owner", get permissions() { return permissions } }]]) },
        processManager: {
            processes: new Map([
                ["caller", { program: "owner" }],
                [destination, { program: owningProgram }]
            ]),
            serviceAvailable, waitServiceReady, serviceProgramMetadata, serviceProgramIcon, followService, sendService, askService
        },
        grantsPermission: async (_pane: string, name: PermissionName, values: never[]) => permissionCatalog.allows(name, values, permissions)
    } as unknown as AuthManager
    const answer = host(auth, "caller", { state: () => { throw new Error("unused viewport") }, move: () => { throw new Error("unused viewport") } }, {} as never, () => "frame", clientFrame(), {} as never)
    const key = { program: owningProgram, process: "main", endpoint: "server" } as const
    const operations = [
            ["service-available", key],
            ["service-wait-ready", key],
            ["service-program-metadata", key],
            ["service-program-icon", key, "small"],
            ["service-send", key, "change", {}],
            ["service-ask", key, "read", {}]
        ] as const
    for (const assignment of denied) {
        permissions = assignment
        for (const [operation, ...args] of operations) {
            await expect(answer(operation, ...args)).rejects.toThrow("Execution is not permitted")
        }
        await expect(answer("service-follow", "subscription", key, "events", "change")).resolves.toEqual([])
    }
    for (const assignment of granted) {
        permissions = assignment
        for (const [operation, ...args] of operations) await answer(operation, ...args)
        await answer("service-follow", "subscription", key, "events", "change")
    }
    for (const call of [serviceAvailable, waitServiceReady, serviceProgramMetadata, serviceProgramIcon, followService, sendService, askService]) {
        expect(call).toHaveBeenCalledTimes(granted.length)
    }
})

test("Service discovery filters ready addresses only by Service-name authority", async () => {
    let permissions: Permissions = { programs: [] }
    const mainServer = { program: "notes", process: "main", endpoint: "server" } as const
    const mainClient = { program: "editor", process: "main", endpoint: "client" } as const
    const background = { program: "notes", process: "background", endpoint: "server" } as const
    const listServices = vi.fn(async (options: { name?: string } = {}) => [mainServer, mainClient, background].filter(service => options.name === undefined || service.process === options.name))
    const auth = {
        programManager: { programs: new Map([["owner", { identity: "owner", get permissions() { return permissions } }]]) },
        processManager: {
            processes: new Map([["caller", { program: "owner" }]]),
            listServices
        },
        grantsPermission: async (_pane: string, name: PermissionName, values: never[]) => permissionCatalog.allows(name, values, permissions)
    } as unknown as AuthManager
    const answer = host(auth, "caller", { state: () => { throw new Error("unused viewport") }, move: () => { throw new Error("unused viewport") } }, {} as never, () => "frame", clientFrame(), {} as never)

    await expect(answer("host-service-list")).resolves.toEqual([[]])
    await expect(answer("host-service-list", { name: "main" })).resolves.toEqual([[]])

    permissions = { services: ["main"] }

    await expect(answer("host-service-list")).resolves.toEqual([[mainServer, mainClient]])
    await expect(answer("host-service-list", { name: "main" })).resolves.toEqual([[mainServer, mainClient]])
    await expect(answer("host-service-list", { name: "background" })).resolves.toEqual([[]])
    await expect(answer("host-service-list", "main")).rejects.toThrow(/object/)

    permissions = { services: [] }

    await expect(answer("host-service-list")).resolves.toEqual([[mainServer, mainClient, background]])
})

function program(identity: string): ProgramSnapshot & { permissions: Permissions } {

    return {
        identity,
        reference: `${identity}-reference`,
        assetId: `${identity}-assets`,
        name: identity,
        version: "0.0.0",
        description: null,
        hasAgent: false,
        server: null,
        client: null,
        permissions: {}
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

test("Reading the Desktop view is open, and moving it requires desktopViewport", async () => {
    let permissions: Permissions = {}
    const auth = {
        programManager: { programs: new Map([["viewer", { identity: "viewer", get permissions() { return permissions } }]]) },
        processManager: { processes: new Map([["caller", { identity: "caller", program: "viewer" }]]) },
        grantsPermission: async (_pane: string, name: PermissionName, values: never[]) => permissionCatalog.allows(name, values, permissions)
    } as unknown as AuthManager
    const state = { size: { width: 1200, height: 800 }, offset: { x: 0, y: 0 } }
    const move = vi.fn()
    const answer = host(auth, "caller", { state: () => state, move }, {} as never, () => null, clientFrame(), {} as never)

    expect(await answer("desktopViewport")).toEqual([state])
    await expect(answer("moveDesktopViewport", { x: 1200, y: 0 })).rejects.toThrow("Execution is not permitted")
    expect(move).not.toHaveBeenCalled()

    permissions = { desktopViewport: [] }
    expect(await answer("moveDesktopViewport", { x: 1200, y: 0 })).toEqual([])
    expect(move).toHaveBeenCalledWith({ x: 1200, y: 0 })
    await expect(answer("moveDesktopViewport", { x: "far", y: 0 })).rejects.toThrow("finite x and y")
})

test("a Client reads what the System is from the System itself, when it started included", async () => {
    const about = Object.freeze({ name: "PhreshOS", version: "1.0.0", release: { name: "Sprout", program: "sprout" }, startedAt: new Date("2026-09-30T08:00:00.000Z") })
    const auth = { about: vi.fn(async () => about) } as unknown as AuthManager
    const answer = host(auth, "caller", { state: () => { throw new Error("unused viewport") }, move: () => { throw new Error("unused viewport") } }, {} as never, () => null, clientFrame(), {} as never)

    await expect(answer("about")).resolves.toEqual([about])
})

test("a Client reads the System's icon from the System itself", async () => {
    const bytes = [137, 80, 78, 71]
    const icon = vi.fn(async () => bytes)
    const auth = { icon } as unknown as AuthManager
    const answer = host(auth, "caller", { state: () => { throw new Error("unused viewport") }, move: () => { throw new Error("unused viewport") } }, {} as never, () => null, clientFrame(), {} as never)

    await expect(answer("system-icon", "large")).resolves.toEqual([bytes])
    expect(icon).toHaveBeenCalledWith("large")
})
