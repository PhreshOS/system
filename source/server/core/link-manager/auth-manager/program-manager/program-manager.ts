import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs"
import { Connect } from "@libs/the-link/decorators/escript"
import { spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import TheLink from "@libs/the-link/the-link"
import SqliteDatabase from "@libs/sqlite-database"
import { Transmitted } from "@libs/messagepack"
import FileManager from "@libs/file-manager"
import FileArea from "@libs/file-area"
import openStore from "@server/core/open-store"
import AuthManager from "../auth-manager"
import { dirname, isAbsolute, join } from "node:path"
import { isDeepStrictEqual } from "node:util"
import Logs, { type LogSource } from "./logs"
import { isValue, layers, type Layer, type Position, type ProgramConfig, type Size } from "./config"
import { type PermissionName, type ProgramCommandChunk, type WallpaperLaunch } from "@phreshos/core"
import { type default as Process, type ProcessLaunch, type Stream } from "../process-manager/process"
import { type StandardShape, type WallpaperShape } from "../process-manager/process-manager"
import Program, { type CommandOutput, type InstallOutput } from "./program"
import Entry, { type HostedEntry } from "./entry"
import Keyv from "keyv"
import { isIconSize, ProgramIcons } from "./icon"
import { readStartup, removeStartup, writeStartup } from "./startup"
import { readPermissions, writePermissions } from "./permissions"

const maximumProcessesPerProgram = 20

/**
 * Every program this runtime knows, in one map keyed by its public
 * identity. Installation is a flag on the record; it changes persistence,
 * never which collection contains the program.
 */
export default class ProgramManager extends TheLink {

    public readonly authManager: AuthManager

    public readonly fileManager: FileManager

    public readonly programs = new Map<string, Entry>()

    // One lifecycle transition per public identity. Besides preventing
    // two installs from replacing the same files at once, this keeps an
    // identity reserved until its final forget announcement has crossed
    // the trusted link. A new occupant can therefore never be erased by
    // the previous occupant's late echo.
    private readonly changing = new Map<string, Promise<void>>()

    // Named convergence and ordinary creation share one Program-local queue.
    // This keeps find-or-create atomic even when another caller uses create.
    private readonly creating = new Map<string, Promise<void>>()

    // What each program remembers about itself, opened on first use and
    // kept by the identity of the program that asked.
    private readonly opened = new Map<string, Keyv>()

    // What each program's halves have said. Opened like the store above
    // and dropped in the same place, because it is the same kind of
    // thing: kept under `storage`, managed by the system, with no word
    // in the program's own vocabulary for writing it.
    private readonly said = new Map<string, Logs>()

    // And each program's own database — the third file under `storage`,
    // and the only one of the three the program writes itself.
    private readonly kept = new Map<string, SqliteDatabase>()

    private readonly icons: ProgramIcons

    public constructor(authManager: AuthManager) {

        super()

        this.fileManager = authManager.linkManager.application.storage.navigateTo("programs")

        this.authManager = authManager

        this.icons = new ProgramIcons(authManager.linkManager.application.defaultProgramIcon)

        this.connectTo(this.authManager, "/program")
    }

    /** Reconstruct every valid installed Program before the host is exposed. */
    public async initialize() {

        // What the system laid out, it can find again — by name, which is
        // what the directory is. A directory that no longer holds a
        // program is left where it is rather than guessed at.
        for (const found of readdirSync(this.fileManager.path, { withFileTypes: true })) {

            if (!found.isDirectory()) continue

            const declaration = this.fileManager.join(found.name, "program.json")

            if (!existsSync(declaration)) continue

            try {

                await this.register(new Program(declaration), true, true)
            }

            catch (exception) { console.log(`programs: ${found.name} was not read — ${exception instanceof Error ? exception.message : "unreadable"}`) }
        }

        // Registration establishes the complete Program registry first. Read
        // every startup declaration before executing any of them as well, so
        // one early Server cannot rewrite what a later Program was going to do
        // during this same boot.
        const starting: [Program, Launch][] = []

        for (const entry of this.programs.values()) {

            try {

                const launch = await this.startup(entry.program, "get")

                if (launch) starting.push([entry.program, launch])
            }

            catch (exception) { console.log(`programs: ${entry.identity} did not start — ${exception instanceof Error ? exception.message : "unreadable startup settings"}`) }
        }

        // One invalid or impossible launch cannot prevent its neighbours or
        // the system itself from starting.
        for (const [program, launch] of starting) {

            try { await this.start(program, launch) }

            catch (exception) { console.log(`programs: ${program.identity} did not start — ${exception instanceof Error ? exception.message : "invalid startup settings"}`) }
        }

    }

    public find(identity: string) {

        const entry = this.programs.get(identity)

        if (!entry) throw new Error("The system does not know this program")

        return entry
    }

    /** Reads one persistent permission decision without creating storage. */
    public permission(program: Program, name: PermissionName) {

        return readPermissions(program)[name]
    }

    /** Returns an independent snapshot of one Program's persistent decisions. */
    public permissions(program: Program) {

        return readPermissions(program)
    }

    /** Stores one persistent permission decision. */
    public setPermission(program: Program, name: PermissionName, value: boolean) {

        const permissions = readPermissions(program)

        Object.defineProperty(permissions, name, { configurable: true, enumerable: true, value, writable: true })

        writePermissions(program, permissions)

        this.authManager.processManager.permissionChanged(program, name).catch(() => undefined)
    }

    /** Removes one persistent permission decision. */
    public deletePermission(program: Program, name: PermissionName) {

        const permissions = readPermissions(program)

        if (!Object.hasOwn(permissions, name)) return

        delete permissions[name]

        writePermissions(program, permissions)

        this.authManager.processManager.permissionChanged(program, name).catch(() => undefined)
    }

    public reach(identity: string) {

        return this.programs.get(identity)?.program ?? null
    }

    // Resolve the browser-only hosting address. This is intentionally a
    // separate lookup from public identity: stable program identities
    // must never become stable asset routes.
    public fromAsset(assetId: string) {

        return [...this.programs.values()].find(entry => entry.program.assetId === assetId)?.program ?? null
    }

    // A program created in memory. From the moment it exists it is an
    // ordinary record in the same runtime registry as every installed
    // program. Only its installed flag differs, so it survives no
    // restart unless it is installed.
    //
    // Everything it names must be absolute. An object's relative paths
    // resolve against the system's own working directory, which is
    // decided by whoever started the system and means nothing to the
    // program that called this — a launched program once wrote storage
    // into a repository through exactly that resolution. A path form
    // resolves against the program.json it names, so it only has to be
    // absolute itself.
    public async create(source: ProgramConfig | string) {

        if (typeof source === "string") {

            if (!isAbsolute(source)) throw new Error("A program is created from an absolute path — the system's working directory is not the caller's")

            const path = statSync(source, { throwIfNoEntry: false })?.isDirectory() ? join(source, "program.json") : source

            const entry = await this.register(new Program(path), false)

            await this.created(entry)

            return entry.program
        }

        // Storage is where what it keeps outlives its processes, and
        // "absent means the system decides" is an installed program's
        // deal — the system has no directory to decide for a program it
        // is not holding on disk.
        if (typeof source.storage !== "string") throw new Error("A created program names its storage")

        for (const [what, place] of [["storage", source.storage], ["icon", source.icon], ["agent", source.agent], ["server", source.server?.location]] as const) {

            if (place === undefined) continue

            if (!isAbsolute(place)) throw new Error(`A created program's ${what} must be an absolute filesystem path`)
        }

        const client = source.client?.location

        if (client !== undefined && !/^https?:\/\//i.test(client) && !isAbsolute(client)) throw new Error("A created program's client must be an absolute filesystem path or an HTTP(S) URL")

        const entry = await this.register(new Program(source), false)

        await this.created(entry)

        return entry.program
    }

    public async fork(program: Program, identity: string) {

        const entry = await this.register(program.fork(identity), false)

        await this.created(entry)

        return entry.program
    }

    private async register(program: Program, installed: boolean, transitionOwnsIdentity = false) {

        await program.validate()

        // The runtime map is the live registry, while an installed
        // declaration is the durable reservation reconstructed on boot.
        // Forgetting an installed Program removes the former but cannot
        // make its identity available to an ordinary create or fork while the
        // latter still exists. Attached replacement is the one transition
        // that deliberately owns this identity across both representations.
        if (this.programs.has(program.identity) || (!transitionOwnsIdentity && (this.changing.has(program.identity) || existsSync(this.fileManager.join(program.identity, "program.json"))))) throw new Error("The system already knows this program identity")

        const entry = new Entry(program, installed)

        this.programs.set(entry.identity, entry)

        return entry
    }

    // Creation is one fact about a Program, emitted after it enters the
    // map and before any of its processes can be created. Installed
    // programs reconstructed in the constructor are initial state, not
    // replayed event history, so only runtime registrations use this.
    private async created(entry: Entry) {

        await this.authManager.processManager.announceHost("program", "create", entry.identity, entry)

        await this.$outbound.publish("/create", entry.hosted())
    }

    private async change<T>(identity: string, operation: () => Promise<T>) {

        if (this.changing.has(identity)) throw new Error("This program is already changing")

        let finish: () => void = () => undefined

        // What observers await is the whole transition, including releasing
        // the identity lock. Awaiting the operation alone allowed an attached
        // exit to resume in the narrow interval before `finally` removed it.
        const changing = new Promise<void>(settle => { finish = settle })

        this.changing.set(identity, changing)

        try { return await operation() }

        finally {

            if (this.changing.get(identity) === changing) this.changing.delete(identity)

            finish()
        }
    }

    private async serializeCreation<T>(identity: string, operation: () => Promise<T>) {

        const previous = this.creating.get(identity) ?? Promise.resolve()

        let finish: () => void = () => undefined

        const pending = new Promise<void>(settle => { finish = settle })

        const creating = previous.catch(() => undefined).then(() => pending)

        this.creating.set(identity, creating)

        await previous.catch(() => undefined)

        try { return await operation() }

        finally {

            finish()

            if (this.creating.get(identity) === creating) this.creating.delete(identity)
        }
    }

    // A place is made when it is first wanted, which is also when a
    // program has something to put in it. Metadata and content meet in
    // this object even though their transports differ.
    private areaOf(program: Program, area: Area) {

        return new FileArea(join(program.storagePath, area), `this program's ${area}`)
    }

    // A program's own store, kept beside what it keeps.
    private storeOf(program: Program) {

        const already = this.opened.get(program.identity)

        if (already) return already

        const store = openStore(program.storagePath)

        this.opened.set(program.identity, store)

        return store
    }

    // What this program has said. Its own file under `storage`, so it
    // survives an update and goes with everything.
    public logsOf(program: Program) {

        const already = this.said.get(program.identity)

        if (already) return already

        const logs = new Logs(join(program.storagePath, "logs.sqlite"))

        this.said.set(program.identity, logs)

        return logs
    }

    // A log emission is not an operation the producer waits for. The Program's
    // own storage is authoritative whether that Program is installed or is an
    // attached authoring run.
    public record(program: Program, process: string, source: LogSource, kind: string, content: string) {

        this.logsOf(program).record(process, source, kind, content)
    }

    // Read, and only ever read. The same word a process says over its
    // channel and a pane says over the link, because the two roads must
    // mean the same thing.
    @Connect("/logs")
    public async logs(identity: string, sql: string, values: unknown[]) {

        return this.logsOf(this.reachOrRefuse(identity)).query(sql, values)
    }

    // A program's own database, opened on first use like the managed files
    // beside it. Its schema belongs entirely to the program: the system
    // supplies SQLite without creating tables or inventing another query
    // language. A separate file keeps that authority structurally apart from
    // the store and logs the system manages for the same program.
    public databaseOf(program: Program) {

        const already = this.kept.get(program.identity)

        if (already) return already

        const database = new SqliteDatabase(join(program.storagePath, "database.sqlite"))

        this.kept.set(program.identity, database)

        return database
    }

    // Read and written both: this file is the program's own, which is
    // the whole of why it is a file of its own.
    @Connect("/database")
    public async database(identity: string, sql: string, values: unknown[]) {

        return this.databaseOf(this.reachOrRefuse(identity)).query(sql, values)
    }

    /** One authoritative icon operation shared by SDKs and HTTP hosting. */
    @Connect("/icon")
    public async icon(identity: string, size: unknown) {

        if (!isIconSize(size)) throw new Error("A Program icon size is small, medium, or large")

        return [...await this.icons.render(this.reachOrRefuse(identity), size)]
    }

    /** Reads Program-specific operating knowledge for agents. */
    @Connect("/agent")
    public async agent(identity: string) {

        return this.reachOrRefuse(identity).agent()
    }

    /** Read or change the system-managed startup launch for one Program. */
    public async startup(program: Program, operation: string, value?: unknown): Promise<Launch | null | void> {

        if (operation === "get") {

            const launch = readStartup(program)

            if (launch === null) return null

            this.resolveLaunch(program, launch)

            return launch
        }

        if (operation === "enable") {

            if (!this.installed(program)) throw new Error("Only an installed program can start with the system")

            await program.validate()

            this.resolveLaunch(program, value)

            writeStartup(program, value)

            return
        }

        if (operation === "disable") {

            removeStartup(program)

            return
        }

        throw new Error(`The host does not know the startup operation "${operation}"`)
    }

    // A store's five controls, in one place. Reached from a process
    // over its own channel and from a session over the link, and both
    // must mean the same thing. The identity always names a Program;
    // application persistence has no generic route through this manager.
    @Connect("/store")
    public async store(identity: string, operation: string, key: string, value?: unknown, ttl?: number) {

        const store = this.storeOf(this.reachOrRefuse(identity))

        if (operation === "get") return await store.get(key) as unknown

        if (operation === "set") return await store.set(key, value, ttl)

        if (operation === "delete") return await store.delete(key as string | string[])

        if (operation === "has") return await store.has(key)

        if (operation === "clear") return await store.clear()

        throw new Error(`The host does not know the store operation "${String(operation)}"`)
    }

    // Area metadata reached from a session over the link. Content stays
    // a byte stream at the storage door; locations remain server-only.
    @Connect("/area")
    public async area(identity: string, area: string, operation: string, args: unknown[]) {

        if (area !== "data" && area !== "cache") throw new Error(`The host does not know the place "${String(area)}"`)

        return this.operate(this.reachOrRefuse(identity), area, operation, args)
    }

    public reachOrRefuse(identity: string) {

        const program = this.reach(identity)

        if (!program) throw new Error("The system does not know this program")

        return program
    }

    // Client metadata stays in the link as ordinary values and client
    // content stays a byte stream. A server asks only for `path`, then
    // performs every operation in its SDK against that root.
    public operate(program: Program, area: Area, operation: string, args: unknown[]): unknown {

        const place = this.areaOf(program, area)

        const joins = args.map(String)

        if (operation === "path") return place.path

        if (operation === "clear") {

            place.clear(joins)

            return undefined
        }

        if (operation === "stat") return place.stat(joins)

        // Sorted, so two runs of the same program see the same order and
        // a program showing a list does not have to sort it again.
        if (operation === "list") return place.list(joins)

        // Removing a place is `clear`, and one act with two names is how
        // a program empties everything meaning to remove one thing.
        if (operation === "delete") {

            place.delete(joins)

            return undefined
        }

        throw new Error(`The host does not know the storage operation "${operation}"`)
    }

    public streamArea(identity: string, area: Area, joins: string[]) {

        return this.areaOf(this.reachOrRefuse(identity), area).stream(joins)
    }

    public async writeArea(identity: string, area: Area, joins: string[], content: ReadableStream<Uint8Array> | null, signal?: AbortSignal) {

        await this.areaOf(this.reachOrRefuse(identity), area).write(joins, content, signal)
    }

    // ── Installing and uninstalling ──────────────────────────────────
    //
    // Installation is the flag on the sole registry record. The files
    // laid out under its identity are the durable representation of that
    // state, reconstructed into the same model on boot.

    public installed(program: Program) {

        return this.programs.get(program.identity)?.installed === true
    }

    // Installation changes every path a process may have remembered, so
    // validation happens first and every process ends before the live
    // Program is pointed at its canonical files.
    @Connect("/install-program")
    public async installNamed(identity: string, asker: string | null = null) {

        const program = this.reach(identity)

        if (!program) throw new Error("The system does not know this program")

        return await this.install(program, asker)
    }

    @Connect("/uninstall-program-stream")
    public async uninstallNamedStreaming(identity: string, everything = false, asker: string | null = null, stream: unknown) {

        if (typeof stream !== "string" || !stream) throw new Error("Uninstalling needs a stream identity")

        const program = this.reach(identity)

        if (!program) throw new Error("The system does not know this program")

        for await (const chunk of this.uninstallStreaming(program, everything, asker)) {

            await this.$outbound.publish("/uninstall-program-output", stream, chunk)
        }

        return program.identity
    }

    // A local project addresses the durable installation, not a handle it
    // already holds. Attached use may have replaced or forgotten the runtime
    // entry while the installed declaration still exists, so this resolves
    // from the installed area first and reconstructs the runtime counterpart
    // only when the operation needs one.
    public async uninstallInstalled(identity: string, everything = false, asker: string | null = null, output: CommandOutput = () => undefined) {

        return await this.change(identity, async () => {

            const declaration = this.fileManager.join(identity, "program.json")

            if (!existsSync(declaration)) throw new Error("This program is not installed — there is nothing here to remove")

            let entry = this.programs.get(identity)

            if (!entry) {

                entry = await this.register(new Program(declaration), true, true)

                await this.created(entry)
            }

            return await this.uninstallEntry(entry, everything, asker, output)
        })
    }

    /** Uninstall an installed Program while exposing cleanup command output. */
    public uninstallInstalledStreaming(identity: string, everything = false, asker: string | null = null) {

        return this.commandStreaming(output => this.uninstallInstalled(identity, everything, asker, output))
    }

    @Connect("/forget-program")
    public async forgetNamed(identity: string, asker: string | null = null) {

        const program = this.reach(identity)

        if (!program) throw new Error("The system does not know this program")

        return await this.forget(program, asker)
    }

    /**
     * Install one external Program description and coordinate every requested
     * follow-up as one Core operation. Each yielded stage lets a View represent
     * progress without taking ownership of the workflow.
     */
    public async *installSource(source: ProgramConfig, options: InstallSourceOptions = {}): AsyncGenerator<InstallSourceStage> {

        const program = new Program(source)

        await program.validate()

        // A runtime Program may have been forgotten while its installed
        // declaration remains. Replacement is therefore a fact about the
        // durable files, not the current registry entry's installed flag.
        const replaced = existsSync(this.fileManager.join(program.identity, "program.json"))

        const installation = this.installStreaming(program)

        let entry: Entry

        while (true) {

            const next = await installation.next()

            if (next.done) {

                entry = next.value

                break
            }

            yield { stage: "output", chunk: next.value }
        }

        yield { stage: "installed", entry, replaced }

        const launch = {}

        if (options.startup) {

            await this.startup(entry.program, "enable", launch)

            yield { stage: "startup-enabled" }
        }

        if (options.run) {

            const process = await this.runInstalled(entry.program, launch)

            yield { stage: "running", process }
        }
    }

    /** Run a durable Program independently of the local intake connection. */
    public async runInstalled(program: Program, launch: Launch = {}) {

        if (!this.installed(program)) throw new Error("Only an installed program can run independently")

        return await this.start(program, launch)
    }

    /** Install while exposing command output with consumer-driven backpressure. */
    public installStreaming(source: Program, asker: string | null = null) {

        return this.commandStreaming(output => this.install(source, asker, output))
    }

    /** Uninstall a held Program while exposing cleanup command output. */
    public uninstallStreaming(program: Program, everything = false, asker: string | null = null) {

        return this.commandStreaming(output => this.uninstall(program, everything, asker, output))
    }

    /** Runs one lifecycle command while preserving output order and backpressure. */
    private async *commandStreaming<Result>(run: (output: CommandOutput) => Promise<Result>): AsyncGenerator<ProgramCommandChunk, Result, void> {

        const queue: { chunk: ProgramCommandChunk, consumed: () => void }[] = []

        let wake: (() => void) | null = null

        let settled = false

        let result: { value: Result } | undefined

        let failure: unknown

        let detached = false

        const operation = run(chunk => {

            if (detached) return

            return new Promise<void>(consumed => {

                queue.push({ chunk, consumed })

                wake?.()

                wake = null
            })
        }).then(value => {

            result = { value }
        }, error => {

            failure = error
        }).finally(() => {

            settled = true

            wake?.()

            wake = null
        })

        try {

            while (!settled || queue.length) {

                const next = queue.shift()

                if (next) {

                    try { yield next.chunk }

                    finally { next.consumed() }

                    continue
                }

                await new Promise<void>(resolve => { wake = resolve })
            }

            await operation

            if (failure) throw failure

            return result!.value
        }

        finally {

            detached = true

            for (const pending of queue.splice(0)) pending.consumed()
        }
    }

    public async install(source: Program, asker: string | null = null, output: InstallOutput = () => undefined) {

        return await this.change(source.identity, async () => {

            const home = this.fileManager.join(source.identity)

            const already = existsSync(home)

            // Copied outside the installed files rather than into their place,
            // so a description that turns out not to be a program has not
            // taken a working one down on its way to being refused. Kept on
            // the installed programs area's own filesystem: the final rename is then
            // local even when the operating-system temp directory is a
            // separate mount, as it is in Codespaces.
            const staged = mkdtempSync(join(dirname(this.fileManager.path), `.install-${source.identity}-`))

            const backup = mkdtempSync(join(dirname(this.fileManager.path), `.backup-${source.identity}-`))

            let swapping = false

            let committed = false

            let createdHere = false

            try {

                copyProgram(source, staged)

                // Whether what was copied is a program: asked here, while the
                // old one is still standing, so a description that turns out
                // to be lying takes nothing down with it. `laidOut` used to
                // guard this and no longer can — a copied program's
                // description says nothing about where its parts are,
                // because they are wherever the system puts them.
                await new Program(join(staged, "program.json")).validate()

                // A process may have retained an absolute server,
                // client, or storage path. Its ending is part of the
                // install operation, not advice for the caller.
                if (this.programs.has(source.identity)) await this.authManager.processManager.exitAll(source.identity, asker)

                await this.release(source.identity)

                swapping = true

                mkdirSync(home, { recursive: true })

                for (const what of installedParts) {

                    if (existsSync(join(home, what))) renameSync(join(home, what), join(backup, what))
                }

                for (const what of readdirSync(staged)) renameSync(join(staged, what), join(home, what))

                const installed = new Program(join(home, "program.json"))

                // Preparation runs against the laid-out files but before
                // the registry claims the install succeeded.
                await installed.installServer(output)

                let entry = this.programs.get(source.identity)

                if (entry) {

                    entry.program.replace(installed)

                    entry.installed = true
                }

                else {

                    entry = await this.register(installed, true, true)

                    createdHere = true
                }

                committed = true

                if (createdHere) await this.created(entry)

                await this.authManager.processManager.announceHost("program", "install", entry.identity, entry)

                // Said to the sessions, though none of them may ask for it.
                // `@Connect` used to be both the road in and the echo out,
                // and removing the road took the echo with it — a desktop
                // that never learns a program arrived is a desktop showing
                // yesterday's list.
                await this.$outbound.publish("/install", entry.hosted())

                return entry
            }

            catch (exception) {

                // Restore the prior program files after any failure in
                // the swap or install command. Storage never entered the
                // transaction and is therefore neither copied nor moved.
                if (swapping && !committed) {

                    for (const what of installedParts) rmSync(join(home, what), { recursive: true, force: true })

                    for (const what of readdirSync(backup)) renameSync(join(backup, what), join(home, what))

                    if (!already && !readdirSync(home).length) rmSync(home, { recursive: true, force: true })
                }

                throw exception
            }

            finally {

                rmSync(staged, { recursive: true, force: true })

                rmSync(backup, { recursive: true, force: true })
            }
        })
    }

    // Without `everything`, only the installed description and program
    // files leave. Processes and open storage handles remain alive. With
    // it, everything the system owns for this program leaves: processes,
    // files, storage, and finally the runtime registry entry.
    public async uninstall(program: Program, everything = false, asker: string | null = null, output: CommandOutput = () => undefined) {

        return await this.change(program.identity, async () => {

            if (!this.installed(program)) throw new Error("This program is not installed — there is nothing here to remove")

            const entry = this.find(program.identity)

            return await this.uninstallEntry(entry, everything, asker, output)
        })
    }

    private async uninstallEntry(entry: Entry, everything: boolean, asker: string | null, output: CommandOutput) {

        if (everything) {

            await this.authManager.processManager.exitAll(entry.identity, asker)

            await this.release(entry.identity)
        }

        await entry.program.uninstallServer(output)

        const home = this.fileManager.join(entry.identity)

        if (everything) rmSync(home, { recursive: true, force: true })

        else {

            for (const what of installedParts) rmSync(join(home, what), { recursive: true, force: true })

            if (!readdirSync(home).length) rmSync(home, { recursive: true, force: true })
        }

        entry.installed = false

        await this.authManager.processManager.announceHost("program", "uninstall", entry.identity, entry, everything)

        await this.authManager.processManager.announceSubject("program", "uninstall", entry.program.reference, everything)

        await this.$outbound.publish("/uninstall", entry.hosted(), everything)

        if (everything) await this.forgetEntry(entry)

        return entry.identity
    }

    public async forget(program: Program, asker: string | null = null) {

        return await this.change(program.identity, async () => {

            const entry = this.find(program.identity)

            await this.authManager.processManager.exitAll(program.identity, asker)

            return await this.forgetEntry(entry)
        })
    }

    private async forgetEntry(entry: Entry) {

        if (this.programs.get(entry.identity) !== entry) throw new Error("The system no longer knows this program")

        await this.release(entry.identity)

        this.programs.delete(entry.identity)

        await this.authManager.processManager.announceHost("program", "forget", entry.identity, entry)

        await this.authManager.processManager.announceSubject("program", "forget", entry.program.reference)

        await this.$outbound.publish("/forget", entry.identity)

        return entry.identity
    }

    private async release(identity: string) {

        const store = this.opened.get(identity)

        this.opened.delete(identity)

        await store?.disconnect()

        this.said.get(identity)?.close()

        this.said.delete(identity)

        this.kept.get(identity)?.close()

        this.kept.delete(identity)
    }

    @Connect("/create-process")
    public async createProcess(identity: string, launch: Launch = {}, parent: Process | string | null = null) {

        return await this.serializeCreation(identity, async () => {

            // Every runtime program, installed or not, is reached through the
            // same registry. A created process therefore starts from the exact
            // Program its caller addressed, never from an installed-only view.
            const program = this.reach(identity)

            if (!program) throw new Error("The system does not know this program")

            const creator = typeof parent === "string" ? this.authManager.processManager.processes.get(parent) : parent

            if (typeof parent === "string" && !creator) throw new Error("The system does not know the parent process")

            return await this.start(program, launch, undefined, creator ?? null)
        })
    }

    @Connect("/find-or-create-process")
    public async findOrCreateProcess(identity: string, launch: Launch & { name: string }, parent: Process | string | null = null) {

        return await this.serializeCreation(identity, async () => {

            const program = this.reach(identity)

            if (!program) throw new Error("The system does not know this program")

            const resolved = this.resolveLaunch(program, launch)

            if (typeof launch.name !== "string" || !launch.name) throw new Error("findOrCreate requires a non-empty process name")

            const existing = [...this.authManager.processManager.processes.values()].find(process => process.program === program && process.name === launch.name)

            if (existing) {

                if (!isDeepStrictEqual(existing.launch, resolved.intent)) throw new Error(`The process "${launch.name}" already exists with a different launch`)

                return existing.identity
            }

            const creator = typeof parent === "string" ? this.authManager.processManager.processes.get(parent) : parent

            if (typeof parent === "string" && !creator) throw new Error("The system does not know the parent process")

            return await this.start(program, launch, undefined, creator ?? null, false, false, resolved)
        })
    }

    // An attached launch is the local project's authoritative runtime use of
    // its declared identity. Replacement is one transition: every old process
    // exits, the old Program is forgotten with its ordinary announcements,
    // and only then does the new uninstalled Program become reachable. The
    // installed files, if any, are deliberately untouched and may be installed
    // over later or reconstructed on the next system start.
    public async launchAttached(source: ProgramConfig, options: Options, watching: Watching) {

        // Unlike an installed Program, an attached one has no canonical
        // system-owned directory from which an omitted storage path can be
        // derived. The authoring tool supplies the project storage explicitly.
        if (typeof source.storage !== "string") throw new Error("An attached program names its storage")

        if (!isAbsolute(source.storage)) throw new Error("An attached program's storage must be an absolute filesystem path")

        const program = new Program(source)

        // Refuse a bad incoming declaration before taking a coherent existing
        // Program down. `start` asks again immediately before spawning because
        // files can move between these two moments.
        await program.validate()

        return await this.change(program.identity, async () => {

            const existing = this.programs.get(program.identity)

            if (existing) {

                await this.authManager.processManager.exitAll(existing.identity)

                await this.forgetEntry(existing)
            }

            // This transition owns the identity. In particular, an installed
            // declaration may still reserve it on disk after its runtime
            // Program was forgotten; attached use is explicitly allowed to
            // stand there without deleting or changing that installation.
            const entry = await this.register(program, false, true)

            try {

                await this.created(entry)

                return await this.start(program, { options }, {

                    output: watching.output,

                    exited: (code, signal) => {

                        // The launcher hears the ending only after the attached
                        // Program has left the registry. Otherwise a command
                        // started immediately afterwards can collide with a life
                        // whose process has already ended.
                        this.finishAttached(program).then(

                            () => watching.exited(code, signal),

                            () => watching.exited(code, signal)
                        )
                    }
                }, null, true)
            }

            catch (exception) {

                if (this.programs.get(program.identity) === entry) {

                    await this.authManager.processManager.exitAll(program.identity)

                    await this.forgetEntry(entry)
                }

                throw exception
            }
        })
    }

    private async finishAttached(program: Program) {

        const changing = this.changing.get(program.identity)

        if (changing) await changing

        if (this.programs.get(program.identity)?.program === program) await this.forget(program)
    }

    // One interpretation of a Process launch, used both when it is created now
    // and when a future startup launch is persisted. Runtime-only facts such as
    // name occupancy and capacity remain in `start`.
    private resolveLaunch(program: Program, value: unknown) {

        if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("A launch must be a named shape")

        const launch = value as Launch

        if (launch.name !== undefined && (typeof launch.name !== "string" || !launch.name)) throw new Error("A process name must be non-empty text")

        const suppliedOptions = launch.options ?? {}

        if (typeof suppliedOptions !== "object" || suppliedOptions === null || Array.isArray(suppliedOptions) || Object.values(suppliedOptions).some(value => typeof value !== "string")) throw new Error("A launch's options must be text values")

        const options = Object.fromEntries(Object.entries(suppliedOptions).sort(([left], [right]) => left.localeCompare(right)))

        if (launch.server !== undefined && typeof launch.server !== "boolean") throw new Error("A launch's server must be true or false")

        if (launch.client !== undefined && typeof launch.client !== "boolean" && (typeof launch.client !== "object" || launch.client === null || Array.isArray(launch.client))) throw new Error("A launch's client must be true, false, or a client shape")

        const asked = typeof launch.client === "object" ? launch.client : {}

        if (launch.server === true && !program.server) throw new Error("This program declared no server half — a launch cannot add one")

        if ((launch.client === true || typeof launch.client === "object") && !program.client) throw new Error("This program declared no client half — a launch cannot add one")

        const server = program.server && (launch.server ?? program.server.start) ? program.server : null

        const clientSelected = typeof launch.client === "object" || (launch.client ?? program.client?.start ?? false)

        const client = program.client && clientSelected ? program.client : null

        if (!server && !client) throw new Error("A process must have a server half, a client half, or both")

        // Resolving the Window here validates the same launch grammar even when
        // the launch is being stored for a later boot. Only the original launch
        // is persisted; system defaults are derived again when it actually runs.
        const shape = client ? this.clientShape(program, asked) : null

        const intent: ProcessLaunch = {

            server: server !== null,

            client: shape ? {

                ...shape,

                position: asked.position ?? program.client?.position ?? null,

                size: asked.size ?? program.client?.size ?? null
            } : null,

            options
        }

        return { options, server, client, shape, intent }
    }

    private async start(program: Program, launch: Launch = {}, watching?: Watching, parent: Process | null = null, transitionOwnsIdentity = false, wallpaper = false, prepared?: ReturnType<ProgramManager["resolveLaunch"]>) {

        if (!transitionOwnsIdentity && this.changing.has(program.identity)) throw new Error("This program is changing and cannot create a process")

        // A retained Program survives uninstall(false), but its declared
        // files do not. Refuse before a process identity or window is
        // allocated, so a failed launch never briefly exists.
        await program.validate()

        const resolved = prepared ?? this.resolveLaunch(program, launch)

        const { options, server, client } = resolved

        const shape = client ? wallpaper ? this.wallpaperShape(resolved.shape!) : resolved.shape : null

        // Recheck the program-local name immediately before registration,
        // then create and register without yielding so concurrent launches
        // cannot both claim it.
        if (launch.name !== undefined && [...this.authManager.processManager.processes.values()].some(process => process.program === program && process.name === launch.name)) throw new Error("This program already has a process with that name")

        // Capacity belongs to the Program being executed, not to whichever
        // Process requested the launch. This is the final gate before identity
        // allocation, endpoint spawning, and synchronous registration; no
        // concurrent launch can pass it without the preceding one entering the
        // authoritative Process map first.
        let active = 0

        for (const process of this.authManager.processManager.processes.values()) {

            if (process.program !== program) continue

            active++

            if (active >= maximumProcessesPerProgram) throw new Error(`This program has reached its limit of ${maximumProcessesPerProgram} active processes`)
        }

        let identity = randomUUID()

        while (this.authManager.processManager.processes.has(identity)) identity = randomUUID()

        // Kept in this Program's declared storage, whoever is or is not
        // watching and whether the Program is installed or attached. Each
        // server incarnation attaches to the same Process-level listeners.
        const logs = this.logsOf(program)

        const child = server ? this.spawnServer(program) : null

        // Lifecycle consumers are attached before either initial endpoint is
        // activated, so even a server command that exits immediately has a
        // complete output and exit record.
        await this.authManager.processManager.register(identity, launch.name ?? null, program, options, resolved.intent, child, client !== null, shape, parent, record => {

            record.onServerStart(server => server.onOutput((stream, text) => logs.printed(identity, stream === "err" ? "stderr" : "stdout", text)))

            record.onServerStop((code, signal) => logs.endpointExited(identity, "server", code, signal))

            record.onClientStop(() => logs.endpointExited(identity, "client", null, null))

            if (watching) {

                record.onServerStart(server => server.onOutput(watching.output))

                record.onExit(watching.exited)
            }
        })

        return identity
    }

    /** Creates the one protected Process representation used as desktop wallpaper. */
    public async startWallpaper(program: Program, launch: WallpaperLaunch = {}) {

        if (!program.client) throw new Error("A desktop wallpaper Program must declare a Client")

        return await this.start(program, { ...launch, client: launch.client ?? true }, undefined, null, false, true)
    }

    /** Starts one fresh server endpoint incarnation for a Process. */
    public spawnServer(program: Program) {

        const server = program.server

        if (!server) throw new Error("This program declared no server half")

        return spawn(server.startCommand, {

            shell: true,

            // One Process owns everything its server command starts.
            // A separate operating-system group makes that ownership real:
            // closing the Process can end the whole tree instead of only the
            // shell at its root.
            detached: true,

            cwd: program.serverPath!,

            // Always piped, because the system is always the audience.
            //
            // This was piped only when somebody was listening: a pipe
            // nobody reads fills at about 64 KB and the program stops
            // mid-write, and `stdio` is decided here and once, so an
            // audience arriving later heard nothing. Both halves of that
            // stopped being true when the core began keeping what a
            // program says — it reads, so the pipe drains, and a
            // listener no longer has to have been there at the start.
            //
            // Which also ends the difference between the two ways of
            // running one: an attached program's output is no longer a
            // road of its own, it is the same drain with somebody else
            // also watching.
            stdio: ["ignore", "pipe", "pipe", "ipc"],

            // MessagePack envelopes remain bytes across Node's IPC boundary.
            serialization: "advanced",

            // Only what the operating system needs to run a command.
            // No program data travels this way: options and places are
            // asked for over the channel, which is the one road a
            // client half can walk too.
            env: {

                ...process.env,

                PATH: `${join(process.cwd(), "node_modules", ".bin")}:${process.env.PATH}`
            }
        })
    }

    /** Resolves and validates one client endpoint incarnation. */
    public clientShape(program: Program, asked: LaunchClient = {}): StandardShape {

        const client = program.client

        if (!client) throw new Error("This program declared no client half")

        if (typeof asked !== "object" || asked === null || Array.isArray(asked)) throw new Error("A client launch must be a named shape")

        if (asked.title !== undefined && typeof asked.title !== "string") throw new Error("A launch client's title must be text")

        for (const [what, value] of [["size", asked.size], ["position", asked.position]] as const) {

            if (value === undefined) continue

            if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`A launch client's ${what} must name both of its values`)

            const pair = what === "size" ? [value.width, value.height] : [value.x, value.y]

            if (!pair.every(isValue)) throw new Error(`A launch client's ${what} is a finite pixel number or a relative expression such as "50% + 10"`)
        }

        if (asked.layer !== undefined && !layers.includes(asked.layer)) throw new Error(`A launch client's layer is one of ${layers.join(", ")}`)

        if (asked.location !== undefined && typeof asked.location !== "string") throw new Error("A launch client's location must be text")

        if (asked.minimize !== undefined && typeof asked.minimize !== "boolean") throw new Error("A launch client's minimize state must be true or false")

        const shift = this.authManager.processManager.processes.size % 8 * 32

        return {

            title: asked.title ?? program.title,

            position: asked.position ?? client.position ?? { x: 120 + shift, y: 80 + shift },

            size: asked.size ?? client.size ?? { width: 520, height: 340 },

            layer: asked.layer ?? client.layer ?? "window",

            location: page(asked.location, program.clientLocation),

            minimize: asked.minimize ?? client.minimize ?? false
        }
    }

    private wallpaperShape(shape: StandardShape): WallpaperShape {

        return {

            ...shape,

            position: { x: "0/1", y: "0/1" },

            size: { width: "1/1", height: "1/1" },

            layer: "wallpaper",

            minimize: false
        }
    }

    public toJSON() {

        return {

            programs: [...this.programs].map(([identity, entry]) => [identity, entry.hosted()] as [string, HostedEntry])
        }
    }
}

export type TransmittedProgramManager = Transmitted<ProgramManager>

export interface InstallSourceOptions {

    run?: boolean

    startup?: boolean
}

export type InstallSourceStage =

    | { stage: "output", chunk: ProgramCommandChunk }

    | { stage: "installed", entry: Entry, replaced: boolean }

    | { stage: "startup-enabled" }

    | { stage: "running", process: string }

// Which of a half's own pages a launch asked for.
//
// A launch location is rooted in the client half's declared place,
// whether that place is the program's assets or a URL directory. The
// artificial prefix lets the URL parser normalise every spelling of a
// path before the boundary is checked; what comes back is the client's
// own location, always beginning at `/` and never naming its root.
function page(said: string | undefined, fallback: string) {

    if (said === undefined) return fallback

    const root = "http://client.invalid/client/"

    const asked = new URL(said.replace(/^\/+/, ""), root)

    if (!asked.href.startsWith(root)) throw new Error("A client half's location cannot leave its declared root")

    return `/${asked.pathname.slice("/client/".length)}${asked.search}${asked.hash}`
}

// What a launcher may say at the start. Named rather than ordered,
// because an order is invisible where it is written — and text, because
// an option must mean one thing however the process was started, and
// the command line can only hand over text.
export type Options = Record<string, string>

// What a launch says in named parts: which declared halves this process
// has, what it is told, and how this one instance is shown. Ordered
// arguments would have been invisible at the place they are written,
// and two anonymous bags in a row is the shape that grows a third.
export interface Launch {

    // Optional and unique among this program's living processes. It is
    // a meaningful address; the process identity remains random.
    name?: string

    // Omitted uses the declaration's default. True starts the declared server
    // endpoint; false leaves it stopped. Neither can declare a new endpoint.
    server?: boolean

    // An object starts the declared client endpoint and resolves its Window.
    client?: boolean | LaunchClient

    options?: Options
}

// The declaration's own words, all optional, overriding one Process's initial
// or restarted client endpoint. Not `location` as a place to serve from — the declared
// client root stays fixed — but as which page beneath it the frame
// opens on. And not `icon`, which is the program's identity rather
// than a fact about a launch.
export interface LaunchClient {

    title?: string

    size?: Size

    position?: Position

    layer?: Layer

    location?: string

    minimize?: boolean
}

// The two places a program keeps things. One survives an update and one
// may be emptied at any moment; both are the program's, shared by every
// process of it.
export type Area = "data" | "cache"

// Someone listening to a process from outside it. Given at launch
// because that is when the child's pipes are decided, and they cannot be
// decided twice.
export interface Watching {

    output: (stream: Stream, text: string) => void

    exited: (code: number | null, signal: NodeJS.Signals | null) => void
}

// What a program is, copied to where it is going: the halves it
// declares, its icon, and the description itself — rewritten so the
// copy names its parts where they now are rather than where they were.
//
// Never `storage`: what a program kept belongs to the place it is kept
// in, and a copy that carried it would be two programs sharing one
// memory.
export function copyProgram(program: Program, into: string) {

    const config: Record<string, unknown> = { ...program.config }

    for (const [what, from] of [["server", program.serverPath], ["client", program.clientPath]] as const) {

        // A client half that is a URL has no directory to copy and is
        // not carried: an installed program's client is its own files.
        if (what === "client" && program.clientUrl) throw new Error("A program installed here keeps its client at ./client, and a URL is somewhere else entirely")

        if (!from || !existsSync(from)) continue

        cpSync(from, join(into, what), { recursive: true })

        config[what] = { ...config[what] as object, location: what }
    }

    if (program.iconPath) {

        copyFileSync(program.iconPath, join(into, "icon.png"))

        config.icon = "icon.png"
    }

    else delete config.icon

    const agent = program.agent()

    if (agent !== null) {

        writeFileSync(join(into, "agent.md"), agent)

        config.agent = "agent.md"
    }

    else delete config.agent

    // The description names the places the system chose. Presence is
    // part of a half's declaration, so its location is never omitted.
    delete config.storage

    writeFileSync(join(into, "program.json"), JSON.stringify(strip(config), null, 4))
}

const installedParts = ["server", "client", "icon.png", "agent.md", "program.json"] as const

// JSON has no `undefined`, and a key whose value is one would be written
// as nothing at all — so they are removed rather than left to vanish.
function strip(value: unknown): unknown {

    if (Array.isArray(value)) return value.map(strip)

    if (typeof value !== "object" || value === null) return value

    return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined).map(([key, entry]) => [key, strip(entry)]))
}

// An installed program is one the system laid out, so its places are the
// ones the system lays out. Saying them is allowed — a program.json
// written by hand may well spell out what it could have left unsaid —
// but saying anything else is not, because then the system could no
// longer find any installed program without reading its config first.
