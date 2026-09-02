import { ClientConfig, isValue, kebab, layers, Position, ProgramConfig, ServerConfig, Size } from "./config"
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs"
import { dirname, isAbsolute, normalize, relative, resolve, sep } from "node:path"
import { spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import { isDeepStrictEqual } from "node:util"
import { validateIcon } from "./icon"
import type { ClientPermissions, ProgramCommandChunk } from "@phreshos/core"
import { permissionCatalog } from "@server/core/permissions"

/**
 * A program: a description, and the things it names.
 *
 * It is built either from a `program.json` — in which case every
 * relative path it declares is relative to that file, because the file
 * stands in the program's own place — or from an object, in which case
 * they are relative to the running process, as any tool's paths are. A
 * program the system builds for itself should therefore name absolute
 * paths, since the system's own working directory is decided by whoever
 * started it.
 *
 * Being built is a check in itself: a description that contradicts
 * itself is refused here, so a Program that exists is coherent. Whether
 * it is *true* — whether the things it names are there — is a different
 * question, asked when the system is told to rely on it, and asked
 * again by whatever uses it, because the world moves in between.
 *
 * Identity is the program's one public address, whether or not it is
 * installed. Client files use a separate random address whose only job
 * is hosting: a stable identity never becomes a stable asset URL.
 */
export default class Program {

    public readonly identity: string

    /** Opaque identity of this runtime Program entity. */
    public readonly reference = randomUUID()

    public readonly assetId = randomUUID()

    /** Changes whenever this runtime Program is replaced in place. */
    public revision = 0

    // What every relative path is relative to.
    public root: string

    public config: ProgramConfig

    public readonly clientPermissions: ClientPermissions

    public constructor(source: string | ProgramConfig, root?: string) {

        const [config, where] = typeof source === "string" ? read(source) : [source, process.cwd()]

        this.config = coherent(config)

        this.clientPermissions = permissionCatalog.declarations(this.config.client?.permissions)

        this.identity = this.config.identity

        // Given only when a program is made from another: the same
        // description standing in the same place, which an object alone
        // cannot say because an object's relative paths resolve against
        // whatever directory the system was started in.
        this.root = root ?? where
    }

    // The same description and place under an explicitly different
    // identity. A fork is another program, never an alias for this one.
    public fork(identity: string) {

        return new Program({ ...this.config, identity }, this.root)
    }

    // Installation lays the same logical program out in the system's
    // canonical place. Its public identity and private asset address do
    // not change; only the description and root it runs from do.
    public replace(source: Program) {

        if (source.identity !== this.identity) throw new Error("A program cannot change its identity")

        if (!isDeepStrictEqual(source.clientPermissions, this.clientPermissions)) throw new Error("A Program's Client permissions cannot change during its lifetime")

        this.config = source.config

        this.root = source.root

        this.revision++
    }

    // What a person reads. A program that said nothing is read by its
    // identity, which is why nothing has to declare both.
    public get name() {

        return this.config.name ?? this.config.identity
    }

    // What its window is called when one opens. The window owns its
    // title afterwards; this is only what it is born with.
    public get title() {

        return this.config.client?.title ?? this.name
    }

    public get server(): Resolved<ServerConfig> | null {

        return this.config.server ? {
            ...this.config.server,
            start: this.config.server.start ?? true,
            service: this.config.server.service ?? false
        } : null
    }

    public get client(): Resolved<ClientConfig> | null {

        return this.config.client ? {
            ...this.config.client,
            start: this.config.client.start ?? true,
            service: this.config.client.service ?? false,
            permissions: this.clientPermissions
        } : null
    }

    // A client half may name a URL instead of a directory, which is how
    // a program under development is framed from a live dev server. An
    // installed program cannot: its paths are not its own to choose.
    public get clientUrl() {

        const location = this.config.client?.location

        return location && /^https?:\/\//i.test(location) ? location : null
    }

    // A URL declaration says two things in one ordinary URL: its last
    // slash ends the place this client may be launched beneath, and the
    // remainder is the page it opens on when a launch says nothing.
    public get clientRoot() {

        const location = this.clientUrl

        if (!location) return null

        const url = new URL(location)

        url.pathname = url.pathname.slice(0, url.pathname.lastIndexOf("/") + 1)

        url.search = ""

        url.hash = ""

        return url.href
    }

    public get clientLocation() {

        const location = this.clientUrl

        if (!location) return "/"

        const url = new URL(location)

        return `/${url.pathname.slice(url.pathname.lastIndexOf("/") + 1)}${url.search}${url.hash}`
    }

    // The three places, resolved. A client that is a URL has no
    // directory, and a half that was not declared has no place.
    public get serverPath() {

        return this.config.server ? this.place(this.config.server.location) : null
    }

    public get serverEntryPath() {

        const entry = this.config.server?.entryFile

        return entry && this.serverPath ? resolve(this.serverPath, entry) : null
    }

    public get clientPath() {

        return this.config.client && !this.clientUrl ? this.place(this.config.client.location) : null
    }

    public get storagePath() {

        return this.place(this.config.storage, "./storage")
    }

    // One authored source, or none. Hosting owns every derived size and the
    // system-owned default, so neither becomes part of the Program contract.
    public get iconPath() {

        return this.config.icon ? this.place(this.config.icon) : null
    }

    public get agentPath() {

        return this.config.agent ? this.place(this.config.agent) : null
    }

    /** Reads this Program's agent-independent operating documentation. */
    public agent() {

        if (!this.agentPath) return null

        return readFileSync(this.agentPath, "utf-8")
    }

    /** SDK Program record; internal references are consumed by the SDK boundary. */
    public record() {

        const { version, description } = this.config
        const server = this.server
        const client = this.client

        return {

            // Opaque runtime identity for SDK handle canonicalization. Public
            // Program identity may be reused after this Program is forgotten.
            reference: this.reference,

            identity: this.identity,

            name: this.name,

            version: version ?? null,

            description: description ?? null,

            hasAgent: this.agentPath !== null,

            server: server && {

                start: server.start,

                service: server.service
            },

            client: client && {

                start: client.start,

                service: client.service,

                title: client.title ?? null,

                size: client.size ?? null,

                position: client.position ?? null,

                layer: client.layer ?? null,

                minimize: client.minimize ?? null,

                permissions: client.permissions
            }
        }
    }

    private place(declared: string | undefined, fallback = "") {

        const path = declared ?? fallback

        return isAbsolute(path) ? path : resolve(this.root, path)
    }

    // Whether the description is telling the truth. Asked when the
    // system is told to rely on this program — once, while someone is
    // there to be told what they mistyped.
    //
    // Storage is not among it: a program that has kept nothing yet has
    // nowhere for it, and that is not a lie.
    public async validate() {

        const server = this.serverPath

        if (server && !directory(server)) throw new Error(`The server directory is not there: ${server}`)

        const entry = this.serverEntryPath

        if (entry && !file(entry)) throw new Error(`The server worker entry file is not there: ${entry}`)

        if (server && entry && !contained(server, entry)) throw new Error("The server worker entry file leaves its Server directory")

        const client = this.clientPath

        if (client && !directory(client)) throw new Error(`The client directory is not there: ${client}`)

        if (client && !existsSync(resolve(client, "index.html"))) throw new Error(`The client directory has no index.html: ${client}`)

        if (this.iconPath) await validateIcon(this.iconPath)

        if (this.agentPath && !file(this.agentPath)) throw new Error(`The agent documentation is not there: ${this.agentPath}`)

    }

    // Preparing a server half, when it says it needs preparing. Run
    // once, where the half lives, before anything starts it.
    public async installServer(output: InstallOutput = () => undefined) {

        const command = this.config.server?.installCommand

        if (!command) return

        await execute(command, this.serverPath!, output)
    }

    // Cleaning up externally installed resources happens while the installed
    // Server directory still exists, because that directory is the command's
    // declared working environment.
    public async uninstallServer(output: CommandOutput = () => undefined) {

        const command = this.config.server?.uninstallCommand

        if (!command) return

        await execute(command, this.serverPath!, output)
    }
}

function read(path: string): [ProgramConfig, string] {

    const file = isAbsolute(path) ? path : resolve(process.cwd(), path)

    if (!existsSync(file)) throw new Error(`There is no program at ${file}`)

    try { return [JSON.parse(readFileSync(file, "utf-8")) as ProgramConfig, dirname(file)] }

    catch (exception) { throw new Error(`${file} is not valid JSON: ${exception instanceof Error ? exception.message : "unreadable"}`) }
}

// What a description must be for a program to exist at all. Nothing
// here touches a disk: it asks whether the words agree with each other,
// not whether they are true.
function coherent(config: ProgramConfig) {

    // A name is also the name of a directory, so it is checked as a path
    // component before it is anything else — a program calling itself
    // "../../etc" would otherwise be laid out in the system's own files.
    if (typeof config?.identity !== "string" || !kebab.test(config.identity)) throw new Error("A program's identity is kebab-case, because it is also the name of its directory")

    if (!config.server && !config.client) throw new Error("A program must have a server half, a client half, or both")

    for (const field of ["name", "version", "description", "icon", "agent", "storage", "website"] as const) {

        if (config[field] !== undefined && typeof config[field] !== "string") throw new Error(`A program's ${field} must be text`)
    }

    if (config.agent !== undefined && config.agent.trim().length === 0) throw new Error("A program's agent documentation must be a non-empty path")

    if (config.website !== undefined) {

        try { new URL(config.website) }

        catch { throw new Error("A program's website must be a valid URL") }
    }

    for (const [field, maximum] of [["categories", 20], ["keywords", 50]] as const) {

        const values = config[field]

        if (values === undefined) continue

        if (!Array.isArray(values) || values.length > maximum || values.some(value => typeof value !== "string" || value.trim().length === 0 || value.trim().length > 50)) {
            throw new Error(`A program's ${field} must contain at most ${maximum} non-empty values of at most 50 characters`)
        }
    }

    for (const half of ["server", "client"] as const) {

        const declared = config[half]

        if (declared === undefined) continue

        if (typeof declared !== "object" || declared === null || Array.isArray(declared)) throw new Error(`A program's ${half} half must be a declaration`)

        if (typeof declared.location !== "string") throw new Error(`A declared ${half} half must have a location`)

        if (declared.start !== undefined && typeof declared.start !== "boolean") throw new Error(`A declared ${half} endpoint's start default must be true or false`)

        if (declared.service !== undefined && typeof declared.service !== "boolean") throw new Error(`A declared ${half} endpoint's service default must be true or false`)

    }

    if (config.client && /^https?:\/\//i.test(config.client.location)) {

        try { new URL(config.client.location) }

        catch { throw new Error("A client half's URL must be a valid HTTP or HTTPS URL") }
    }

    if (!(config.server && (config.server.start ?? true)) && !(config.client && (config.client.start ?? true))) throw new Error("A Program's default Process must start a server endpoint, a client endpoint, or both")

    if (config.server) execution(config.server)

    if (config.server?.installCommand !== undefined && typeof config.server.installCommand !== "string") throw new Error("A server half's install command must be text")

    if (config.server?.uninstallCommand !== undefined && typeof config.server.uninstallCommand !== "string") throw new Error("A server half's uninstall command must be text")

    if (config.client?.title !== undefined && typeof config.client.title !== "string") throw new Error("A client half's title must be text")

    if (config.client?.minimize !== undefined && typeof config.client.minimize !== "boolean") throw new Error("A client half's minimize default must be true or false")

    for (const [what, value] of [["size", config.client?.size], ["position", config.client?.position]] as const) {

        if (value === undefined) continue

        if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`A window's ${what} must name both of its values`)

        const pair = what === "size" ? [(value as Size).width, (value as Size).height] : [(value as Position).x, (value as Position).y]

        if (!pair.every(isValue)) throw new Error(`A window's ${what} is a finite pixel number or a relative expression such as "50% + 10"`)
    }

    // A layer nobody named is `window`; a layer named wrong is a mistake
    // caught here, rather than at the moment a window has to be put
    // somewhere and there is nowhere to put it.
    if (config.client?.layer !== undefined && !layers.includes(config.client.layer)) throw new Error(`A client half's layer is one of ${layers.join(", ")}`)

    return config
}

type Resolved<Half extends { start?: boolean, service?: boolean }> = Half extends unknown
    ? Omit<Half, "start" | "service"> & { start: boolean, service: boolean }
    : never

function execution(server: { startCommand?: unknown, entryFile?: unknown }) {

    if ((server.startCommand === undefined) === (server.entryFile === undefined)) throw new Error("A server half must declare exactly one startCommand or entryFile")

    if (server.startCommand !== undefined && (typeof server.startCommand !== "string" || server.startCommand.trim().length === 0)) throw new Error("A server half's startCommand must be non-empty text")

    if (server.entryFile !== undefined && (typeof server.entryFile !== "string" || server.entryFile.trim().length === 0 || !containedEntry(server.entryFile))) throw new Error("A server half's entryFile must be a non-empty path inside its Server directory")
}

function containedEntry(entry: string) {

    if (isAbsolute(entry)) return false

    const path = normalize(entry)

    return path !== ".." && !path.startsWith(`..${sep}`)
}

function contained(root: string, path: string) {

    const from = realpathSync(root)

    const to = realpathSync(path)

    const relationship = relative(from, to)

    return relationship !== ".." && !relationship.startsWith(`..${sep}`) && !isAbsolute(relationship)
}

function directory(path: string) {

    return existsSync(path) && statSync(path).isDirectory()
}

function file(path: string) {

    return existsSync(path) && statSync(path).isFile()
}


export type CommandOutput = (chunk: ProgramCommandChunk) => void | Promise<void>

export type InstallOutput = CommandOutput

function execute(command: string, cwd: string, output: CommandOutput) {

    return new Promise<void>(function (settle, refuse) {

        const child = spawn(command, { shell: true, cwd, stdio: ["ignore", "pipe", "pipe"] })

        let delivery = Promise.resolve()

        let failed = false

        const relay = function (stream: NodeJS.ReadableStream, name: ProgramCommandChunk["stream"]) {

            stream.on("data", chunk => {

                stream.pause()

                delivery = delivery.then(() => output({ stream: name, text: String(chunk) }))

                delivery.then(() => stream.resume(), error => {

                    if (failed) return

                    failed = true

                    child.kill()

                    refuse(error)
                })
            })
        }

        relay(child.stdout!, "stdout")

        relay(child.stderr!, "stderr")

        child.on("error", error => {

            if (failed) return

            failed = true

            refuse(error)
        })

        child.on("close", code => delivery.then(() => {

            if (failed) return

            if (code === 0) settle()

            else refuse(new Error(`"${command}" exited with ${code}`))
        }, refuse))
    })
}
