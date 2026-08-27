import { createHash } from "node:crypto"
import { join } from "node:path"

/** Resolve one owner-local address shared by this System and its local CLI. */
export function localAddress(storage: string, channel: string, platform = process.platform) {

    if (platform !== "win32") return join(storage, `${channel}.sock`)

    const owner = storage.replaceAll("\\", "/").replace(/\/+$/, "").toLowerCase()

    const identity = createHash("sha256").update(owner).digest("hex").slice(0, 32)

    return `\\\\.\\pipe\\phreshos-${identity}-${channel}`
}

export default function intakeAddress(storage: string, platform = process.platform) {

    return localAddress(storage, "intake", platform)
}
