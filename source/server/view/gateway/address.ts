import { createHash } from "node:crypto"
import { join } from "node:path"

/** Resolve the owner-local gateway address for one System home. */
export default function gatewayAddress(home: string, platform = process.platform) {

    if (platform !== "win32") return join(home, "gateway.sock")

    const owner = home.replaceAll("\\", "/").replace(/\/+$/, "").toLowerCase()
    const identity = createHash("sha256").update(owner).digest("hex").slice(0, 32)

    return `\\\\.\\pipe\\phreshos-${identity}-gateway`
}
