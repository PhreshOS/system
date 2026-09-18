import { pathToFileURL } from "node:url"
import type { Plugin } from "vite"

const query = "?worker-thread"
const prefix = "\0worker-thread:"

/** Resolves a module as a separately executable Node Worker entry. */
export default function workerThreadPlugin(): Plugin {

    let building = false

    return {

        name: "worker-thread",
        enforce: "pre",

        configResolved(config) { building = config.command === "build" },

        async resolveId(source, importer) {

            if (!source.endsWith(query)) return

            const resolution = await this.resolve(source.slice(0, -query.length), importer, { skipSelf: true })

            if (!resolution) throw new Error(`Cannot resolve the Worker entry "${source.slice(0, -query.length)}"`)

            return `${prefix}${resolution.id}`
        },

        load(id) {

            if (!id.startsWith(prefix)) return

            const entry = id.slice(prefix.length)

            if (!building) return `export default new URL(${JSON.stringify(pathToFileURL(entry).href)})`

            const reference = this.emitFile({ type: "chunk", id: entry })

            return `export default new URL(import.meta.ROLLUP_FILE_URL_${reference})`
        }
    }
}
