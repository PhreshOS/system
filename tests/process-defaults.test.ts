import { expect, test, vi } from "vitest"
import ProgramManager from "@server/core/link-manager/auth-manager/program-manager/program-manager"
import type Program from "@server/core/link-manager/auth-manager/program-manager/program"

type Kept = { identity: string; name: string | null; program: Program; options: unknown }

function managerFor(process: unknown) {
    const program = {
        identity: "session-program", reference: "reference", config: { process }, title: "Session",
        server: null, client: { start: true }, async validate() {}
    } as unknown as Program
    const processes = new Map<string, Kept>()
    const exit = vi.fn(async (identity: string) => { processes.delete(identity) })
    const register = vi.fn(async (identity: string, name: string | null, owner: Program, options: unknown) => {
        processes.set(identity, { identity, name, program: owner, options })
    })
    const manager = Object.assign(Object.create(ProgramManager.prototype), {
        authManager: { processManager: { processes, exit, register } },
        creating: new Map(), changing: new Map(),
        reach: (identity: string) => identity === program.identity ? program : null,
        logsOf: () => ({}),
        $outbound: { async publish() {} }
    }) as ProgramManager
    return { manager, program, processes, exit }
}

test("a launch that names no Process takes the definition's name, and a second one fails while it runs", async () => {
    const { manager, program, processes } = managerFor({ name: "session" })

    const first = await manager.createProcess(program, {})
    expect(processes.get(first)?.name).toBe("session")
    await expect(manager.createProcess(program, {})).rejects.toThrow("already has a process")
})

test("with replacement in the definition, every launch replaces the one running", async () => {
    const { manager, program, processes, exit } = managerFor({ name: "session", replace: true })

    const first = await manager.createProcess(program, {})
    const second = await manager.createProcess(program, {})

    expect(exit).toHaveBeenCalledWith(first)
    expect([...processes.keys()]).toEqual([second])
})

test("a launch's own name and replacement win over the definition's", async () => {
    const { manager, program, processes } = managerFor({ name: "session", replace: true })

    await manager.createProcess(program, {})
    const named = await manager.createProcess(program, { name: "other", replace: false })

    expect([...processes.values()].map(process => process.name).sort()).toEqual(["other", "session"])
    expect(processes.get(named)?.name).toBe("other")
})

test("a launch's options lie over the definition's, key by key", async () => {
    const { manager, program, processes } = managerFor({ options: { mode: "watch", theme: "night" } })

    const identity = await manager.createProcess(program, { options: { theme: "day" } })

    expect(processes.get(identity)?.options).toEqual({ mode: "watch", theme: "day" })
})
