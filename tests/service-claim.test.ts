import { TheLink } from "@the-link/core"
import { expect, test, vi } from "vitest"
import type AuthManager from "@server/core/link-manager/auth-manager/auth-manager"
import Program from "@server/core/link-manager/auth-manager/program-manager/program"
import ProcessManager from "@server/core/link-manager/auth-manager/process-manager/process-manager"
import type Process from "@server/core/link-manager/auth-manager/process-manager/process"
import type ServerProcessBoundary from "@server/core/link-manager/auth-manager/process-manager/server-process-boundary"

test("a Service name is taken from whoever holds it: its whole Process ends", async () => {
    const manager = new ProcessManager(new TheLink() as unknown as AuthManager)
    const launch = { server: null, client: null, options: {} } as const
    const start = (identity: string, owner: Program) => manager.register(identity, null, owner, {}, launch, null, false, null, null)
    const holding = (process: Process, service: string | false) => { process.server = { service, ready: true } as unknown as ServerProcessBoundary }
    const files = await start("files-picker", new Program({ identity: "files", server: { location: ".", command: "true" } }))
    const other = await start("other-picker", new Program({ identity: "other", server: { location: ".", command: "true" } }))
    holding(files, "file-picker-v1")
    const ended = vi.spyOn(manager as unknown as { exitProcess(identity: string, whenGone: string): Promise<string> }, "exitProcess").mockResolvedValue("")
    const claim = (process: Process, service: string | false) => (manager as unknown as { claimService(process: Process, service: string | false): Promise<void> }).claimService(process, service)

    await claim(other, "file-picker-v1")
    expect(ended).toHaveBeenCalledExactlyOnceWith("files-picker", "complete")

    // Its own name, a free name, or no name: nothing ends.
    ended.mockClear()
    await claim(files, "file-picker-v1")
    await claim(other, "board-canvas-v1")
    await claim(other, false)
    expect(ended).not.toHaveBeenCalled()
})
