import { createHash } from "node:crypto"
import { join } from "node:path"

/** Resolve the owner-local address shared by this System and its local CLI. */
export default function intakeAddress(storage: string, platform = process.platform) {

    if (platform !== "win32") return join(storage, "intake.sock")

    const owner = storage.replaceAll("\\", "/").replace(/\/+$/, "").toLowerCase()

    const identity = createHash("sha256").update(owner).digest("hex").slice(0, 32)

    return `\\\\.\\pipe\\phreshos-${identity}-intake`
}
