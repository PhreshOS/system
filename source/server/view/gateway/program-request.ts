import type Application from "@server/core/application"
import type Process from "@server/core/link-manager/auth-manager/process-manager/process"
import type { Socket } from "node:net"

/** Execute a streamed owner-local Program lifecycle request. */
export default async function programRequest(application: Application, socket: Socket, value: unknown) {

    if (!record(value)) throw new Error("The Program request must be an object")

    const asked = value as Asked
    const attached = new Set<string>()
    const say = (event: Record<string, unknown>) => {

        if (socket.writable) socket.write(`${JSON.stringify(event)}\n`)
    }
    const done = () => socket.end()

    socket.on("close", function () {

        for (const identity of attached) {

            const process = application.system.findProcess(identity)

            if (process) application.system.exitProcess(process).catch(() => undefined)
        }

        attached.clear()
    })

    const system = application.system

    if (asked.word === "create") {

        if (!asked.program) throw new Error("Creating needs a Program definition")

        const program = await system.createProgram(asked.program)
        const entry = system.requireProgram(program.identity)

        say({ event: "created", program: system.programSnapshot(entry) })
        return done()
    }

    if (asked.word === "force-create") {

        if (!asked.program) throw new Error("Creating needs a Program definition")

        const program = await system.forceCreateProgram(asked.program)
        const entry = system.requireProgram(program.identity)

        say({ event: "created", program: system.programSnapshot(entry) })
        return done()
    }

    if (asked.word === "run-process") {

        const program = system.holdProgram(asked.handle)
        let identity: string | null = null
        let ended = false
        let processRecord: ReturnType<Process["record"]> | null = null

        identity = await system.runProcess(program, asked.launch ?? {}, {
            started: process => {

                processRecord = process.record()
                attached.add(process.identity)
                say({ event: "started", process: system.processSnapshot(process) })
            },
            output: (stream, text) => say({ event: "output", stream: stream === "err" ? "stderr" : "stdout", text }),
            exited: function (code, signal) {

                ended = true
                if (identity) attached.delete(identity)
                say({
                    event: "exited",
                    process: processRecord,
                    exit: { status: signal ? "signaled" : "exited", code, signal }
                })
                done()
            }
        })

        if (ended) return

        if (socket.destroyed) {

            const process = system.findProcess(identity)

            if (process) await system.exitProcess(process)

            return
        }
        return
    }

    if (asked.word === "installed") {

        const program = system.holdProgram(asked.handle)
        const entry = system.findProgram(program.identity)

        say({ event: "installedState", installed: entry?.installed === true })
        return done()
    }

    if (asked.word === "startup") {

        const program = system.holdProgram(asked.handle)
        const operation = asked.operation

        if (operation !== "get" && operation !== "enable" && operation !== "disable") throw new Error("Startup must be read, enabled, or disabled")

        const launch = await system.programStartup(program, operation, asked.launch)

        say({ event: "startup", launch })
        return done()
    }

    if (asked.word === "create-process") {

        const program = system.holdProgram(asked.handle)
        const identity = await system.createProcess(program, asked.launch ?? {})
        const process = system.findProcess(identity)

        if (!process) throw new Error("The created Process no longer exists")

        say({ event: "createdProcess", process: system.processSnapshot(process) })
        return done()
    }

    if (asked.word === "find-or-create-process") {

        const program = system.holdProgram(asked.handle)
        const identity = await system.findOrCreateProcess(program, asked.launch as NonNullable<Asked["launch"]> & { name: string })
        const process = system.findProcess(identity)

        if (!process) throw new Error("The created Process no longer exists")

        say({ event: "createdProcess", process: system.processSnapshot(process) })
        return done()
    }

    if (asked.word === "forget") {

        const program = system.holdProgram(asked.handle)

        await system.forgetProgram(program)

        say({ event: "forgotten", identity: program.identity })
        return done()
    }

    if (asked.word === "install-existing") {

        const program = system.holdProgram(asked.handle)

        for await (const chunk of system.installProgram(program)) say({ event: "output", ...chunk })

        say({ event: "installed", identity: program.identity })
        return done()
    }

    if (asked.word === "uninstall-existing") {

        const program = system.holdProgram(asked.handle)

        for await (const chunk of system.uninstallProgram(program, asked.everything === true)) say({ event: "output", ...chunk })

        say({ event: "uninstalled", identity: program.identity, everything: asked.everything === true })
        return done()
    }

    throw new Error(`The Program transport does not know the word "${String(asked.word)}"`)
}

function record(value: unknown): value is Record<string, unknown> {

    return typeof value === "object" && value !== null && !Array.isArray(value)
}

interface Asked {

    word?: string
    everything?: boolean
    handle?: unknown
    operation?: string
    launch?: Parameters<Application["system"]["runProcess"]>[1]
    program?: Parameters<Application["system"]["forceCreateProgram"]>[0]
}
