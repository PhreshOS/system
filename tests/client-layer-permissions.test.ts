import { expect, test, vi } from "vitest"
import type { Layer, PermissionName, Permissions, PermissionValue, ProgramSnapshot } from "@phreshos/core"
import type AuthManager from "@client/core/link-manager/auth-manager/auth-manager"
import ClientProcessBoundary from "@client/view/components/desktop-host/client-process-boundary"
import SystemAccess from "@client/view/components/desktop-host/system-access"
import host from "@client/view/components/desktop-host/host"
import { permissionCatalog } from "@server/core/permissions"

function fixture() {
    let permissions: Permissions = {}
    const program: ProgramSnapshot = {
        identity: "owner", reference: "program-reference", assetId: "assets", name: "Owner",
        version: "0.0.0", description: null, hasAgent: false, server: null,
        client: { sandbox: true, start: true, service: false, title: null, header: null, frame: null, transaction: null, size: null, position: null, layer: "over", minimize: null, maximize: null }
    }
    const process = { identity: "caller", reference: "process-reference", program: program.identity, name: null, startedAt: 0, options: {}, server: null, client: null }
    const createProcess = vi.fn(async () => process.identity)
    const findOrCreateProcess = vi.fn(async () => process.identity)
    const startup = vi.fn()
    const startEndpoint = vi.fn()
    const connections = [
        { identity: "desktop-connection", connected: true, session: "desktop-session" },
        { identity: "outside-connection", connected: true, session: "outside-session" }
    ]
    const sessions = [
        { identity: "desktop-session", valid: true },
        { identity: "outside-session", valid: true }
    ]
    const connection = vi.fn(async (operation: string, identity?: string) => {

        if (operation === "current") return connections[0]
        if (operation === "list") return connections
        if (operation === "find") return connections.find(value => value.identity === identity) ?? null
        if (operation === "session") return sessions.find(value => value.identity === connections.find(connection => connection.identity === identity)?.session) ?? null
        return connections.find(value => value.identity === identity) ?? null
    })
    const session = vi.fn(async (operation: string, identity?: string) => {

        if (operation === "list") return sessions
        if (operation === "find") return sessions.find(value => value.identity === identity) ?? null
        if (operation === "connections") return connections.filter(value => value.session === identity)
        return sessions.find(value => value.identity === identity) ?? null
    })
    const command = vi.fn(async function* () {})
    const auth = {
        programManager: { programs: new Map([[program.identity, program]]), createProcess, findOrCreateProcess, startup, command },
        processManager: { processes: new Map([[process.identity, process]]), startEndpoint, ownFrame: vi.fn(), releaseFrame: vi.fn() },
        connection, session,
        grantsPermission: async <Name extends PermissionName>(_pane: string, name: Name, values: readonly PermissionValue<Name>[]) => permissionCatalog.allows(name, values, permissions)
    } as unknown as AuthManager
    const answer = host(auth, process.identity, () => ({ size: { width: 100, height: 100 } }), () => "frame", {} as never)
    return {
        auth, program, process, answer, createProcess, findOrCreateProcess, startup, startEndpoint, command, connection,
        permissions(value: Permissions) { permissions = value }
    }
}

const restrictedLayers = ["under", "over", "wallpaper", "start-menu"] as const

test.each(restrictedLayers)("Client launch routes check %s before delegation", async layer => {
    const f = fixture()
    const program = { identity: f.program.identity, reference: f.program.reference }
    const process = { identity: f.process.identity, reference: f.process.reference }
    const launch = { name: "main", client: { layer } }
    const operations = [
        ["program-create-process", program, launch],
        ["program-find-or-create-process", program, launch],
        ["startup", program, "enable", launch],
        ["start-endpoint", process, "client", { layer }]
    ] as const
    const anotherLayer = restrictedLayers.find(candidate => candidate !== layer)!
    const deniedPermissions: Permissions[] = [{}, { programs: [] }, { layers: [anotherLayer] }, { all: [], layers: false }]
    for (const denied of deniedPermissions) {
        f.permissions(denied)
        for (const [operation, ...args] of operations) await expect(f.answer(operation, ...args)).rejects.toThrow("Execution is not permitted")
    }
    const delegates = [f.createProcess, f.findOrCreateProcess, f.startup, f.startEndpoint]
    for (const delegate of delegates) expect(delegate).not.toHaveBeenCalled()
    const grantedPermissions: Permissions[] = [{ layers: [layer] }, { layers: [] }, { all: [] }]
    for (const granted of grantedPermissions) {
        f.permissions(granted)
        for (const [operation, ...args] of operations) await f.answer(operation, ...args)
    }
    for (const delegate of delegates) expect(delegate).toHaveBeenCalledTimes(3)
})

test("Connection permissions define one opaque accessible scope", async () => {

    const f = fixture()

    await expect(f.answer("desktop-connection")).rejects.toThrow("Execution is not permitted")
    await expect(f.answer("host-connection-list")).resolves.toEqual([[]])
    await expect(f.answer("host-session-list")).resolves.toEqual([[]])
    await expect(f.answer("host-connection-find", "desktop-connection")).resolves.toEqual([null])
    await expect(f.answer("host-session-find", "desktop-session")).resolves.toEqual([null])
    await expect(f.answer("host-connection-state", "desktop-connection")).rejects.toThrow("Connection not found")
    await expect(f.answer("host-session-state", "desktop-session")).rejects.toThrow("Session not found")

    f.permissions({ desktopConnection: [] })

    await expect(f.answer("desktop-connection")).resolves.toEqual([expect.objectContaining({ identity: "desktop-connection" })])
    await expect(f.answer("host-connection-list")).resolves.toEqual([[expect.objectContaining({ identity: "desktop-connection" })]])
    await expect(f.answer("host-session-list")).resolves.toEqual([[expect.objectContaining({ identity: "desktop-session" })]])
    await expect(f.answer("host-connection-find", "outside-connection")).resolves.toEqual([null])
    await expect(f.answer("host-session-find", "outside-session")).resolves.toEqual([null])
    await expect(f.answer("host-session-connections", "desktop-session")).resolves.toEqual([[expect.objectContaining({ identity: "desktop-connection" })]])

    f.permissions({ connections: [] })

    await expect(f.answer("desktop-connection")).resolves.toEqual([expect.objectContaining({ identity: "desktop-connection" })])
    await expect(f.answer("host-connection-list")).resolves.toEqual([connectionsNamed("desktop-connection", "outside-connection")])
    await expect(f.answer("host-session-list")).resolves.toEqual([connectionsNamed("desktop-session", "outside-session")])
    expect(f.connection).toHaveBeenCalledWith("current")
})

function connectionsNamed(...identities: string[]) {

    return identities.map(identity => expect.objectContaining({ identity }))
}

test("Client layer authorization validates explicit choices without reinterpreting defaults", async () => {
    const f = fixture()
    const access = new SystemAccess(f.auth, f.process.identity)
    for (const launch of [{}, { client: true }, { client: false }, { client: { layer: "window" as Layer } }]) {
        expect(await access.launch(launch)).toEqual(launch)
    }
    expect(await access.clientLaunch()).toEqual({})
    await expect(access.launch({ client: { layer: "invalid" } })).rejects.toThrow("layer")
    await expect(access.clientLaunch(false)).rejects.toThrow("object")
    await f.answer("startup", null, "get")
    await f.answer("startup", null, "disable")
    await f.answer("start-endpoint", null, "server")
    await f.answer("program-create-process", null, {})
    expect(f.createProcess).toHaveBeenCalledOnce()
})

test.each(restrictedLayers)("Client run streams authorize %s before creating an iterator", async layer => {
    const f = fixture()
    const boundary = new ClientProcessBoundary(f.process.identity, { contentWindow: null } as HTMLIFrameElement, f.auth,
        () => ({ size: { width: 100, height: 100 } }), {} as never, { begin: vi.fn() } as never)
    const deliver = vi.spyOn(boundary, "deliver").mockResolvedValue()
    await boundary.own("frame")
    const program = { identity: f.program.identity, reference: f.program.reference }
    const launch = { client: { layer } }
    boundary.receive(["boundary", "expect", "denied"])
    boundary.receive(["end-host", "stream", "denied", "run", program, launch])
    await vi.waitFor(() => expect(deliver).toHaveBeenCalledWith("host-end", "stream", "denied", "answer", { success: false, error: "Execution is not permitted" }))
    expect(f.command).not.toHaveBeenCalled()
    f.permissions({ layers: [layer] })
    boundary.receive(["boundary", "expect", "allowed"])
    boundary.receive(["end-host", "stream", "allowed", "run", program, launch])
    await vi.waitFor(() => expect(deliver).toHaveBeenCalledWith("host-end", "stream", "allowed", "answer", { success: true, result: undefined }))
    expect(f.command).toHaveBeenCalledExactlyOnceWith(program, "run", launch, f.process.identity)
    await boundary.release()
})

test("the layer catalog uses exact assignments before all", () => {
    expect(permissionCatalog.declarations({ layers: true })).toEqual({ layers: [] })
    expect(permissionCatalog.allows("layers", ["over"], { layers: ["under"] })).toBe(false)
    expect(permissionCatalog.allows("layers", ["under"], { layers: ["under"] })).toBe(true)
    expect(permissionCatalog.allows("layers", ["under", "over"], { layers: [] })).toBe(true)
    expect(permissionCatalog.allows("layers", ["wallpaper"], { layers: [] })).toBe(true)
    expect(permissionCatalog.allows("layers", ["start-menu"], { layers: [] })).toBe(true)
    expect(permissionCatalog.allows("layers", ["over"], { all: [], layers: false })).toBe(false)
    expect(permissionCatalog.allows("layers", ["over"], { all: [] })).toBe(true)
    expect(() => permissionCatalog.declarations({ layers: false })).toThrow()
    expect(() => permissionCatalog.resolve("layers", ["window"])).toThrow()
})
