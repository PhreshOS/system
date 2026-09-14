import { expect, test, vi } from "vitest"
import ProgramManager from "@server/core/link-manager/auth-manager/program-manager/program-manager"
import type Program from "@server/core/link-manager/auth-manager/program-manager/program"

test("named replacement is Program-scoped, validated before exit, and serialized", async () => {
    const program = {
        identity: "example", reference: "reference", config: {}, title: "Example",
        server: null, client: { start: true }, async validate() {}
    } as unknown as Program
    const other = { ...program, identity: "other", reference: "other-reference" } as unknown as Program
    const processes = new Map<string, { identity: string; name: string | null; program: Program; launch: unknown }>()
    processes.set("old", { identity: "old", name: "editor", program, launch: {} })
    processes.set("unrelated", { identity: "unrelated", name: "editor", program: other, launch: {} })
    const events: string[] = []
    const exit = vi.fn(async (identity: string) => { await Promise.resolve(); events.push(`exit:${identity}`); processes.delete(identity) })
    const register = vi.fn(async (identity: string, name: string | null, owner: Program, _options: unknown, launch: unknown) => {
        events.push(`create:${identity}`)
        processes.set(identity, { identity, name, program: owner, launch })
    })
    const manager = Object.assign(Object.create(ProgramManager.prototype), {
        authManager: { processManager: { processes, exit, register } },
        creating: new Map(), changing: new Map(),
        reach: (identity: string) => identity === program.identity ? program : null,
        logsOf: () => ({}),
        $outbound: { async publish() {} }
    }) as ProgramManager

    await expect(manager.createProcess(program, { name: "editor" })).rejects.toThrow("already has a process")
    await expect(manager.createProcess(program, { name: "editor", replace: true, server: true })).rejects.toThrow("no server")
    expect(exit).not.toHaveBeenCalled()
    const [first, second] = await Promise.all([
        manager.createProcess(program, { name: "editor", replace: true }),
        manager.createProcess(program, { name: "editor", replace: true })
    ])
    expect(events).toEqual(["exit:old", `create:${first}`, `exit:${first}`, `create:${second}`])
    expect([...processes.keys()]).toEqual(["unrelated", second])
    const third = await manager.findOrCreateProcess(program, { name: "editor", replace: true })
    expect(processes.has(second)).toBe(false)
    expect(processes.has(third)).toBe(true)
})
