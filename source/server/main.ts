import { displayName, name, version } from "@/package.json"
import view, { environmentHome, environmentPort } from "./view/view"
import { fileURLToPath } from "node:url"
import { isAbsolute, normalize } from "node:path"
import { readFile, rm } from "node:fs/promises"

const requested = await requestedHome(process.argv)
const home = environmentHome(name, process.env)
    ?? requested
    ?? defaultHome(process.argv)
    ?? fileURLToPath(new URL("../../storage", import.meta.url))

await view({

    name,

    displayName,

    version,

    mode: "production",

    home,

    port: environmentPort(name, process.env) ?? 4300,

    assets: fileURLToPath(new URL("../client", import.meta.url))
})

function defaultHome(arguments_: string[]) {

    const positions = arguments_.flatMap((value, index) => value === "--default-home" ? [index] : [])

    if (positions.length === 0) return undefined
    if (positions.length !== 1) throw new Error("--default-home can be supplied only once")

    const value = arguments_[positions[0]! + 1]

    if (!value || !isAbsolute(value)) throw new Error("--default-home must be followed by an absolute filesystem path")

    return normalize(value)
}

async function requestedHome(arguments_: string[]) {

    const positions = arguments_.flatMap((value, index) => value === "--home-request" ? [index] : [])

    if (positions.length === 0) return undefined
    if (positions.length !== 1) throw new Error("--home-request can be supplied only once")

    const path = arguments_[positions[0]! + 1]

    if (!path || !isAbsolute(path)) throw new Error("--home-request must be followed by an absolute filesystem path")

    let value: string

    try { value = (await readFile(path, "utf8")).trim() }
    catch (error) {

        if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined
        throw error
    }

    await rm(path, { force: true })

    if (!isAbsolute(value)) throw new Error("The requested PhreshOS home must be an absolute filesystem path")

    return normalize(value)
}
