import { chmodSync, mkdirSync, rmSync } from "node:fs"
import Application from "@server/core/application"
import { connect, createServer, type Socket } from "node:net"
import { dirname } from "node:path"

/**
 * The local program intake: programs entering from this machine.
 *
 * One narrow local interface beside the web view a person lives in. The
 * two views are the two audiences, and this one accepts exactly one subject:
 * the Program a local project declares: attached, installed, or uninstalled.
 *
 * It was called *control* while it had two words and no stated limit,
 * and the name invited every next word: anything about the machine could
 * be called controlling it, so the surface had no edge. The role is
 * named instead. The boundary is the lifecycle of one locally identified
 * Program project: laid out, run attached, or removed from its installed
 * place. Words about arbitrary Processes, Windows, stores, or application
 * state remain outside it because this is not the machine's control panel.
 *
 * The link is how a person somewhere else reaches the system, and it has
 * to prove who it is because it arrived over a network. This is how a
 * local project standing on the same machine reaches it, and it is already
 * proven by being able to open the socket.
 *
 * **That is the whole authorization model, and it is the operating
 * system's rather than ours.** The socket is a filesystem entry at mode
 * 0600, so only the account that owns this machine may speak here — and
 * that account is exactly who may run programs on it. Nothing is checked
 * in this file because there is nothing left to check.
 *
 * A port would have had the opposite property. Every process on the
 * machine can reach a port, a browser page can `fetch` one, and stopping
 * that means inventing a token — a mechanism the transport made
 * necessary rather than one anything needed.
 *
 * On POSIX, the socket file's 0600 mode is the authorization. On Windows,
 * the equivalent address is a named pipe created without `readableAll` or
 * `writableAll`. Windows grants the creator owner full control while other
 * accounts do not receive the duplex access required by this protocol. The
 * pipe name is derived from the storage root so users and isolated instances
 * do not collide in Windows' machine-wide pipe namespace.
 *
 * **One system per storage root.** The socket lives in the root, so it
 * follows wherever the root is — which is how the lab runs a throwaway
 * system beside a real one, by moving `HOME`. Two systems sharing a root
 * were already colliding over its persistent state and its programs before this
 * existed; the socket is where that finally gets said out loud.
 *
 * **Three words, and the list is closed.** `install` lays a Program out,
 * `uninstall` removes that same project's installed form, and `run` starts it
 * attached. None was ever a session's business —
 * install had a button on the desktop until it was noticed that a person
 * at a browser somewhere else installing software onto this machine is
 * exactly what the remote and local split says should not happen.
 *
 * What is refused is inheriting a vocabulary wholesale: running The Link
 * over this would hand intake the whole remote surface, and the two views
 * do not have the same trust to spend. Nor does a word earn a
 * place here by being about the machine — that test admits everything.
 * It earns one by being a way the local project enters the system, and
 * nothing else is.
 *
 * **The connection is the lifetime.** A program launched here is attached
 * to the connection that asked for it: when that connection goes, the
 * process is stopped. Not a pid, not a heartbeat, not a timeout — the
 * operating system closes an ended process's descriptors whatever killed
 * it, so a terminal closed, an ssh session dropped and a `kill -9` all
 * arrive here as the same event, and none of them can be missed.
 *
 * That makes a launched program's life its launcher's, which is the line
 * between the two ways in: **attached means not installed, installed
 * means persistent.** Something meant to outlive a terminal is installed.
 */
export default function intake(application: Application, path: string) {

    const namedPipe = process.platform === "win32"

    // A message is a line. The first version had no framing at all — a
    // question was whatever arrived before the asker closed its own side
    // — which is elegant and needs half-close to work, and bun's `net`
    // does not half-close: `end(data)` there closes the socket, so the
    // answer was written into nothing. A line costs one delimiter and
    // depends on no runtime agreeing about anything.
    const server = createServer(function (socket) {

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

                application.linkManager.authManager.processManager.stop(identity).catch(() => undefined)
            }

            attached.clear()
        })

        socket.on("error", () => undefined)
    })

    if (!namedPipe) mkdirSync(dirname(path), { recursive: true })

    return new Promise<string>(function (settle, refuse) {

        server.once("error", function (error: NodeJS.ErrnoException) {

            if (error.code !== "EADDRINUSE") return refuse(error)

            // Two meanings, and only one of them is safe to act on. A
            // socket file outlives the process that made it, so this is
            // either a system that is running or the litter of one that
            // is not — and the only way to tell is to knock.
            //
            // The first version unlinked before listening, which never
            // asked. A second system took the path, the first kept
            // running and was reachable by nobody, and every launch
            // afterwards spoke to the newcomer. Proved by running two.
            alive(path).then(function (running) {

                if (running) return refuse(new Error(`A system is already running here — ${dirname(path)} holds one system, and two would share its programs and persistent state`))

                if (namedPipe) return refuse(error)

                rmSync(path, { force: true })

                server.listen(path, () => settle(secured(path, namedPipe)))
            }, refuse)
        })

        server.listen({ path, readableAll: false, writableAll: false }, () => settle(secured(path, namedPipe)))
    })
}

// The mode is the authorization, so it is set before anything is
// answered rather than left to whatever umask was in force.
function secured(path: string, namedPipe: boolean) {

    if (!namedPipe) chmodSync(path, 0o600)

    return path
}

// Whether anything is listening there. Connecting is the only honest
// test: the file's existence says only that a socket was made once.
function alive(path: string) {

    return new Promise<boolean>(function (settle) {

        const knock = connect(path)

        knock.on("connect", () => { knock.destroy(); settle(true) })

        knock.on("error", () => settle(false))
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

        await programManager.uninstallInstalled(asked.identity, asked.everything === true)

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

            if (stage.stage === "installed") {

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

        if (application.linkManager.authManager.processManager.processes.has(identity)) await application.linkManager.authManager.processManager.stop(identity)

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
