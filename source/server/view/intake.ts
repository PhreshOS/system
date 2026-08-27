import Application from "@server/core/application"
import { type Socket } from "node:net"
import localServer from "./local-server"

/**
 * Owner-local intake for one Program project.
 *
 * Its closed vocabulary is install, uninstall, and attached run. General
 * System control uses a separate boundary. An attached Process lives exactly
 * as long as this connection; installed Programs are persistent.
 *
 * Authorization belongs to `localServer`: a mode-0600 POSIX socket or an
 * owner-only Windows named pipe, scoped by the System storage root.
 */
export default function intake(application: Application, path: string) {

    // A message is a line. The first version had no framing at all — a
    // question was whatever arrived before the asker closed its own side
    // — which is elegant and needs half-close to work, and bun's `net`
    // does not half-close: `end(data)` there closes the socket, so the
    // answer was written into nothing. A line costs one delimiter and
    // depends on no runtime agreeing about anything.
    return localServer(path, function (socket) {

        let said = ""

        // What this connection launched, ended when it goes.
        const attached = new Set<string>()

        socket.on("data", function (chunk) {

            said += String(chunk)

            const lines = said.split("\n")

            said = lines.pop() ?? ""

            for (const line of lines) if (line.trim()) reply(application, socket, attached, line)
        })

        // Both directions of the tether meet here. The asker going is
        // what ends the process; the process ending is what ends the
        // socket, and either arriving first makes the other a no-op.
        socket.on("close", function () {

            for (const identity of attached) {

                application.linkManager.authManager.processManager.exit(identity).catch(() => undefined)
            }

            attached.clear()
        })

        socket.on("error", () => undefined)
    })
}

// One question in, many events out. A launch is not a thing with an
// answer — it is a thing with a beginning, a middle of whatever the
// program says, and an end.
function reply(application: Application, socket: Socket, attached: Set<string>, line: string) {

    const say = (event: Record<string, unknown>) => { if (socket.writable) socket.write(JSON.stringify(event) + "\n") }

    const done = () => socket.end()

    const alive = () => !socket.destroyed

    answer(application, attached, say, done, alive, line).catch((error: Error) => {

        say({ event: "error", message: error.message })

        done()
    })
}

async function answer(application: Application, attached: Set<string>, say: (event: Record<string, unknown>) => void, done: () => void, alive: () => boolean, said: string) {

    let asked: Asked

    try { asked = JSON.parse(said) as Asked }

    catch { throw new Error("What arrived is not JSON") }

    // Direct launch and installation both enter the same runtime registry
    // under the Program's declared identity. Installation sets its installed
    // flag; launch atomically forgets the prior runtime occupant, if any, and
    // tethers the resulting uninstalled Program to its root process.
    const programManager = application.linkManager.authManager.programManager

    if (asked.word === "uninstall") {

        if (typeof asked.identity !== "string" || !asked.identity) throw new Error("Uninstalling needs a Program identity")

        if (asked.everything !== undefined && typeof asked.everything !== "boolean") throw new Error("Uninstalling everything must be true or false")

        for await (const chunk of programManager.uninstallInstalledStreaming(asked.identity, asked.everything === true)) {

            say({ event: "output", ...chunk })
        }

        say({ event: "uninstalled", identity: asked.identity, everything: asked.everything === true })

        return done()
    }

    // Laid out: a description, and only ever a description.
    //
    // The system does not know what an archive is. A package carries a
    // Program to this machine, so the CLI that acquired it verifies and opens
    // it. Intake receives the same concrete description whether its source
    // was an official package or the local project beside the caller. From
    // here onward the System alone validates, lays out, and launches it.
    if (asked.word === "install") {

        if (!asked.program) throw new Error("Installing needs a program description")

        if (asked.run !== undefined && typeof asked.run !== "boolean") throw new Error("Running after installation must be true or false")

        if (asked.startup !== undefined && typeof asked.startup !== "boolean") throw new Error("Enabling startup during installation must be true or false")

        for await (const stage of programManager.installSource(asked.program, { run: asked.run, startup: asked.startup })) {

            if (stage.stage === "output") say({ event: "output", ...stage.chunk })

            else if (stage.stage === "installed") {

                // Whether it replaced one. Installation has already ended every
                // process that could have retained one of the previous paths.
                say({ event: "installed", replaced: stage.replaced, program: { identity: stage.entry.identity, name: stage.entry.program.name, version: stage.entry.program.config.version ?? null } })
            }

            else if (stage.stage === "startup-enabled") say({ event: "startupEnabled" })

            else say({ event: "running", process: stage.process })
        }

        return done()
    }

    if (asked.word !== "run") throw new Error(`This machine's intake does not know the word "${String(asked.word)}"`)

    if (!asked.program) throw new Error("Running needs a program description")

    let identity: string | null = null

    let ended = false

    identity = await programManager.launchAttached(asked.program, asked.options ?? {}, {

        output: (stream, text) => say({ event: "output", stream, text }),

        exited: function (code, signal) {

            ended = true

            if (identity) attached.delete(identity)

            say({ event: "exited", code, signal })

            // Nothing more will be said on this connection: one question
            // per connection, and its subject has ended.
            done()
        }
    })

    // A child may end before launch finishes announcing its creation, and
    // the launcher may itself disappear during that same interval. Neither
    // event may leave a process attached to a connection that is already
    // finished.
    if (ended) return

    if (!alive()) {

        if (application.linkManager.authManager.processManager.processes.has(identity)) await application.linkManager.authManager.processManager.exit(identity)

        return
    }

    attached.add(identity)

    say({ event: "started", process: identity })
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
