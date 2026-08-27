import { localAddress } from "./intake-address"

/** Address the owner-local System control interface. */
export default function controlAddress(storage: string, platform = process.platform) {

    return localAddress(storage, "control", platform)
}
