import assert from "node:assert/strict"
import intakeAddress from "../source/server/view/intake-address.ts"
import { join } from "node:path"

const first = intakeAddress("C:\\Users\\Person\\.phreshos", "win32")

assert.match(first, /^\\\\\.\\pipe\\phreshos-[a-f0-9]{32}-intake$/)

assert.equal(first, intakeAddress("c:/users/person/.phreshos/", "win32"))

assert.notEqual(first, intakeAddress("C:\\Users\\Other\\.phreshos", "win32"))

assert.equal(intakeAddress("/home/person/.phreshos", "linux"), join("/home/person/.phreshos", "intake.sock"))
