import { readFileSync, readdirSync, writeFileSync } from "node:fs"
import { name, version } from "@/package.json"
import { createHash } from "node:crypto"
import { resolve } from "node:path"
import AdmZip from "adm-zip"

const archive = `${name}@${version}.zip`
const zip = new AdmZip()

zip.addLocalFolder(resolve("dist"))

// Bundled assets already live in each consumer's build output. Everything
// else retains its filesystem identity and therefore accompanies the build.
for (const asset of readdirSync(resolve("assets"), { withFileTypes: true })) {

    if (asset.name === "bundled" || asset.name.startsWith(".")) continue

    const source = resolve("assets", asset.name)

    if (asset.isDirectory()) zip.addLocalFolder(source, `assets/${asset.name}`)

    else if (asset.isFile()) zip.addLocalFile(source, "assets")
}

zip.writeZip(resolve(archive))

const checksum = createHash("sha256").update(readFileSync(resolve(archive))).digest("hex")

writeFileSync(resolve(`${archive}.sha256`), `${checksum}  ${archive}\n`)

console.log(`\nPacked ${archive}`)
