import { type Layer, type Position, type Size } from "@phreshos/core"

/**
 * What a program says it is.
 *
 * A definition, and nothing that acts. It arrives either as a
 * `program.json` beside the things it names, or as an object built in
 * code — a program the system owns has no file to be read from.
 *
 * The union is the contract's one hard rule wearing a type: a program
 * has a server half, a client half, or both, and a definition with
 * neither cannot be written down.
 */
export type ProgramConfig = (ProgramConfigBase & { server: ServerConfig, client?: ClientConfig }) | (ProgramConfigBase & { server?: ServerConfig, client: ClientConfig })

interface ProgramConfigBase {

    // What addresses it. Kebab-case, because it is also the name of the
    // directory the system lays the program out in — so it is a path
    // component, and every path component from outside is checked.
    //
    // Never shown. What a person reads is `name`, and keeping the two
    // apart is what every operating system does — an identifier that is
    // also a label ends up being one or the other badly.
    identity: string

    // What a person reads. Free-form, addresses nothing, and absent
    // means the identity serves for both.
    name?: string

    version?: string

    description?: string

    // One PNG source from which hosting derives every standard size. How a
    // Program is shown belongs to the Program rather than its client half — a
    // headless Program is shown too.
    icon?: string

    // Program-specific operating knowledge for agents. Any source path is
    // accepted here; installation canonicalizes it to agent.md.
    agent?: string

    // Optional public catalog information. These values describe a release;
    // they do not affect whether or how the Program runs.
    categories?: string[]

    keywords?: string[]

    website?: string

    // Where it keeps what it keeps. Absent means the system decides.
    storage?: string
}

interface ServerConfigBase {

    // Where this half is. Empty names the program's own root.
    location: string

    // Whether a Process starts this endpoint by default. True when omitted.
    start?: boolean

    // Default service role for each new Server incarnation. False when omitted.
    service?: boolean

    // Run once before the program is first started, in that directory.
    installCommand?: string

    // Run while uninstalling, before the installed files are removed.
    uninstallCommand?: string

}

export type ServerConfig = ServerConfigBase & ({

    // Run an isolated operating-system process through the shell.
    startCommand: string

    entryFile?: never

} | {

    startCommand?: never

    // Load this module as a worker owned by the System.
    entryFile: string
})

export interface ClientConfig {

    // Where this half is: a directory holding index.html, or a URL.
    // Empty names the program's own root. For a URL, its last slash
    // ends the launch root and the remainder is the default location.
    // Not `path`, because a path cannot be a URL and this is one field
    // with both readings — which is what lets a program under
    // development be framed from a live dev server.
    location: string

    // Whether a Process starts this endpoint by default. True when omitted.
    start?: boolean

    // Default service role for each new Client incarnation. False when omitted.
    service?: boolean

    // What its window is called when it opens. The window owns its title
    // from then on and may change it; this is what it is born with, so
    // there is no moment of showing the wrong thing while the half
    // starts. Absent means the program's own name.
    title?: string

    // How its window opens. Absent means the system decides.
    size?: Size

    position?: Position

    // Which of the desktop's three layers its window lives in, and so
    // whether it is a window at all.
    //
    // `window` is one: in the taskbar, wearing the system's chrome,
    // focused by a click before the click reaches the program. The other
    // two are not — no taskbar entry, no paint of any kind, no controls,
    // and no click-catcher — so a program's own content is the whole of
    // what is on the screen. `under` sits below every window and can
    // never rise above one; `over` sits above every window and none can
    // rise above it. The taskbar is above all three.
    //
    // Absent means `window`, said as an absence rather than written down
    // twice: what a definition leaves unsaid, the system decides.
    layer?: Layer

    // Whether its window opens hidden. Absent means shown.
    //
    // A state at birth rather than an act to perform afterwards: a
    // program that opens hidden and shows itself when it is ready has
    // nothing to undo, where one that opens shown and hides itself has
    // already been seen.
    minimize?: boolean
}

export { layers, type Layer, type Position, type Size, type Value } from "@phreshos/core"

// An identity is a directory's name before it is anything else.
export const kebab = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export { isRelativeValue as isValue } from "@phreshos/core"
