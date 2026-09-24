import assert from "node:assert/strict"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { TheLink } from "@the-link/core"
import Program from "@server/core/link-manager/auth-manager/program-manager/program"
import Process from "@server/core/link-manager/auth-manager/process-manager/process"
import ProcessManager from "@server/core/link-manager/auth-manager/process-manager/process-manager"
import Window from "@server/core/link-manager/auth-manager/process-manager/window"
import type HostTraffic from "@server/core/link-manager/auth-manager/process-manager/host-traffic"
import ProgramStateStorage from "@server/core/link-manager/auth-manager/program-manager/state"
import PermissionManager from "@server/core/permission-manager"
import { test } from "vitest"

test("permission request lifecycle belongs to one live Endpoint", async () => {
    const temporary = mkdtempSync(join(tmpdir(), "phresh-permission-requests-"))

    try {
        const program = new Program({ identity: "example", storage: temporary, client: { location: "." } })
        const window = new Window()
        window.start({ title: "Client", header: true, layer: "window" }, { x: 0, y: 0 }, { width: 640, height: 480 }, 1, false)
        const process = new Process("process", "main", program, {}, { server: null, client: null, options: {} }, null, {} as HostTraffic, window)
        process.startClient(false)

        const hostEvents: unknown[][] = []
        const programManager = {
            async setPermission(target: Program, name: string, permission: unknown) {
                new ProgramStateStorage(target).setPermission(name as never, permission as never)
            }
        }
        const processManager = {
            async announceHost(...values: unknown[]) { hostEvents.push(values) },
            async announceSubject(...values: unknown[]) { hostEvents.push(values) }
        }
        const authManager = Object.assign(new TheLink(), { programManager, processManager })
        const manager = new PermissionManager(authManager as never)

        const request = (identity: string, timeout = 10_000) => manager.request(
            process,
            "client",
            identity,
            "services",
            ["browser"],
            timeout
        )

        const allowed = request("allow")
        const snapshot = manager.requests()[0]
        assert.equal(snapshot.identity, "allow")
        assert.equal(snapshot.from.kind, "client")
        assert.equal(snapshot.from.process.identity, process.identity)
        assert.equal(snapshot.from.process.program.identity, program.identity)
        assert.deepEqual(snapshot.scope, ["browser"])
        assert.equal(snapshot.expiresAt.getTime() - snapshot.createdAt.getTime(), 10_000)
        assert(manager.pending("allow"))
        await manager.allow("allow")
        assert.deepEqual(await allowed, ["browser"])
        assert.deepEqual(new ProgramStateStorage(program).permissions(), { services: ["browser"] })
        assert(!manager.pending("allow"))
        await assert.rejects(manager.allow("allow"), /does not exist/)

        const denied = request("deny")
        await manager.deny("deny")
        assert.equal(await denied, false)
        assert.deepEqual(new ProgramStateStorage(program).permissions(), { services: false })

        const cancelled = request("cancel")
        await manager.cancel("cancel")
        assert.equal(await cancelled, null)
        assert.deepEqual(new ProgramStateStorage(program).permissions(), { services: false })

        const expired = request("timeout", 5)
        assert.equal(await expired, null)
        assert(!manager.pending("timeout"))

        const raced = request("race")
        const decisions = await Promise.allSettled([manager.allow("race"), manager.deny("race")])
        assert.equal(decisions.filter(result => result.status === "fulfilled").length, 1)
        assert.equal(decisions.filter(result => result.status === "rejected").length, 1)
        assert.deepEqual(await raced, ["browser"])
        assert.deepEqual(new ProgramStateStorage(program).permissions(), { services: ["browser"] })

        const stopped = request("endpoint-stop")
        process.stopClient()
        assert.equal(await stopped, null)
        assert(!manager.pending("endpoint-stop"))

        assert(hostEvents.some(values => values[0] === "permission" && values[1] === "request"))
        assert(hostEvents.some(values => values[0] === "permission" && values[1] === "resolve"))
    }
    finally {
        rmSync(temporary, { recursive: true, force: true })
    }
}, 120_000)

test("an exact effective assignment creates no pending request", async () => {
    const temporary = mkdtempSync(join(tmpdir(), "phresh-permission-exact-"))

    try {
        const program = new Program({ identity: "example", storage: temporary, client: { location: "." } })
        const window = new Window()
        window.start({ title: "Client", header: true, layer: "window" }, { x: 0, y: 0 }, { width: 640, height: 480 }, 1, false)
        const process = new Process("process", null, program, {}, { server: null, client: null, options: {} }, null, {} as HostTraffic, window)
        process.startClient(false)

        const pending: unknown[][] = []
        const authManager = {
            programManager: { permission: () => ["browser"] },
            permissionManager: {
                request(...values: unknown[]) {
                    pending.push(values)
                    return Promise.resolve(["browser"])
                }
            }
        }
        const manager = Object.assign(Object.create(ProcessManager.prototype), {
            authManager,
            processes: new Map([[process.identity, process]])
        }) as ProcessManager

        await assert.rejects(manager.requestPermission(
            process.identity,
            "client",
            "invalid-timeout",
            "services",
            ["browser"],
            Number.MAX_VALUE
        ), /expiration is invalid/)

        await assert.doesNotReject(manager.requestPermission(
            process.identity,
            "client",
            "exact",
            "services",
            ["browser"],
            undefined
        ))
        assert.equal(pending.length, 0)

        await manager.requestPermission(
            process.identity,
            "client",
            "different",
            "services",
            ["editor"],
            1_000
        )
        assert.equal(pending.length, 1)
        assert.equal(pending[0]?.at(-1), 1_000)

        await manager.requestPermission(
            process.identity,
            "client",
            "default",
            "services",
            ["editor"],
            undefined
        )
        assert.equal(pending.at(-1)?.at(-1), 120_000)
    }
    finally {
        rmSync(temporary, { recursive: true, force: true })
    }
})
