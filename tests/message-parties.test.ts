import { TheLink } from "@the-link/core"
import { expect, test, vi } from "vitest"
import type AuthManager from "@server/core/link-manager/auth-manager/auth-manager"
import Program from "@server/core/link-manager/auth-manager/program-manager/program"
import ProcessManager from "@server/core/link-manager/auth-manager/process-manager/process-manager"
import type ProcessTraffic from "@server/core/link-manager/auth-manager/process-manager/process-traffic"

type Internals = {
    traffic: ProcessTraffic
    deliver(identity: string, half: "server" | "client", values: unknown[]): Promise<void>
    publish(source: string, sourceHalf: "server" | "client", target: string, targetHalf: "server" | "client", values: unknown[]): Promise<void>
    returnAnswer(answerer: unknown, values: unknown[]): boolean
    outsideQuestions: { answer(question: string, outcome: unknown): void }
}

test("a message carries who sent it and where it went as public values, the same for every receiver and observer", async () => {
    // No Program may see another: the values arrive all the same, and never as handles.
    const authManager = new TheLink() as unknown as AuthManager
    Object.assign(authManager, { programManager: { grantsPermission: () => false } })
    const manager = new ProcessManager(authManager)
    const internals = manager as unknown as Internals
    const launch = { server: null, client: null, options: {} } as const
    const board = new Program({ identity: "board", name: "Board", server: { location: ".", command: "true" } })
    const files = new Program({ identity: "files", server: { location: ".", command: "true" } })
    const window = await manager.register("board-window", null, board, {}, launch, null, false, null, null)
    const picker = await manager.register("picker", null, files, {}, launch, null, false, null, null)

    const delivered = vi.spyOn(internals, "deliver").mockResolvedValue(undefined)
    const observed: unknown[] = []
    internals.traffic.observe(window.reference, "client", "publish", null, (_event, ...values) => observed.push(...values))

    await internals.publish(window.identity, "client", picker.identity, "server", ["changed", 1])

    expect(delivered).toHaveBeenCalledWith(picker.identity, "server", ["changed", {
        from: { program: { identity: "board", name: "Board" }, process: "board-window", endpoint: "client" },
        payload: 1
    }])
    // A Program that names nothing is read by its identity.
    expect(observed).toEqual([{ to: { program: { identity: "files", name: "files" }, process: "picker", endpoint: "server" }, payload: 1 }])
})

test("an answer is observed whoever asked: where it went, or null when a script outside every Program asked", async () => {
    const authManager = new TheLink() as unknown as AuthManager
    Object.assign(authManager, { programManager: { grantsPermission: () => false } })
    const manager = new ProcessManager(authManager)
    const internals = manager as unknown as Internals
    const launch = { server: null, client: null, options: {} } as const
    const board = new Program({ identity: "board", name: "Board", server: { location: ".", command: "true" } })
    const files = new Program({ identity: "files", name: "Files", server: { location: ".", command: "true" } })
    const window = await manager.register("board-window", null, board, {}, launch, null, false, null, null)
    const picker = await manager.register("picker", null, files, {}, launch, null, false, null, null)
    vi.spyOn(internals, "deliver").mockResolvedValue(undefined)
    const answered = vi.spyOn(internals.outsideQuestions, "answer").mockImplementation(() => undefined)
    const observed: unknown[] = []
    internals.traffic.observe(picker.reference, "server", "answer", null, (event, ...values) => observed.push([event, ...values]))
    const outcome = { success: true, result: null }

    internals.returnAnswer(picker, ["answer", `client:${window.identity}`, "question-1", "open", outcome])
    internals.returnAnswer(picker, ["answer", "outside:script-question", "question-2", "access", outcome])

    expect(observed).toEqual([
        ["open", "question-1", { to: { program: { identity: "board", name: "Board" }, process: "board-window", endpoint: "client" }, outcome }],
        ["access", "question-2", { to: null, outcome }]
    ])
    // The script still receives its answer.
    expect(answered).toHaveBeenCalledWith("outside:script-question", outcome)
})
