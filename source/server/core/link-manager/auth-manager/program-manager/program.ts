import { ClientConfig, isValue, kebab, layers, Position, ProgramConfig, ServerConfig, Size } from "./config"
import { existsSync, readFileSync, statSync } from "node:fs"
import { dirname, isAbsolute, resolve } from "node:path"
import { spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import { validateIcon } from "./icon"

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

    public constructor(source: string | ProgramConfig, root?: string) {

        const [config, where] = typeof source === "string" ? read(source) : [source, process.cwd()]

        this.config = coherent(config)

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
            start: this.config.server.start ?? true
        } : null
    }

    public get client(): Resolved<ClientConfig> | null {

        return this.config.client ? {
            ...this.config.client,
            start: this.config.client.start ?? true
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

    /** Reads the documentation that declares one Endpoint's Service capability. */
    public serviceDocs(endpoint: "server" | "client") {

        const declared = this.config[endpoint]?.serviceDocs

        if (!declared) return null

        return readFileSync(this.place(declared), "utf-8")
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

            server: server && {

                start: server.start,

                hasService: server.serviceDocs !== undefined
            },

            client: client && {

                start: client.start,

                hasService: client.serviceDocs !== undefined,

                title: client.title ?? null,

                size: client.size ?? null,

                position: client.position ?? null,

                layer: client.layer ?? null,

                minimize: client.minimize ?? null
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

        const client = this.clientPath

        if (client && !directory(client)) throw new Error(`The client directory is not there: ${client}`)

        if (client && !existsSync(resolve(client, "index.html"))) throw new Error(`The client directory has no index.html: ${client}`)

        if (this.iconPath) await validateIcon(this.iconPath)

        for (const endpoint of ["server", "client"] as const) {

            const declared = this.config[endpoint]?.serviceDocs

            if (declared && !file(this.place(declared))) throw new Error(`The ${endpoint} service documentation is not there: ${this.place(declared)}`)
        }

    }

    // Preparing a server half, when it says it needs preparing. Run
    // once, where the half lives, before anything starts it.
    public async installServer() {

        const command = this.config.server?.installCommand

        if (!command) return

        await execute(command, this.serverPath!)
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

    for (const field of ["name", "version", "description", "icon", "storage"] as const) {

        if (config[field] !== undefined && typeof config[field] !== "string") throw new Error(`A program's ${field} must be text`)
    }

    for (const half of ["server", "client"] as const) {

        const declared = config[half]

        if (declared === undefined) continue

        if (typeof declared !== "object" || declared === null || Array.isArray(declared)) throw new Error(`A program's ${half} half must be a declaration`)

        if (typeof declared.location !== "string") throw new Error(`A declared ${half} half must have a location`)

        if (declared.start !== undefined && typeof declared.start !== "boolean") throw new Error(`A declared ${half} endpoint's start default must be true or false`)

        if (declared.serviceDocs !== undefined && (typeof declared.serviceDocs !== "string" || declared.serviceDocs.trim().length === 0)) throw new Error(`A declared ${half} endpoint's serviceDocs must be a non-empty path`)
    }

    if (config.client && /^https?:\/\//i.test(config.client.location)) {

        try { new URL(config.client.location) }

        catch { throw new Error("A client half's URL must be a valid HTTP or HTTPS URL") }
    }

    if (!(config.server && (config.server.start ?? true)) && !(config.client && (config.client.start ?? true))) throw new Error("A Program's default Process must start a server endpoint, a client endpoint, or both")

    if (config.server && (typeof config.server.startCommand !== "string" || config.server.startCommand.length === 0)) throw new Error("A server half must declare a start command")

    if (config.server?.installCommand !== undefined && typeof config.server.installCommand !== "string") throw new Error("A server half's install command must be text")

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

type Resolved<Half extends { start?: boolean }> = Omit<Half, "start"> & {
    start: boolean
}

function directory(path: string) {

    return existsSync(path) && statSync(path).isDirectory()
}

function file(path: string) {

    return existsSync(path) && statSync(path).isFile()
}


function execute(command: string, cwd: string) {

    return new Promise<void>(function (settle, refuse) {

        const child = spawn(command, { shell: true, cwd, stdio: "ignore" })

        child.on("error", refuse)

        child.on("exit", code => code === 0 ? settle() : refuse(new Error(`"${command}" exited with ${code}`)))
    })
}
