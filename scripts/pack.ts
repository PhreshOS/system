import { readFileSync, writeFileSync } from "node:fs"
import { name, version } from "@/package.json"
import { createHash } from "node:crypto"
import { resolve } from "node:path"
import AdmZip from "adm-zip"

const archive = `${name}@${version}.zip`
const zip = new AdmZip()

// Every file the System needs reaches the build through an import.
zip.addLocalFolder(resolve("dist"))

zip.writeZip(resolve(archive))

const checksum = createHash("sha256").update(readFileSync(resolve(archive))).digest("hex")

writeFileSync(resolve(`${archive}.sha256`), `${checksum}  ${archive}\n`)

console.log(`\nPacked ${archive}`)
