import { readdir } from "node:fs/promises"

const directory = new URL("./contracts/", import.meta.url)

for (const file of (await readdir(directory)).filter(file => /\.tsx?$/.test(file)).sort()) {

    await import(new URL(file, directory).href)
}
