import { expect, test, vi } from "vitest"
import Program from "@client/core/link-manager/auth-manager/program-manager/program"
import type ProgramManager from "@client/core/link-manager/auth-manager/program-manager/program-manager"
import RuntimeProgram from "@server/core/link-manager/auth-manager/program-manager/program"
import Entry from "@server/core/link-manager/auth-manager/program-manager/entry"

test("opening a Program reads saved intent while direct creation uses its explicit request", async () => {
    const intent = { options: { document: "icon.txt" }, client: { layer: "over" } }
    const launch = vi.fn().mockResolvedValue(intent)
    const publish = vi.fn()
    const manager = { launch, $outbound: { publish } } as unknown as ProgramManager
    const record = new Entry(new RuntimeProgram({ identity: "example", client: { location: "." } })).record()
    const program = new Program(manager, record)
    const address = { identity: record.identity, reference: record.reference }

    await program.open()
    expect(launch).toHaveBeenCalledExactlyOnceWith(address, "get")
    expect(publish).toHaveBeenLastCalledWith("/create-process", address, intent)
    await program.createProcess()
    expect(launch).toHaveBeenCalledOnce()
    expect(publish).toHaveBeenLastCalledWith("/create-process", address, {})
    launch.mockResolvedValueOnce(null)
    await program.open()
    expect(publish).toHaveBeenLastCalledWith("/create-process", address, {})
    launch.mockRejectedValueOnce(new Error("invalid stored launch"))
    await expect(program.open()).rejects.toThrow("invalid stored launch")
    expect(publish).toHaveBeenCalledTimes(3)
})
