import assert from "node:assert/strict"
import { join } from "node:path"
import gatewayAddress from "../source/server/view/gateway/address.ts"

const first = gatewayAddress("C:\\Users\\Person\\.phreshos", "win32")

assert.match(first, /^\\\\\.\\pipe\\phreshos-[a-f0-9]{32}-gateway$/)
assert.equal(first, gatewayAddress("c:/users/person/.phreshos/", "win32"))
assert.notEqual(first, gatewayAddress("C:\\Users\\Other\\.phreshos", "win32"))
assert.equal(gatewayAddress("/home/person/.phreshos", "linux"), join("/home/person/.phreshos", "gateway.sock"))

console.log("gateway address verified")
