import { expect, test, vi } from "vitest"
import Program from "@client/core/link-manager/auth-manager/program-manager/program"
import type ProgramManager from "@client/core/link-manager/auth-manager/program-manager/program-manager"
import RuntimeProgram from "@server/core/link-manager/auth-manager/program-manager/program"
import Entry from "@server/core/link-manager/auth-manager/program-manager/entry"

test("opening a Program uses Endpoint defaults while direct creation keeps its explicit request", async () => {
    const publish = vi.fn()
    const manager = { $outbound: { publish } } as unknown as ProgramManager
    const record = new Entry(new RuntimeProgram({ identity: "example", client: { location: "." } })).record()
    const program = new Program(manager, record)
    const address = { identity: record.identity, reference: record.reference }

    await program.open()
    expect(publish).toHaveBeenLastCalledWith("/create-process", address, {})
    await program.createProcess({ options: { document: "explicit.txt" } })
    expect(publish).toHaveBeenLastCalledWith("/create-process", address, { options: { document: "explicit.txt" } })
    await program.open()
    expect(publish).toHaveBeenLastCalledWith("/create-process", address, {})
    expect(publish).toHaveBeenCalledTimes(3)
})
