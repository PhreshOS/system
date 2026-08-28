import type Application from "@server/core/application"
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

            application.linkManager.authManager.processManager.exit(identity).catch(() => undefined)
        }

        attached.clear()
    })

    const programManager = application.linkManager.authManager.programManager

    if (asked.word === "create") {

        if (!asked.program) throw new Error("Creating needs a Program description")

        const program = await programManager.create(asked.program)

        say({ event: "created", identity: program.identity })
        return done()
    }

    if (asked.word === "installed") {

        if (typeof asked.identity !== "string" || !asked.identity) throw new Error("Reading installation needs a Program identity")

        const entry = programManager.programs.get(asked.identity)

        say({ event: "installedState", installed: entry?.installed === true })
        return done()
    }

    if (asked.word === "forget") {

        if (typeof asked.identity !== "string" || !asked.identity) throw new Error("Forgetting needs a Program identity")

        await programManager.forgetNamed(asked.identity)

        say({ event: "forgotten", identity: asked.identity })
        return done()
    }

    if (asked.word === "install-existing") {

        if (typeof asked.identity !== "string" || !asked.identity) throw new Error("Installing needs a Program identity")

        const entry = programManager.programs.get(asked.identity)

        if (!entry) throw new Error(`Unknown Program "${asked.identity}"`)

        for await (const chunk of programManager.installStreaming(entry.program)) say({ event: "output", ...chunk })

        say({ event: "installed", identity: asked.identity })
        return done()
    }

    if (asked.word === "uninstall-existing") {

        if (typeof asked.identity !== "string" || !asked.identity) throw new Error("Uninstalling needs a Program identity")

        const entry = programManager.programs.get(asked.identity)

        if (!entry) throw new Error(`Unknown Program "${asked.identity}"`)

        for await (const chunk of programManager.uninstallStreaming(entry.program, asked.everything === true)) say({ event: "output", ...chunk })

        say({ event: "uninstalled", identity: asked.identity, everything: asked.everything === true })
        return done()
    }

    if (asked.word === "uninstall") {

        if (typeof asked.identity !== "string" || !asked.identity) throw new Error("Uninstalling needs a Program identity")
        if (asked.everything !== undefined && typeof asked.everything !== "boolean") throw new Error("Uninstalling everything must be true or false")

        for await (const chunk of programManager.uninstallInstalledStreaming(asked.identity, asked.everything === true)) {

            say({ event: "output", ...chunk })
        }

        say({ event: "uninstalled", identity: asked.identity, everything: asked.everything === true })
        return done()
    }

    if (asked.word === "install") {

        if (!asked.program) throw new Error("Installing needs a Program description")
        if (asked.run !== undefined && typeof asked.run !== "boolean") throw new Error("Running after installation must be true or false")
        if (asked.startup !== undefined && typeof asked.startup !== "boolean") throw new Error("Enabling startup during installation must be true or false")

        for await (const stage of programManager.installSource(asked.program, { run: asked.run, startup: asked.startup })) {

            if (stage.stage === "output") say({ event: "output", ...stage.chunk })
            else if (stage.stage === "installed") say({
                event: "installed",
                replaced: stage.replaced,
                program: {
                    identity: stage.entry.identity,
                    name: stage.entry.program.name,
                    version: stage.entry.program.config.version ?? null
                }
            })
            else if (stage.stage === "startup-enabled") say({ event: "startupEnabled" })
            else say({ event: "running", process: stage.process })
        }

        return done()
    }

    if (asked.word !== "run") throw new Error(`The Program gateway does not know the word "${String(asked.word)}"`)
    if (!asked.program) throw new Error("Running needs a Program description")

    let identity: string | null = null
    let ended = false

    identity = await programManager.launchAttached(asked.program, asked.options ?? {}, {
        output: (stream, text) => say({ event: "output", stream, text }),
        exited: function (code, signal) {

            ended = true
            if (identity) attached.delete(identity)
            say({ event: "exited", code, signal })
            done()
        }
    })

    if (ended) return

    if (socket.destroyed) {

        if (application.linkManager.authManager.processManager.processes.has(identity)) {
            await application.linkManager.authManager.processManager.exit(identity)
        }

        return
    }

    attached.add(identity)
    say({ event: "started", process: identity })
}

function record(value: unknown): value is Record<string, unknown> {

    return typeof value === "object" && value !== null && !Array.isArray(value)
}

interface Asked {

    word?: string
    identity?: string
    everything?: boolean
    run?: boolean
    startup?: boolean
    program?: Parameters<Application["linkManager"]["authManager"]["programManager"]["launchAttached"]>[0]
    options?: Record<string, string>
}
